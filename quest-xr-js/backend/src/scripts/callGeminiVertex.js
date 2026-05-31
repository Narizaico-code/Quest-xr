#!/usr/bin/env node

// Script para llamar al modelo Gemini mediante la API REST de Vertex AI con Axios.

import axios from "axios";
import { execSync } from "child_process";
import dotenv from "dotenv";
import path from "path";
// Definir __dirname para ES modules
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  try {
    // Proyecto y modelo configurables vía .env o variables de entorno
    const projectId = process.env.PROJECT_ID;
    const modelId = process.env.MODEL_ID;
    if (!projectId || !modelId) {
      console.error("Debe definir PROJECT_ID y MODEL_ID en el entorno o en .env");
      process.exit(1);
    }

    // Obtener token de acceso de gcloud
    const token = execSync("gcloud auth print-access-token").toString().trim();

    // Endpoint de Vertex AI
    const url = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/google/models/${modelId}:generateContent`;

    // Prompt a enviar (argumentos de línea de comandos)
    const promptText = process.argv.slice(2).join(" ") || "Hola, ¿cómo funciona la IA?";

    // Construir payload
    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: promptText }]
        }
      ]
    };

    // Llamada a la API
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    // Mostrar la respuesta JSON o el contenido generado
    console.log("Respuesta de Gemini (REST):\n", JSON.stringify(response.data, null, 2));

  } catch (err) {
    console.error("Error al llamar a la API REST de Vertex AI:", err.response?.data || err.message);
    process.exit(1);
  }
}

main();
