// prueba-object.js — repro manual del pipeline de OBJETO.
// Uso: node test/prueba-object.js "chair"
//      node test/prueba-object.js "a fantastical dragon teapot"
import "dotenv/config";
import { resolveObject } from "../src/services/objectPipelineService.js";
import { resolveObjectPipelineConfig } from "../src/configs/objectPipeline.config.js";

async function run() {
  const name = process.argv.slice(2).join(" ") || "chair";
  const { sketchfab, meshy, hosting } = resolveObjectPipelineConfig();

  console.log(`Objeto: "${name}"`);
  console.log(
    `Config -> sketchfab:${sketchfab.enabled ? "on" : "off"} meshy:${meshy.enabled ? "on" : "off"} baseUrl:${hosting.publicBaseUrl}`
  );
  if (!sketchfab.enabled && !meshy.enabled) {
    console.log("⚠️  Ningún proveedor configurado (falta SKETCHFAB_API_TOKEN y/o MESHY_API_KEY).");
  }

  const startedAt = Date.now();
  const result = await resolveObject(name, {
    onWaitContext: (ctx) => console.log(`\n[wait→Live] ${ctx}\n`),
    onProgress: ({ stage, progress, elapsedMs }) =>
      console.log(`  ...${stage} ${progress}% (${Math.round(elapsedMs / 1000)}s)`),
  });

  const total = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\nResultado (${total}s):`);
  console.log(JSON.stringify(result, null, 2));
}

run().catch((err) => {
  console.error("Fallo:", err);
  process.exit(1);
});
