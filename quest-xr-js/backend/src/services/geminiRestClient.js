import { resolveGeminiApiKey } from "../configs/gemini.config.js";
import { GoogleGenAI } from "@google/genai";

let _aiClient = null;

function getAiClient() {
  if (!_aiClient) {
    const apiKey = resolveGeminiApiKey();
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
    _aiClient = new GoogleGenAI({ apiKey });
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

  return response;
}

export function extractTextFromGeminiResponse(payload) {
  return payload?.text || "";
}
