import { GoogleGenAI, Modality } from "@google/genai";
import {
  DEFAULT_GEMINI_LIVE_MODEL,
  resolveGeminiClientOptions,
} from "../configs/gemini.config.js";
import { logError, logWarn } from "../shared/logger.js";

const DEFAULT_SYSTEM_PROMPT = `Eres "Asistente", la voz principal de un sistema VR (WebXR) sobre Wonderland Engine.
Contexto del proyecto:
- Cliente: Meta Quest 3S + navegador Oculus.
- Backend: Node.js con WebSocket.
- Enrutamiento local: Qwen clasifica en OBJETO/INVESTIGAR/VISION/CONVERSACION_GENERAL.
- OBJETO: pipeline 3D (Sketchfab/Meshy).
- INVESTIGAR: Gemini Pro/Flash-Thinking (REST).
- VISION: captura de frame + Gemini Vision (REST).
- Conversación general: Gemini Live (tú).

Tu rol: conversar, acompañar y coordinar; usa herramientas cuando apliquen.
Habla siempre en español natural (salvo que el usuario pida otro idioma).
Respuestas humanas, amables y concisas para VR.`;

export function createGeminiLiveSession({ onText, onAudio, onEvent, onToolCall }) {
  const { mode, options } = resolveGeminiClientOptions();
  const model = process.env.GEMINI_LIVE_MODEL || DEFAULT_GEMINI_LIVE_MODEL;
  const systemPrompt = process.env.GEMINI_LIVE_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;

  const isConfigured =
    mode === "vertex" ? Boolean(options.project) : Boolean(options.apiKey);

  if (!isConfigured) {
    const message =
      mode === "vertex"
        ? "GOOGLE_CLOUD_PROJECT is not set. Gemini Live will not connect."
        : "GEMINI_API_KEY or GOOGLE_API_KEY is not set. Gemini Live will not connect.";
    logWarn(message);
  }

  const ai = isConfigured ? new GoogleGenAI(options) : null;
  let session = null;
  let isReady = false;

  const config = {
    responseModalities: [Modality.AUDIO],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    temperature: 0.5,
    // Retener la sesión al máximo usando compresión
    contextWindowCompression: { slidingWindow: {} },
    tools: [
      { googleSearch: {} },
      {
        functionDeclarations: [
          {
            name: "spawn_3d_object",
            description: "Úsalo cuando el usuario te pida explícitamente generar un objeto en VR, como 'haz aparecer una mesa' o 'quiero un coche'.",
            parameters: {
              type: "OBJECT",
              properties: {
                object_name: {
                  type: "STRING",
                  description: "Nombre del objeto en inglés",
                },
              },
              required: ["object_name"],
            },
          },
          {
            name: "request_vision_snapshot",
            description: "Solicita un snapshot del entorno para responder preguntas visuales del usuario.",
            parameters: {
              type: "OBJECT",
              properties: {
                question: {
                  type: "STRING",
                  description: "Pregunta o contexto visual a responder.",
                },
              },
            },
          },
        ],
      },
    ],
  };

  const connect = async () => {
    if (!isConfigured || !ai) return;
    try {
      console.log(`🔌 Conectando a Gemini Live usando SDK: ${model}`);
      session = await ai.live.connect({
        model,
        config,
        callbacks: {
          onopen: () => {
            console.log("🟢 Conexión abierta con Gemini Live (SDK).");
            isReady = true;
          },
          onmessage: (message) => {
            if (onEvent) onEvent(message);

            if (message.toolCall) {
              if (onToolCall) {
                onToolCall(message.toolCall);
              }
              return;
            }

            const serverContent = message.serverContent;
            if (!serverContent) return;

            const modelTurn = serverContent.modelTurn;
            if (modelTurn && modelTurn.parts) {
              for (const part of modelTurn.parts) {
                if (part.text) {
                  onText && onText(part.text);
                }
                if (part.inlineData) {
                  // SDK proporciona base64 en data
                  onAudio && onAudio({
                    data: part.inlineData.data,
                    mimeType: part.inlineData.mimeType || "audio/pcm;rate=24000",
                  });
                }
              }
            }
          },
          onerror: (err) => {
            console.error("❌ Error en el socket de Gemini Live (SDK):", err?.message || err);
          },
          onclose: (e) => {
            isReady = false;
            console.warn(`🔴 Conexión de Gemini Live CERRADA. Razón: ${e?.reason || "Sin especificar"}`);
          }
        }
      });
    } catch (err) {
      console.error("❌ Falló la conexión inicial de Gemini Live (SDK):", err);
    }
  };

  const sendText = (text) => {
    if (!text || !session || !isReady) return false;
    session.sendClientContent([{ text }]);
    return true;
  };

  const sendRawAudio = (base64Audio, mimeType = "audio/pcm;rate=16000") => {
    if (!base64Audio || !session || !isReady) return false;
    session.sendRealtimeInput([
      { mimeType, data: base64Audio }
    ]);
    return true;
  };

  const sendToolResponse = (functionResponses) => {
    if (!session || !isReady) return false;
    if (!Array.isArray(functionResponses) || functionResponses.length === 0) return false;
    session.sendToolResponse({ functionResponses });
    return true;
  };

  const close = () => {
    if (session) {
       session.close();
    }
    isReady = false;
  };

  return {
    connect,
    close,
    sendText,
    sendRawAudio,
    sendToolResponse,
    isReady: () => isReady,
    isEnabled: () => isConfigured,
  };
}
