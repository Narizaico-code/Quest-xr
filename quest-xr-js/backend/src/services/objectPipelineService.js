import { resolveObjectPipelineConfig } from "../configs/objectPipeline.config.js";
import { resolveSketchfab } from "./sketchfabService.js";
import { resolveMeshy } from "./meshyService.js";
import { logError } from "../shared/logger.js";

/**
 * Contexto que se manda a Gemini Live (NO texto fijo hablado al usuario) para que
 * genere con su voz una frase de espera realista antes de arrancar Meshy.
 */
export function buildMeshyWaitContext(name) {
  return `[CONTEXTO: estás generando el objeto '${name}' con IA 3D; el proceso (preview+refine) tarda ~2-3 minutos, más de un minuto. Dile al usuario con tus propias palabras que la creación lleva un rato y que siga esperando, sin inventar que ya está listo.]`;
}

/**
 * Resuelve `objectName` a una URL de modelo cargable.
 * 1) Sketchfab primero (rápido, CC existentes).
 * 2) Fallback a Meshy (async, ~2-3 min) — antes dispara onWaitContext.
 *
 * @param {string} objectName
 * @param {object} cbs
 * @param {(ctx:string)=>void} [cbs.onWaitContext] contexto para Live al caer a Meshy.
 * @param {(p:{stage,progress,elapsedMs})=>void} [cbs.onProgress] avance de Meshy.
 * @returns {Promise<{ok:true, url:string, source:string} | {ok:false, reason:string}>}
 */
export async function resolveObject(objectName, { onWaitContext, onProgress } = {}) {
  const name = String(objectName || "").trim();
  if (!name) return { ok: false, reason: "empty_name" };

  const { sketchfab, meshy } = resolveObjectPipelineConfig();

  // 1) Sketchfab
  if (sketchfab.enabled) {
    try {
      const result = await resolveSketchfab(name);
      if (result?.url) return { ok: true, url: result.url, source: result.source };
    } catch (err) {
      logError("Sketchfab resolve error:", err?.message || err);
    }
  }

  // 2) Meshy fallback
  if (meshy.enabled) {
    if (onWaitContext) onWaitContext(buildMeshyWaitContext(name));
    try {
      const result = await resolveMeshy(name, { onProgress });
      if (result?.url) return { ok: true, url: result.url, source: result.source };
      return { ok: false, reason: "meshy_no_url" };
    } catch (err) {
      logError("Meshy resolve error:", err?.message || err);
      return { ok: false, reason: "meshy_failed" };
    }
  }

  return { ok: false, reason: "no_provider_configured" };
}
