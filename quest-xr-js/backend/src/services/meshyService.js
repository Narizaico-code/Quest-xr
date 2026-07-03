import {
  MESHY_API_BASE,
  resolveObjectPipelineConfig,
} from "../configs/objectPipeline.config.js";
import { logError } from "../shared/logger.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function authHeaders() {
  const { meshy } = resolveObjectPipelineConfig();
  return {
    Authorization: `Bearer ${meshy.apiKey}`,
    "Content-Type": "application/json",
  };
}

/** Crea el task de preview (geometría). Devuelve el task_id. */
export async function createPreviewTask(prompt) {
  const { meshy } = resolveObjectPipelineConfig();
  const res = await fetch(`${MESHY_API_BASE}/text-to-3d`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      mode: "preview",
      prompt,
      ai_model: meshy.aiModel,
      target_formats: ["glb"],
    }),
  });
  if (!res.ok) {
    throw new Error(`Meshy preview create ${res.status}: ${await safeText(res)}`);
  }
  const json = await res.json();
  if (!json?.result) throw new Error("Meshy preview sin task id (result).");
  return json.result;
}

/** Crea el task de refine (texturas PBR) a partir del preview. Devuelve el task_id. */
export async function createRefineTask(previewTaskId) {
  const { meshy } = resolveObjectPipelineConfig();
  const res = await fetch(`${MESHY_API_BASE}/text-to-3d`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      mode: "refine",
      preview_task_id: previewTaskId,
      enable_pbr: meshy.enablePbr,
    }),
  });
  if (!res.ok) {
    throw new Error(`Meshy refine create ${res.status}: ${await safeText(res)}`);
  }
  const json = await res.json();
  if (!json?.result) throw new Error("Meshy refine sin task id (result).");
  return json.result;
}

export async function getTask(taskId) {
  const res = await fetch(`${MESHY_API_BASE}/text-to-3d/${taskId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Meshy get task ${res.status}: ${await safeText(res)}`);
  }
  return res.json();
}

/**
 * Hace polling de un task hasta SUCCEEDED. Llama onProgress({ stage, progress,
 * elapsedMs }) en cada intento. Lanza si FAILED/CANCELED o si excede el timeout.
 */
export async function pollTask(taskId, { stage = "", onProgress } = {}) {
  const { polling } = resolveObjectPipelineConfig();
  const startedAt = Date.now();

  for (;;) {
    const task = await getTask(taskId);
    const status = task?.status;

    if (status === "SUCCEEDED") return task;
    if (status === "FAILED" || status === "CANCELED") {
      throw new Error(`Meshy task ${taskId} ${status}: ${task?.task_error?.message || ""}`);
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > polling.timeoutMs) {
      throw new Error(`Meshy task ${taskId} timeout tras ${elapsedMs} ms.`);
    }

    if (onProgress) {
      onProgress({ stage, progress: task?.progress ?? 0, elapsedMs });
    }
    await sleep(polling.intervalMs);
  }
}

/**
 * Pipeline completo preview -> refine. Devuelve { source:"meshy", url } con el
 * .glb del refine (hosteado por Meshy, se pasa directo al frontend).
 */
export async function resolveMeshy(name, { onProgress } = {}) {
  const prompt = String(name || "").trim();

  const previewId = await createPreviewTask(prompt);
  await pollTask(previewId, { stage: "preview", onProgress });

  const refineId = await createRefineTask(previewId);
  const refined = await pollTask(refineId, { stage: "refine", onProgress });

  const glb = refined?.model_urls?.glb;
  if (!glb) throw new Error("Meshy refine sin model_urls.glb.");

  return { source: "meshy", url: glb };
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
