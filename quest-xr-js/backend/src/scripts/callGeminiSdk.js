#!/usr/bin/env node

// Script para llamar al modelo Gemini mediante el SDK de Google Gen AI con Streaming
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { performance } from "perf_hooks";
import { resolveGeminiClientOptions } from "../configs/gemini.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  const model = process.env.MODEL_ID || "gemini-3.1-flash-lite";
  const promptText = process.argv.slice(2).join(" ") || "Hola, ¿cómo estás?";

  const { mode, options } = resolveGeminiClientOptions();
  if (mode === "vertex" && !options.project) {
    console.error("Debe definir GOOGLE_CLOUD_PROJECT en .env para usar Vertex AI (ADC)");
    process.exit(1);
  }
  if (mode === "developer" && !options.apiKey) {
    console.error("Debe definir GEMINI_API_KEY o GOOGLE_API_KEY en .env");
    process.exit(1);
  }

  const ai = new GoogleGenAI(options);

  try {
    console.log("Respuesta de Gemini SDK:\n");
    const startTime = performance.now();
    let firstTokenTime = null;

    // 1. Cambiamos a generateContentStream
    const responseStream = await ai.models.generateContentStream({
      model,
      contents: promptText,
    });

    // 2. Iteramos sobre los fragmentos en tiempo real
    for await (const chunk of responseStream) {
      if (!firstTokenTime) {
        // Captura el tiempo exacto en que llega el primer fragmento
        firstTokenTime = performance.now();
      }
      process.stdout.write(chunk.text || "");
    }

    const totalMs = Math.round(performance.now() - startTime);
    const ttftMs = firstTokenTime ? Math.round(firstTokenTime - startTime) : totalMs;

    console.log("\n\n--- Métricas de Rendimiento ---");
    console.log(`🕒 Tiempo al primer token (TTFT): ${ttftMs} ms`);
    console.log(`🕒 Latencia total de generación: ${totalMs} ms`);

  } catch (err) {
    console.error("Error al llamar al SDK de Gemini:", err);
    process.exit(1);
  }
}

main();
