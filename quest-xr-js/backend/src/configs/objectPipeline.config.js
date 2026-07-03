import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKETCHFAB_API_BASE = "https://api.sketchfab.com/v3";
export const MESHY_API_BASE = "https://api.meshy.ai/openapi/v2";
export const DEFAULT_MESHY_AI_MODEL = "meshy-6";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(configDir, "..", "..");

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function isTruthy(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "y", "on"].includes(String(value).toLowerCase());
}

/**
 * Lee la configuración del pipeline de OBJETO desde process.env.
 * IMPORTANTE: llamar en runtime (no en el top-level de un módulo), porque
 * dotenv se carga después de que se resuelven los imports.
 */
export function resolveObjectPipelineConfig() {
  const port = process.env.PORT || 8787;
  const publicBaseUrl = (process.env.MODEL_PUBLIC_BASE_URL || `http://localhost:${port}`)
    .replace(/\/+$/, "");

  const sketchfabToken = process.env.SKETCHFAB_API_TOKEN || "";
  const meshyApiKey = process.env.MESHY_API_KEY || "";

  return {
    sketchfab: {
      token: sketchfabToken,
      enabled: Boolean(sketchfabToken),
      searchCount: toInt(process.env.SKETCHFAB_SEARCH_COUNT, 24),
    },
    meshy: {
      apiKey: meshyApiKey,
      enabled: Boolean(meshyApiKey),
      aiModel: process.env.MESHY_AI_MODEL || DEFAULT_MESHY_AI_MODEL,
      enablePbr: isTruthy(process.env.MESHY_ENABLE_PBR, true),
    },
    hosting: {
      modelDir: process.env.OBJECT_MODEL_DIR
        ? path.resolve(process.env.OBJECT_MODEL_DIR)
        : path.join(backendRoot, ".models-cache"),
      publicBaseUrl,
    },
    polling: {
      intervalMs: toInt(process.env.MESHY_POLL_INTERVAL_MS, 5000),
      timeoutMs: toInt(process.env.MESHY_POLL_TIMEOUT_MS, 300000),
      progressThrottleMs: toInt(process.env.OBJECT_WAIT_PROGRESS_THROTTLE_MS, 30000),
    },
  };
}
