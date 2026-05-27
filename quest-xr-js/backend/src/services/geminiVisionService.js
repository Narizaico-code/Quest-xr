import { DEFAULT_GEMINI_VISION_MODEL } from "../configs/gemini.config.js";
import {
  callGeminiGenerateContent,
  extractTextFromGeminiResponse,
} from "./geminiRestClient.js";

const VISION_SYSTEM_PROMPT = [
  "You analyze images for a VR assistant.",
  "Return ONLY valid JSON:",
  "{\"summary\":\"...\",\"labels\":[{\"label\":\"...\",\"confidence\":0.0,\"notes\":\"...\"}],\"warnings\":[]}",
].join("\n");

export async function analyzeVision({ text, imageBase64, mimeType }) {
  const { data, resolvedMime } = normalizeImageInput(imageBase64, mimeType);
  if (!data) {
    return { summary: "", labels: [], warnings: ["missing_image"] };
  }

  const prompt = buildVisionPrompt(text);
  const model = process.env.GEMINI_VISION_MODEL || DEFAULT_GEMINI_VISION_MODEL;

  const response = await callGeminiGenerateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: resolvedMime, data } },
        ],
      },
    ],
    systemInstruction: { parts: [{ text: VISION_SYSTEM_PROMPT }] },
    generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
  });

  const rawText = extractTextFromGeminiResponse(response);
  const structured = tryParseJson(rawText);
  const normalized = normalizeVisionResult(structured, rawText);

  return {
    ...normalized,
    rawText,
  };
}

function buildVisionPrompt(text) {
  const cleanText = (text || "").trim();
  if (!cleanText) return "Describe the image and identify key objects.";
  return `Answer the user question based on the image: ${cleanText}`;
}

function normalizeImageInput(imageBase64, mimeType) {
  if (!imageBase64) return { data: "", resolvedMime: mimeType || "image/jpeg" };
  const image = String(imageBase64);
  if (image.startsWith("data:")) {
    const match = /^data:([^;]+);base64,/.exec(image);
    const data = image.slice(image.indexOf(",") + 1);
    return {
      data,
      resolvedMime: mimeType || match?.[1] || "image/jpeg",
    };
  }

  return { data: image, resolvedMime: mimeType || "image/jpeg" };
}

function normalizeVisionResult(structured, rawText) {
  if (structured && typeof structured === "object") {
    return {
      summary: structured.summary || rawText || "",
      labels: Array.isArray(structured.labels) ? structured.labels : [],
      warnings: Array.isArray(structured.warnings)
        ? structured.warnings
        : [],
    };
  }

  return {
    summary: rawText || "",
    labels: [],
    warnings: [],
  };
}

function tryParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    const json = extractJsonSubstring(text);
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch (innerErr) {
      return null;
    }
  }
}

function extractJsonSubstring(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}
