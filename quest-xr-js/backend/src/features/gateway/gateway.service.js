import WebSocket from "ws";
import { analyzeVision } from "../../services/geminiVisionService.js";
import { runResearchQuery } from "../../services/geminiProService.js";
import { createGeminiLiveSession } from "../../services/geminiLiveService.js";
import { classifyIntent } from "../../services/ollamaService.js";
import {
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

export function createGatewaySession(questSocket) {
  const liveSession = createGeminiLiveSession({
    onText: (text) => sendQuestAction("VOICE_TEXT", { text }),
    onAudio: (audio) => sendQuestAction("VOICE_AUDIO", audio),
  });

  if (liveSession.isEnabled()) {
    liveSession.connect();
  }

  const sendQuestAction = (action, payload = {}) => {
    if (questSocket.readyState !== WebSocket.OPEN) return;
    questSocket.send(JSON.stringify({ action, ...payload }));
  };

  const handleQuestMessage = async (data) => {
    const payload = parseQuestPayload(data);
    const text = (payload.text || "").trim();
    const imagePayload = normalizeImagePayload(
      payload.image,
      payload.imageMimeType
    );
    const { category, target, latencyMs } = await resolveCategory(
      payload,
      text,
      imagePayload.data
    );
    const targetText = payload.target || target || text;

    if (latencyMs !== undefined) {
      sendQuestAction("UI_LOG", {
        message: `🧠 Cloud Router classified as [${category}] in ${latencyMs}ms | target: "${targetText}" | raw: "${text}"`,
      });
    }

    switch (category) {
      case "OBJETO": {
        sendQuestAction("UI_LOG", {
          message: `📦 Object request: ${targetText}`,
        });
        sendQuestAction("OBJECT_REQUEST", {
          query: targetText,
          target: target || targetText,
          category: "OBJETO",
        });
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
          runVisionPipeline(
            text,
            imagePayload,
            sendQuestAction,
            liveSession
          );
        }, 0);
        break;
      }
      case "CONVERSACION_GENERAL":
      default: {
        if (!liveSession.isEnabled()) {
          sendQuestAction("VOICE_TEXT", {
            text: "Gemini Live is not configured.",
          });
          return;
        }
        if (text) {
          const augmentedText = `[CONTEXTO INTERNO: El usuario se refiere a "${targetText}". Usa esto solo como referencia] ${text}`;
          liveSession.sendText(augmentedText);
        } else if (imagePayload.data && imagePayload.mimeType.startsWith('audio')) {
           // Enviar audio en el payload genérico si se manda como "image" 
           liveSession.sendRawAudio(imagePayload.data);
        }
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

async function resolveCategory(payload, text, hasImage) {
  const hinted = normalizeCategory(payload.intent || payload.mode);
  if (hinted) return { category: hinted, target: payload.target || "", latencyMs: undefined };
  if (!text && hasImage) return { category: "VISION", target: "", latencyMs: undefined };

  const decision = await classifyIntent(text);
  return {
    category:
      normalizeCategory(decision?.categoria) || "CONVERSACION_GENERAL",
    target: decision?.target || "",
    latencyMs: decision?.latencyMs,
  };
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
