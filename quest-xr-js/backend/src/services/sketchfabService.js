import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import {
  SKETCHFAB_API_BASE,
  resolveObjectPipelineConfig,
} from "../configs/objectPipeline.config.js";
import { logError, logWarn } from "../shared/logger.js";

/**
 * Busca en Sketchfab el mejor modelo descargable para `name`.
 * Devuelve { uid, name } o null si no hay resultados / no está configurado.
 *
 * NOTA: los params de búsqueda (downloadable, sort_by, archives_flavours) siguen
 * la Data API v3. Confirmar contra la API real con el token si cambian.
 */
export async function searchModel(name) {
  const { sketchfab } = resolveObjectPipelineConfig();
  if (!sketchfab.enabled) {
    logWarn("SKETCHFAB_API_TOKEN no configurado. Se omite Sketchfab.");
    return null;
  }

  const params = new URLSearchParams({
    type: "models",
    q: name,
    downloadable: "true",
    archives_flavours: "false",
    sort_by: "-likeCount",
    count: String(sketchfab.searchCount),
  });

  const res = await fetch(`${SKETCHFAB_API_BASE}/search?${params.toString()}`, {
    headers: { Authorization: `Token ${sketchfab.token}` },
  });

  if (!res.ok) {
    logError(`Sketchfab search falló (${res.status}): ${await safeText(res)}`);
    return null;
  }

  const json = await res.json();
  const results = Array.isArray(json?.results) ? json.results : [];
  const hit = results.find((m) => m?.isDownloadable && m?.uid);
  if (!hit) return null;
  return { uid: hit.uid, name: hit.name || name };
}

/**
 * Pide el download de un modelo, descarga el ZIP glTF (URL temporal) y lo
 * extrae completo en `${modelDir}/${uid}/`. Devuelve el entryName relativo del
 * archivo .gltf dentro de esa carpeta.
 */
export async function downloadModel(uid) {
  const { sketchfab, hosting } = resolveObjectPipelineConfig();

  const res = await fetch(`${SKETCHFAB_API_BASE}/models/${uid}/download`, {
    headers: { Authorization: `Token ${sketchfab.token}` },
  });
  if (!res.ok) {
    logError(`Sketchfab download falló (${res.status}): ${await safeText(res)}`);
    return null;
  }

  const json = await res.json();
  const gltfUrl = json?.gltf?.url;
  if (!gltfUrl) {
    logError("Sketchfab download sin clave gltf.url.");
    return null;
  }

  // La URL firmada expira ~300s: descargar de inmediato.
  const zipRes = await fetch(gltfUrl);
  if (!zipRes.ok) {
    logError(`Descarga del ZIP glTF falló (${zipRes.status}).`);
    return null;
  }

  const buffer = Buffer.from(await zipRes.arrayBuffer());
  const zip = new AdmZip(buffer);
  const gltfEntry = zip
    .getEntries()
    .find((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith(".gltf"));
  if (!gltfEntry) {
    logError("El ZIP de Sketchfab no contiene un archivo .gltf.");
    return null;
  }

  const destDir = path.join(hosting.modelDir, uid);
  fs.mkdirSync(destDir, { recursive: true });
  zip.extractAllTo(destDir, true);

  return { uid, entryName: gltfEntry.entryName };
}

/**
 * Resuelve `name` a una URL de modelo servible por el backend.
 * Devuelve { source:"sketchfab", url, uid, name } o null.
 */
export async function resolveSketchfab(name) {
  const clean = String(name || "").trim();
  if (!clean) return null;

  const hit = await searchModel(clean);
  if (!hit) return null;

  const downloaded = await downloadModel(hit.uid);
  if (!downloaded) return null;

  const { hosting } = resolveObjectPipelineConfig();
  const relPath = downloaded.entryName
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const url = `${hosting.publicBaseUrl}/models/${downloaded.uid}/${relPath}`;

  return { source: "sketchfab", url, uid: hit.uid, name: hit.name };
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
