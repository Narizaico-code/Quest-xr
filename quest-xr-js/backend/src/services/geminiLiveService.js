import { GoogleGenAI, Modality } from "@google/genai";
import {
  DEFAULT_GEMINI_LIVE_MODEL,
} from "../configs/gemini.config.js";
import { logError, logWarn } from "../shared/logger.js";

const DEFAULT_SYSTEM_PROMPT = `Eres el asistente principal de un entorno inmersivo de Realidad Virtual (WebXR) construido sobre Wonderland Engine.
Tu nombre es "Asistente" o como el usuario quiera llamarte. Tu objetivo es acompañar al usuario de manera amigable, natural y útil. 
En tu entorno, hay sistemas delegados: si el usuario pide ver un modelo 3D o investiga algo denso, otro sistema se encarga de la interfaz gráfica, pero tú sigues siendo la voz y la presencia que guía.
- Responde de forma muy natural, con un tono humano, ameno y servicial.
- Háblame siempre en español nativo a menos que te pidan otro idioma.
- Si el usuario te cuenta sobre lo que ve en las gafas, acompáñalo con curiosidad y empatía.
- Conoces el proyecto actual: es un asistente multimodal que conecta unas Meta Quest 3S a través de Node.js, usando LLMs locales (Qwen) y la nube de Gemini.

IMPORTANTE: El usuario te habla por voz (transcrita a texto). Mantén tus repuestas amigables pero relativamente concisas para no aburrirlo en VR.
`;

export function createGeminiLiveSession({ onText, onAudio, onEvent }) {
  const apiKey = process.env.GEMINI_API_KEY || "";
  const model = process.env.GEMINI_LIVE_MODEL || DEFAULT_GEMINI_LIVE_MODEL;
  const systemPrompt = process.env.GEMINI_LIVE_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;
  
  if (!apiKey) {
    logWarn("GEMINI_API_KEY is not set. Gemini Live will not connect.");
  }

  const ai = new GoogleGenAI({ apiKey });
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
                object_name: { type: "STRING", description: "Nombre del objeto en inglés" }
              }
            }
          }
        ]
      }
    ]
  };

  const connect = async () => {
    if (!apiKey) return;
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
              console.log("🛠️ Gemini Live invocó herramienta:", message.toolCall.functionCalls?.[0]?.name);
              const functionResponses = message.toolCall.functionCalls.map(fc => ({
                id: fc.id,
                name: fc.name,
                response: { result: "Acción delegada exitosamente. Dile al usuario que ya aparece en su entorno." }
              }));
              session.sendToolResponse({ functionResponses });
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
                     mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000'
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

  const sendRawAudio = (base64Audio) => {
     if (!base64Audio || !session || !isReady) return false;
     session.sendRealtimeInput([
        { mimeType: "audio/pcm;rate=16000", data: base64Audio }
     ]);
     return true;
  }

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
    isReady: () => isReady,
    isEnabled: () => Boolean(apiKey),
  };
}
