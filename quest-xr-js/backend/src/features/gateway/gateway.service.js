import WebSocket from "ws";
import { analyzeVision } from "../../services/geminiVisionService.js";
import { runResearchQuery } from "../../services/geminiProService.js";
import { createGeminiLiveSession } from "../../services/geminiLiveService.js";
import { resolveObject } from "../../services/objectPipelineService.js";
import {
  normalizeAudioPayload,
  normalizeImagePayload,
  parseQuestPayload,
} from "./gateway.model.js";
import { logError } from "../../shared/logger.js";

const CATEGORY_ALIASES = {
  OBJETO: "OBJETO",
  OBJECT: "OBJETO",
  INVESTIGAR: "INVESTIGAR",
  RESEARCH: "INVESTIGAR",
  VISION: "VISION",
  VISUAL: "VISION",
  CONVERSACION_GENERAL: "CONVERSACION_GENERAL",
  CONVERSATION_GENERAL: "CONVERSACION_GENERAL",
  CHAT: "CONVERSACION_GENERAL",
  GENERAL: "CONVERSACION_GENERAL",
};

const OBJECT_PROGRESS_THROTTLE_MS = 30000;

export function createGatewaySession(questSocket) {
  let liveSession = null;
  let lastImagePayload = null;
  let pendingVisionToolCall = null;

  const sendQuestAction = (action, payload = {}) => {
    if (questSocket.readyState !== WebSocket.OPEN) return;
    questSocket.send(JSON.stringify({ action, ...payload }));
  };

  // Resuelve object_name -> URL (Sketchfab/Meshy) de forma async y emite
  // OBJECT_SPAWN. Las frases de espera/cierre salen SOLO como contexto para Live
  // (liveSession.sendText), nunca como texto fijo hablado al usuario.
  const resolveAndSpawnObject = (objectName) => {
    const name = String(objectName || "").trim();
    if (!name) return;

    sendQuestAction("UI_LOG", { message: `📦 Resolviendo objeto: ${name}` });

    let lastProgressAt = 0;
    const onWaitContext = (ctx) => {
      liveSession.sendText(ctx);
    };
    const onProgress = ({ stage, progress, elapsedMs }) => {
      const now = Date.now();
      if (now - lastProgressAt < OBJECT_PROGRESS_THROTTLE_MS) return;
      lastProgressAt = now;
      const secs = Math.round(elapsedMs / 1000);
      liveSession.sendText(
        `[CONTEXTO: sigues generando '${name}', etapa ${stage}, ~${progress}%, ya van ~${secs}s. Si el usuario pregunta, dile con tus palabras que aún está en proceso.]`
      );
    };

    resolveObject(name, { onWaitContext, onProgress })
      .then((result) => {
        if (result.ok) {
          sendQuestAction("OBJECT_SPAWN", {
            url: result.url,
            modelUrl: result.url,
            source: result.source,
            query: name,
          });
          liveSession.sendText(
            `[CONTEXTO: el objeto '${name}' ya apareció en la escena del usuario. Confírmaselo de forma natural y breve.]`
          );
        } else {
          liveSession.sendText(
            `[CONTEXTO: no se pudo crear el objeto '${name}' (motivo: ${result.reason}). Explícaselo al usuario con tus palabras y ofrece intentar con otro objeto.]`
          );
        }
      })
      .catch((err) => {
        logError("Object pipeline error:", err?.message || err);
        liveSession.sendText(
          `[CONTEXTO: hubo un error técnico creando el objeto '${name}'. Discúlpate brevemente con el usuario.]`
        );
      });
  };

  const handleToolCall = async (toolCall) => {
    const functionCalls = toolCall?.functionCalls || [];
    if (!functionCalls.length) return;

    const functionResponses = [];

    for (const call of functionCalls) {
      const args = parseToolArgs(call.args ?? call.arguments);

      if (call.name === "spawn_3d_object") {
        const objectName = String(
          args.object_name || args.name || args.object || ""
        ).trim();

        if (!objectName) {
          functionResponses.push({
            id: call.id,
            name: call.name,
            response: { error: "object_name_required" },
          });
          continue;
        }

        sendQuestAction("UI_LOG", {
          message: `🛠️ Tool spawn_3d_object -> ${objectName}`,
        });

        // Resolución async (Sketchfab/Meshy). Respondemos la tool call de
        // inmediato para no exceder el timeout de Live; OBJECT_SPAWN y el
        // contexto de cierre salen cuando termine el pipeline.
        resolveAndSpawnObject(objectName);

        functionResponses.push({
          id: call.id,
          name: call.name,
          response: {
            result: "object_generation_started",
            object_name: objectName,
          },
        });
        continue;
      }

      if (call.name === "request_vision_snapshot") {
        const question = String(args.question || args.text || "").trim();

        if (!lastImagePayload?.data) {
          pendingVisionToolCall = call;
          sendQuestAction("UI_LOG", {
            message: "📸 Tool request_vision_snapshot -> requesting snapshot",
          });
          sendQuestAction("REQUEST_VISION_SNAPSHOT", {
            reason: "no_snapshot",
            question,
          });
          functionResponses.push({
            id: call.id,
            name: call.name,
            response: { result: "snapshot_requested" },
          });
          continue;
        }

        sendQuestAction("UI_LOG", {
          message: "👁️ Tool request_vision_snapshot -> analyzing latest snapshot",
        });

        try {
          const result = await analyzeVision({
            text: question,
            imageBase64: lastImagePayload.data,
            mimeType: lastImagePayload.mimeType,
          });

          sendQuestAction("VISION_RESULT", {
            summary: result.summary,
            labels: result.labels,
            warnings: result.warnings,
          });

          functionResponses.push({
            id: call.id,
            name: call.name,
            response: {
              summary: result.summary || "",
              labels: result.labels || [],
              warnings: result.warnings || [],
            },
          });
        } catch (err) {
          logError("Vision tool error:", err?.message || err);
          functionResponses.push({
            id: call.id,
            name: call.name,
            response: { error: "vision_failed" },
          });
        }
        continue;
      }

      sendQuestAction("UI_LOG", {
        message: `⚠️ Unknown tool call: ${call.name}`,
      });
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: { error: "unknown_tool" },
      });
    }

    if (functionResponses.length && liveSession?.sendToolResponse) {
      const ok = liveSession.sendToolResponse(functionResponses);
      if (!ok) {
        logError("Failed to send tool responses to Gemini Live.");
      }
    }
  };

  liveSession = createGeminiLiveSession({
    onText: (text) => sendQuestAction("VOICE_TEXT", { text }),
    onAudio: (audio) => sendQuestAction("VOICE_AUDIO", audio),
    onToolCall: (toolCall) => {
      handleToolCall(toolCall).catch((err) => {
        logError("Tool call handler error:", err?.message || err);
      });
    },
  });

  if (liveSession.isEnabled()) {
    liveSession.connect();
  }

  const routeToLive = (text, audioPayload, imagePayload) => {
    if (!liveSession.isEnabled()) {
      sendQuestAction("VOICE_TEXT", { text: "Gemini Live is not configured." });
      return;
    }

    if (text) {
      liveSession.sendText(text);
    }

    if (audioPayload?.data) {
      liveSession.sendRawAudio(
        audioPayload.data,
        audioPayload.mimeType || "audio/pcm;rate=16000"
      );
    }

    if (!text && !audioPayload?.data && imagePayload?.data) {
      sendQuestAction("UI_LOG", {
        message: "📸 Imagen recibida. Esperando solicitud de vision desde Live.",
      });
      liveSession.sendText(
        "El usuario envio una imagen. Si necesitas analizarla usa request_vision_snapshot."
      );
    }
  };

  const handleQuestMessage = async (data) => {
    const payload = parseQuestPayload(data);
    const text = (payload.text || "").trim();
    const imagePayload = normalizeImagePayload(
      payload.image,
      payload.imageMimeType
    );
    const audioPayload = normalizeAudioPayload(
      payload.audio,
      payload.audioMimeType
    );
    const audioFromImage =
      !audioPayload.data &&
      imagePayload.data &&
      imagePayload.mimeType?.startsWith("audio")
        ? { data: imagePayload.data, mimeType: imagePayload.mimeType }
        : null;

    let resolvedAudio = audioPayload.data
      ? { ...audioPayload }
      : audioFromImage;

    if (
      resolvedAudio?.data &&
      payload.audioSampleRate &&
      resolvedAudio.mimeType &&
      !resolvedAudio.mimeType.includes("rate=")
    ) {
      resolvedAudio.mimeType = `${resolvedAudio.mimeType};rate=${payload.audioSampleRate}`;
    }

    const hasImage =
      Boolean(imagePayload.data) &&
      !imagePayload.mimeType?.startsWith("audio");

    if (hasImage) {
      lastImagePayload = imagePayload;
      if (pendingVisionToolCall) {
        const call = pendingVisionToolCall;
        pendingVisionToolCall = null;
        const args = parseToolArgs(call.args ?? call.arguments);
        const question = String(args.question || args.text || "").trim();

        sendQuestAction("UI_LOG", {
          message: "👁️ Fulfilling pending vision snapshot",
        });

        try {
          const result = await analyzeVision({
            text: question,
            imageBase64: lastImagePayload.data,
            mimeType: lastImagePayload.mimeType,
          });

          sendQuestAction("VISION_RESULT", {
            summary: result.summary,
            labels: result.labels,
            warnings: result.warnings,
          });

          if (liveSession?.sendToolResponse) {
            liveSession.sendToolResponse([
              {
                id: call.id,
                name: call.name,
                response: {
                  summary: result.summary || "",
                  labels: result.labels || [],
                  warnings: result.warnings || [],
                },
              },
            ]);
          }
        } catch (err) {
          logError("Vision tool error:", err?.message || err);
          if (liveSession?.sendToolResponse) {
            liveSession.sendToolResponse([
              {
                id: call.id,
                name: call.name,
                response: { error: "vision_failed" },
              },
            ]);
          }
        }
      }
    }

    const explicitCategory = normalizeCategory(payload.intent || payload.mode);
    const targetText = payload.target || text;

    if (!explicitCategory) {
      routeToLive(text, resolvedAudio, hasImage ? imagePayload : null);
      return;
    }

    sendQuestAction("UI_LOG", {
      message: `🧭 Explicit mode: ${explicitCategory} | target: "${targetText}"`,
    });

    switch (explicitCategory) {
      case "OBJETO": {
        resolveAndSpawnObject(targetText);
        break;
      }
      case "INVESTIGAR": {
        sendQuestAction("UI_LOG", {
          message: `🔍 Researching: ${targetText}`,
        });
        setTimeout(() => {
          runResearchPipeline(targetText, sendQuestAction, liveSession);
        }, 0);
        break;
      }
      case "VISION": {
        sendQuestAction("UI_LOG", { message: "👁️ Analyzing vision." });
        setTimeout(() => {
          const visionPayload = hasImage ? imagePayload : lastImagePayload;
          runVisionPipeline(
            text,
            visionPayload || { data: "", mimeType: "" },
            sendQuestAction,
            liveSession
          );
        }, 0);
        break;
      }
      case "CONVERSACION_GENERAL":
      default: {
        const augmentedText = text
          ? `[CONTEXTO INTERNO: El usuario se refiere a "${targetText}". Usa esto solo como referencia] ${text}`
          : "";
        routeToLive(augmentedText, resolvedAudio, hasImage ? imagePayload : null);
      }
    }
  };

  questSocket.on("message", (data) => {
    handleQuestMessage(data).catch((err) => {
      logError("Gateway message error:", err?.message || err);
    });
  });

  questSocket.on("close", () => {
    liveSession.close();
  });

  questSocket.on("error", (err) => {
    logError("Quest socket error:", err?.message || err);
  });
}

function parseToolArgs(args) {
  if (!args) return {};
  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch (err) {
      return {};
    }
  }
  if (typeof args === "object") return args;
  return {};
}

function normalizeCategory(value) {
  if (!value) return null;
  const key = String(value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
  return CATEGORY_ALIASES[key] || null;
}

async function runVisionPipeline(text, imagePayload, sendQuestAction, liveSession) {
  if (!imagePayload?.data) {
    sendQuestAction("VOICE_TEXT", {
      text: "No image payload received for vision request.",
    });
    return;
  }

  try {
    const result = await analyzeVision({
      text,
      imageBase64: imagePayload.data,
      mimeType: imagePayload.mimeType,
    });

    sendQuestAction("VISION_RESULT", {
      summary: result.summary,
      labels: result.labels,
      warnings: result.warnings,
    });

    if (result.summary && liveSession.isEnabled()) {
      liveSession.sendText(`Summarize this for the user: ${result.summary}`);
    }
  } catch (err) {
    logError("Vision pipeline error:", err?.message || err);
    sendQuestAction("VOICE_TEXT", {
      text: "Vision analysis failed.",
    });
  }
}

async function runResearchPipeline(text, sendQuestAction, liveSession) {
  try {
    const result = await runResearchQuery(text);
    sendQuestAction("UI_TREE", { tree: result.tree });

    if (result.summary && liveSession.isEnabled()) {
      liveSession.sendText(`Summarize: ${result.summary}`);
    }
  } catch (err) {
    logError("Research pipeline error:", err?.message || err);
    sendQuestAction("VOICE_TEXT", {
      text: "Research pipeline failed.",
    });
  }
}
