import { DEFAULT_GEMINI_PRO_MODEL } from "../configs/gemini.config.js";
import {
  callGeminiGenerateContent,
  extractTextFromGeminiResponse,
} from "./geminiRestClient.js";

const RESEARCH_SYSTEM_PROMPT = [
  "You build structured research summaries for a 3D UI.",
  "Return ONLY valid JSON:",
  "{\"title\":\"...\",\"summary\":\"...\",\"sections\":[{\"title\":\"...\",\"bullets\":[\"...\"],\"sections\":[]}]}",
].join("\n");

export async function runResearchQuery(query) {
  const cleanQuery = (query || "").trim();
  if (!cleanQuery) {
    return {
      tree: { title: "Research", summary: "", sections: [] },
      summary: "",
      rawText: "",
    };
  }

  const model = process.env.GEMINI_PRO_MODEL || DEFAULT_GEMINI_PRO_MODEL;
  const response = await callGeminiGenerateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [{ text: buildResearchPrompt(cleanQuery) }],
      },
    ],
    systemInstruction: { parts: [{ text: RESEARCH_SYSTEM_PROMPT }] },
    generationConfig: { temperature: 0.2, maxOutputTokens: 5000 },
  });

  const rawText = extractTextFromGeminiResponse(response);
  const structured = tryParseJson(rawText);
  const tree = normalizeResearchTree(structured, cleanQuery, rawText);

  return {
    tree,
    summary: tree.summary || "",
    rawText,
  };
}

function buildResearchPrompt(query) {
  return [
    `Topic: ${query}`,
    "Provide a structured tree with short bullets.",
  ].join("\n");
}

function normalizeResearchTree(structured, query, rawText) {
  if (structured && typeof structured === "object") {
    return {
      title: structured.title || query || "Research",
      summary: structured.summary || "",
      sections: Array.isArray(structured.sections) ? structured.sections : [],
    };
  }

  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const summary = lines[0] || "";
  const bullets = lines.slice(1, 10);

  return {
    title: query || "Research",
    summary,
    sections: bullets.length
      ? [{ title: "Details", bullets, sections: [] }]
      : [],
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
