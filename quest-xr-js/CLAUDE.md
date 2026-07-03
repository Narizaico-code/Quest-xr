# Quest-XR — Asistente IA multimodal para WebXR (Wonderland Engine + Gemini)

## Qué es esto
Asistente conversacional en VR para Meta Quest 3S, corriendo sobre Wonderland Engine (WebXR)
en el cliente y un backend Node.js (WebSocket) como intermediario hacia Gemini.
El usuario habla o muestra objetos por cámara; el sistema responde por voz, spawnea objetos 3D
o hace investigación profunda, según la intención detectada.

## ⚠️ REGLA #1: La arquitectura real vive en el código, no en Proyecto.md
`Proyecto.md` describe una versión antigua del diseño (clasificador local con Ollama + Llama 3.2).
**Esa versión ya no es la que corre.** La arquitectura actual:

- El enrutamiento de intención NO pasa por un clasificador local. Gemini Live decide vía
  *function calling* (`spawn_3d_object`, `request_vision_snapshot`) o el frontend manda un
  `mode` explícito (`OBJETO`, `INVESTIGAR`, `VISION`, `CONVERSACION_GENERAL`) en el payload.
- `ollamaService.js` **no usa Ollama** — llama a Gemini Flash-Lite. El nombre es engañoso,
  tratarlo como legacy hasta que se renombre.
- No asumas la arquitectura de `Proyecto.md` como fuente de verdad para el routing. Si hay
  conflicto entre el doc y `gateway.service.js`, el código manda.

## Stack (verificar versión antes de sugerir cambios)
- Backend: Node.js, ESM (`type: module`), `ws` para WebSocket, `@google/genai` (SDK nuevo, NO
  `@google/generative-ai` que está deprecado), `dotenv`, `openai` (solo usado por rutas Azure,
  ver sección de archivos muertos).
- Frontend: Wonderland Engine (`@wonderlandengine/api`, `@wonderlandengine/components`,
  `@wonderlandengine/spatial-audio`). Arquitectura ECS. Compila a Wasm.
- IA: Gemini Live (voz en tiempo real, function calling), Gemini Pro (investigación),
  Gemini Vision (análisis de imagen). Modelos actuales en `configs/gemini.config.js`:
  verifica siempre en la doc oficial de Gemini API antes de cambiar estos IDs — no los
  inventes ni asumas que siguen vigentes sin comprobarlo.

## Decisiones ya tomadas (ejecutar, no volver a preguntar)
- `services/azureFlashLiteRouter.js` y `services/llamarAzureOpenAI.js` NO se usan y deben
  eliminarse por completo (no comentar, no dejar como legacy — borrar el archivo).
- `services/ollamaService.js` debe renombrarse a `services/geminiRouterService.js` (o similar
  que refleje que llama a Gemini Flash-Lite, no a Ollama). El export interno `classifyIntent`
  puede mantenerse igual, solo cambia el nombre del archivo y su import donde se use.
- Después de borrar/renombrar, busca en todo el proyecto (`grep`/búsqueda global) cualquier
  import que referencie estos archivos por su ruta o nombre viejo y actualízalo. No dejes
  imports rotos.
- El paquete `openai` en `package.json` solo se usaba por los archivos de Azure — si ya no
  hay ningún import que lo use, quítalo también de las dependencias.

## Flujo real de una petición del Quest
1. `js/gateway-client.js` (Wonderland Engine) manda JSON por WebSocket: `{text, image?, audio?, mode?}`.
2. `gateway.routes.js` acepta la conexión → `gateway.controller.js` → `gateway.service.js`.
3. Si no hay `mode` explícito, todo va a Gemini Live (`geminiLiveService.js`), que decide con
   function calling si necesita spawnear objeto o pedir snapshot de visión.
4. Si hay `mode` explícito (`OBJETO`/`INVESTIGAR`/`VISION`), se enruta directo sin pasar por Live.
5. Respuestas vuelven como `{action, ...}` — acciones conocidas: `VOICE_TEXT`, `VOICE_AUDIO`,
   `UI_LOG`, `UI_TREE`, `VISION_RESULT`, `OBJECT_REQUEST`, `OBJECT_SPAWN`.

## Pipeline de OBJETO (Sketchfab + Meshy → OBJECT_SPAWN)
- Orquestador: `services/objectPipelineService.js` (`resolveObject(name, {onWaitContext,onProgress})`).
  Sketchfab primero (`sketchfabService.js`), fallback Meshy (`meshyService.js`). Config en
  `configs/objectPipeline.config.js`.
- `OBJECT_SPAWN` payload: `{ url, modelUrl, source: "sketchfab"|"meshy", query }`. El frontend
  carga `url || modelUrl` vía `mesh-spawner` (Wonderland `loadGLTF` acepta `.gltf` y `.glb`).
- Sketchfab entrega un ZIP glTF (no GLB): el backend lo extrae a `OBJECT_MODEL_DIR/<uid>/` y
  sirve la carpeta completa por la ruta estática `GET /models/<uid>/*` (en el mismo `http.Server`
  del WS, puerto `PORT`). `MODEL_PUBLIC_BASE_URL` DEBE ser la URL HTTPS de ngrok (no localhost/LAN)
  o el Quest bloquea el modelo por mixed-content (WebXR corre sobre HTTPS). Meshy pasa su `.glb`
  hosteado directo (pass-through).
- Frase de espera/avance/cierre: SIEMPRE como contexto para Live (`sendText`), nunca texto fijo.
- Env vars: `SKETCHFAB_API_TOKEN`, `MESHY_API_KEY`, `MESHY_AI_MODEL` (def `meshy-6`),
  `MESHY_ENABLE_PBR` (def true), `OBJECT_MODEL_DIR` (def `backend/.models-cache`),
  `MODEL_PUBLIC_BASE_URL` (URL ngrok), `SKETCHFAB_SEARCH_COUNT`, `MESHY_POLL_INTERVAL_MS`,
  `MESHY_POLL_TIMEOUT_MS`, `OBJECT_WAIT_PROGRESS_THROTTLE_MS`.
- Repro manual: `node backend/test/prueba-object.js "chair"`.
- **Mejora futura planeada**: una vez probado el pipeline completo, migrar AMBOS proveedores a
  servir un GLB uniforme desde el backend (capa de conversión+hosting), en vez del pass-through
  mixto actual. Convertir el glTF de Sketchfab a `.glb` y re-hostear el `.glb` de Meshy para
  evitar URLs firmadas que expiran y unificar el contrato del frontend a un solo `.glb`.

## Gaps conocidos (no los "arregles" adivinando, pregunta el plan primero)
- No hay tests automatizados; `test/` son scripts manuales (`prueba.js`, `prueba-gemini.js`).
  Si agregas lógica nueva, considera agregar verificación manual reproducible como mínimo.

## Regla de diseño no negociable: Gemini Live es la única voz del asistente
- Todo lo que el usuario ESCUCHA como respuesta del asistente debe salir de una generación
  real de Gemini Live en el momento, nunca de un string fijo/hardcodeado que simule que el
  modelo dijo algo.
- Cuando el backend necesita que el usuario reciba una respuesta de "espera" mientras corre
  trabajo asíncrono (generación de objeto en Meshy, análisis de vision, investigación larga),
  la forma correcta es: el backend manda un mensaje de CONTEXTO a la sesión de Live
  (`liveSession.sendText(...)`) explicando la situación, y deja que Live genere la frase de
  espera con su propio criterio y voz. NUNCA reproducir un audio o texto pregrabado como si
  fuera la voz del asistente — eso rompe la ilusión de que hay un modelo real controlando la
  conversación.
- Si una feature nueva necesita que el usuario reciba feedback hablado mientras algo carga,
  el diseño correcto siempre pasa por Live, no por un array de frases fijas ni por un
  text-to-speech externo con texto estático.

## Reglas de trabajo
- NUNCA asumas nombres de modelos Gemini, endpoints o parámetros del SDK `@google/genai` de
  memoria. Verifica contra `docs.claude.com` (no aplica aquí) o la documentación oficial de
  Google AI / Vertex AI antes de escribirlos.
- Antes de tocar `services/`, revisa si el archivo está importado en `gateway.service.js`.
  Si no lo está, es candidato a legacy — confírmalo conmigo antes de extenderlo.
- Sigue el patrón de capas ya existente: `*.routes.js` (solo enrutar) → `*.controller.js`
  (solo HTTP/WS transport) → `*.service.js` (lógica pura, sin conocer WebSocket/HTTP) →
  `*.model.js` (solo transformación/validación de datos, sin lógica de negocio).
- No mezcles responsabilidades de Wonderland Engine (componentes ECS en `js/`) con lógica
  de negocio del backend — la comunicación es solo vía WebSocket con el contrato de mensajes
  ya definido en `gateway-client.js` / `gateway.model.js`.
- Si vas a agregar una feature nueva (ej. Sketchfab), créala como servicio nuevo en
  `services/`, no la metas dentro de `gateway.service.js`.