import { resolveGeminiClientOptions } from "../configs/gemini.config.js";
import { GoogleGenAI } from "@google/genai";

let _aiClient = null;

function getAiClient() {
  if (!_aiClient) {
    const { mode, options } = resolveGeminiClientOptions();
    if (mode === "vertex" && !options.project) {
      throw new Error("GOOGLE_CLOUD_PROJECT is not set for Vertex AI (ADC).");
    }
    if (mode === "developer" && !options.apiKey) {
      throw new Error("GEMINI_API_KEY or GOOGLE_API_KEY is not set.");
    }
    _aiClient = new GoogleGenAI(options);
  }
  return _aiClient;
}

export async function callGeminiGenerateContent({
  model,
  contents,
  systemInstruction,
  generationConfig,
  safetySettings,
}) {
  const ai = getAiClient();
  const config = { ...generationConfig };
  
  if (systemInstruction) {
     config.systemInstruction = systemInstruction.parts[0].text;
  }
  if (safetySettings) {
     config.safetySettings = safetySettings;
  }

  const response = await ai.models.generateContent({
    model,
    contents,
    config,
  });

  if (process.env.DEBUG_GEMINI_RESPONSE === "true") {
    console.log("Gemini raw response:", JSON.stringify(response, null, 2));
  }

  return response;
}

export function extractTextFromGeminiResponse(payload) {
  return payload?.text || "";
}
