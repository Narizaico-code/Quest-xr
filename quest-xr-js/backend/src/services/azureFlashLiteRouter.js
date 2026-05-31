import OpenAI from "openai";
import { performance } from "node:perf_hooks";
import "dotenv/config";

const DEFAULT_SYSTEM_PROMPT = `
Eres un clasificador de intenciones experto. Tu único objetivo es leer el texto del usuario y clasificarlo estrictamente en una de las siguientes cuatro categorías.

1. "OBJETO": SOLO si el usuario pide explícitamente generar, mostrar, crear, invocar o materializar un objeto 3D o modelo físico en su entorno (ejemplo: "haz aparecer una mesa", "quiero ver una espada").
2. "INVESTIGAR": SOLO si el usuario hace peticiones académicas, solicita información extensa, resúmenes históricos o datos muy detallados que requieren investigación profunda.
3. "VISION": SOLO si el usuario hace una consulta sobre su entorno físico REAL, pregunta qué está mirando con sus propios ojos, o hace preguntas sobre algo que sostiene físicamente en su mano ("¿qué es esto que tengo?", "¿qué ves aquí?"). NO USES ESTA CATEGORÍA PARA NOTICIAS O BÚSQUEDAS WEB.
4. "CONVERSACION_GENERAL": Usa esta categoría para todo lo demás: charlas, saludos, peticiones de noticias recientes, búsquedas en internet, preguntas lógicas, o si el usuario pide cosas de actualidad ("dame las noticias", "quién ganó el partido").

REGLA ABSOLUTA: El "target" debe ser la idea principal extraída del usuario. JAMÁS inventes cosas que el usuario no ha dicho.

Formato requerido OBLIGATORIO:
{"categoria": "CATEGORIA", "target": "sujeto principal de la oracion del usuario"}
`;

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT;
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2026-03-17";

let cachedClient = null;

function getClient() {
  if (cachedClient) return cachedClient;
  if (!endpoint) throw new Error("AZURE_OPENAI_ENDPOINT is not set.");
  if (!apiKey) throw new Error("AZURE_OPENAI_API_KEY is not set.");
  if (!deploymentName) throw new Error("AZURE_OPENAI_DEPLOYMENT is not set.");

              // Use full endpoint (should end in /openai/v1)
            // Use endpoint root; SDK will prepend deployments path automatically when model is set
      cachedClient = new OpenAI({
    baseURL: endpoint,
    apiKey
  });

  return cachedClient;
}

export async function classifyIntentAzure(text) {
  const payloadText = (text || "").trim();
  if (!payloadText) {
    return { categoria: "CONVERSACION_GENERAL", target: "", latencyMs: 0 };
  }

  const client = getClient();
  const startTime = performance.now();

  try {
    const response = await client.chat.completions.create({
      model: deploymentName,
      messages: [
        { role: "system", content: DEFAULT_SYSTEM_PROMPT },
        { role: "user", content: payloadText },
      ]
    });

    const latencyMs = Math.round(performance.now() - startTime);
    const content = response?.choices?.[0]?.message?.content || "";
    console.log(`🤖 Azure OpenAI raw output: "${content.trim()}"`);

    const parsed = tryParseJson(content);
    if (parsed && parsed.categoria) {
      let cleanTarget = "";
      if (typeof parsed.target === "string") {
        cleanTarget = parsed.target;
      } else if (parsed.target && typeof parsed.target === "object") {
        cleanTarget = parsed.target.objeto || parsed.target.name || parsed.target.target || JSON.stringify(parsed.target);
      }
      return {
        categoria: parsed.categoria,
        target: cleanTarget,
        latencyMs,
      };
    }

    return { categoria: "CONVERSACION_GENERAL", target: "", latencyMs };
  } catch (error) {
    console.error("Error en Azure OpenAI:", error);
    const latencyMs = Math.round(performance.now() - startTime);
    return { categoria: "CONVERSACION_GENERAL", target: "", latencyMs };
  }
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

// CLI entrypoint: run "node azureFlashLiteRouter.js <prompt>" for speed tests
async function main() {
  const prompt = process.argv.slice(2).join(" ");
  if (!prompt) {
    console.error("Usage: node azureFlashLiteRouter.js <prompt text>");
    process.exit(1);
  }
  const result = await classifyIntentAzure(prompt);
  console.log(JSON.stringify(result, null, 2));
}

// If script is run directly, invoke main()
if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(err => { console.error(err); process.exit(1); });
}
