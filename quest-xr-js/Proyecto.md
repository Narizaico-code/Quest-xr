# DOCUMENTO DE ESPECIFICACIÓN TÉCNICA, ARQUITECTURA DE SOFTWARE E INSTRUCCIONES DE DESARROLLO
**Proyecto:** Asistente Virtual Multimodal Inmenso y Versátil para WebXR  
**Arquitecto de Software:** Angel Geovanny Reyes Vinasco  
**Entorno de Despliegue:** Meta Quest 3S (Standalone via Oculus Browser)  

---

## 1. CONTEXTO OPERATIVO Y RESTRICCIONES DE HARDWARE (ELEVACIÓN LOCAL)

Este sistema debe ser construido e implementado respetando estrictamente los límites del hardware del lado del servidor y del cliente, optimizando el rendimiento para mitigar el mareo por movimiento (motion sickness) en Realidad Virtual.

### A. Hardware del Cliente (Frontend Spatial Computing) 
* **Dispositivo:** Meta Quest 3S.
* **Canal de Ejecución:** Oculus Browser (Entorno Chromium optimizado para XR).
* **Requisito de Seguridad:** Exige estrictamente un origen seguro de red (**HTTPS** para transferencia web y **WSS** para WebSockets). Cualquier intento de inicializar el contexto WebXR o acceder a periféricos de entrada (micrófono/cámaras) bajo HTTP fallará de manera silenciosa. El túnel seguro se gestionará localmente mediante **ngrok**.

### B. Hardware del Servidor (Backend & Local AI Edge)
* **Procesador (CPU):** AMD Ryzen 5.
* **Tarjeta Gráfica (GPU):** AMD Radeon RX 550 con **4GB de VRAM** (Arquitectura Polaris).
* **Implicación Crítica para la IA Local:** Debido a la limitación de 4GB de VRAM y la arquitectura Polaris, los modelos de lenguaje locales (LLMs) ejecutados en **Ollama** se descargarán en la memoria del sistema y correrán utilizando la CPU con aceleración vectorial integrada. 
    * *Velocidad Esperada:* ~30-40 tokens por segundo con modelos cuantizados a 4 bits (Q4).
    * *Restricción de Modelos Locales:* Se prohíbe el uso de modelos locales superiores a 1.5B de parámetros. No se deben intentar correr modelos de visión locales (VLMs como LLaVA o Qwen-VL) en este hardware, ya que colapsarían la VRAM e interrumpirían el entorno de desarrollo de Wonderland Engine. Toda la visión pesada y razonamiento profundo se delegará de forma asíncrona a la nube.

---

## 2. ARQUITECTURA DEL SISTEMA Y STACK TECNOLÓGICO

El ecosistema se estructura de manera completamente desacoplada bajo un patrón de microservicios y aduana lógica intermedia:

┌─────────────────────────┐               ┌─────────────────────────┐               ┌───────────────────────────┐
│     META QUEST 3S       │               │    SERVIDOR NODE.JS     │               │   OLLAMA (LOCAL EDGE)     │
│  (Wonderland Engine)    │ <─WebSocket─> │  (Aduana Lógica y Proxy)│ <───HTTP────> │    Llama 3.2 (1B - CPU)   │
└─────────────────────────┘               └───────────┬─────────────┘               └───────────────────────────┘
│
┌──────────┴──────────┐
▼                     ▼
┌───────────────────────┐ ┌────────────────────────┐
│  GEMINI LIVE API      │ │   GEMINI PRO / VISION  │
│ (WebSocket - Cloud)   │ │  (HTTP REST - Cloud)   │
└───────────────────────┘ └────────────────────────┘

1.  **Frontend (WebXR Core):** **Wonderland Engine**. Arquitectura basada en Entidad-Componente-Sistema (ECS). El motor gráfico compila su núcleo a **WebAssembly (Wasm)** para comunicarse directamente con la API gráfica del dispositivo, asegurando una tasa de refresco estable de 90Hz/120Hz.
2.  **Backend (Middleware Orquestador):** Servidor en **Node.js** nativo utilizando la librería `ws` para la gestión de WebSockets bidireccionales concurrentes de baja latencia y `dotenv` para inyección de credenciales.
3.  **Capa de IA Híbrida Inteligente:**
    * *Enrutador Local:* **Ollama** ejecutando **Llama 3.2 (1B)** o **Qwen 2.5 (1.5B)** en formato JSON estricto para la clasificación inmediata de intenciones.
    * *Interfaz Conversacional y Voz:* **Gemini Multimodal Live API** sobre WebSockets en la nube para respuestas conversacionales inmediatas sin lag.
    * *Cognición Computacional Compleja y Visión:* **Gemini Pro / Gemini Flash-Thinking** vía llamadas HTTP REST tradicionales para análisis multimodal e investigaciones masivas.

---

## 3. MATRIZ DE VERSATILIDAD CONVERSACIONAL (LAS 4 CATEGORÍAS SUPREMAS)

Para evitar que el asistente esté limitado a respuestas rígidas y predefinidas, el Clasificador Maestro Local (Ollama) segmentará los inputs del usuario en 4 vías lógicas diferenciadas:

| Categoría | Descripción Técnica | Destino del Tráfico | Formato de Salida en VR |
| :--- | :--- | :--- | :--- |
| `OBJETO` | Solicitudes explícitas de aparición, renderizado o creación de geometrías tridimensionales. | Sketchfab API (Modelos CC) / Meshy API (Generación Low-Poly). | Instanciación dinámica en la jerarquía ECS de Wonderland Engine. |
| `INVESTIGAR` | Peticiones de datos densos, resúmenes enciclopédicos, análisis teóricos complejos o académicos. | Gemini Pro / DeepSeek (Llamada HTTP REST asíncrona). | Inyección de JSON estructural a paneles flotantes de texto en 3D (*Text Meshes*). |
| `VISION` | Consultas multimodales basadas en lo que el usuario sostiene o ve a través del visor ("¿Qué tengo en la mano?"). | Captura de frame en el Quest -> Proxy Node.js -> Gemini Pro Vision / Thinking. | Despliegue visual de etiquetas holográficas sobre el entorno o voz explicativa. |
| `CONVERSACION_GENERAL` | Preguntas abiertas de conocimiento general ("¿Qué es una planta?"), lógica rápida, filosofía, saludos o charla casual. | Redirección directa y limpia a la **Gemini Live API**. | Streaming de audio en tiempo real y subtitulado dinámico de baja latencia. |

---

## 4. INGENIERÍA DE FLUJOS COMPACTOS Y BAJA LATENCIA

### Flujo de Visión Computacional Espacial (`VISION`)
Este flujo permite al asistente "ver" y razonar de forma extendida sin congelar el hilo de renderizado del Meta Quest ni saturar el búfer de voz:

1.  El usuario ejecuta un comando de voz: *"Asistente, ¿qué planta es esta que tengo en la mano?"*.
2.  El script de Wonderland Engine captura instantáneamente la textura del viewport del visor (o el stream de la cámara permitido por el entorno AR) y extrae un frame comprimido en formato **JPEG/Base64**.
3.  El Quest envía un paquete binario/texto combinado por el WebSocket hacia el servidor Node.js conteniendo el texto de la pregunta y los bytes de la imagen.
4.  **Aduana Lógica (Node.js):** El servidor pasa el texto a **Ollama Local**, el cual detecta la intención de visión en 30ms: `{"categoria": "VISION", "target": "planta en la mano"}`.
5.  **Bypass y Bloqueo Temporal:** Node.js congela el flujo hacia Gemini Live para evitar respuestas vacías. Envía una señal corta a Live para que emita una frase de espera: *"Déjame mirar de cerca, dame un segundo..."*.
6.  **Razonamiento Profundo (Cloud Vision Pipeline):** Node.js empaqueta el frame de la imagen y la pregunta del usuario en un payload HTTP multipart y hace un POST directo a **Gemini Pro / Flash-Thinking** (activando capacidades de razonamiento extendido).
7.  El modelo Pro analiza la morfología de la planta, sus propiedades y genera un diagnóstico preciso en texto estructurado.
8.  Al recibir la respuesta de la nube, Node.js envía los metadatos visuales a Wonderland Engine para pintar etiquetas explicativas sobre el espacio virtual, y despierta a Gemini Live con un prompt sintetizado para que resuma por voz los hallazgos al usuario.

---

## 5. CÓDIGO FUENTE DE REFERENCIA REVISADO (`src/server.js`)

Este código inicial implementa la aduana local con soporte ampliado para las 4 categorías, manejo de logs de interfaz y la infraestructura base para recibir payloads multimedia (imágenes del Quest).

```javascript
require('dotenv').config();
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';

const wss = new WebSocket.Server({ port: PORT }, () => {
    console.log(`🚀 Servidor proxy WebXR corriendo en el puerto ${PORT}`);
    console.log(`🔒 Túnel HTTPS obligatorio: ngrok http ${PORT}`);
});

// Prompt del sistema ultra-preciso para optimizar el rendimiento del modelo 1B en CPU
const OLLAMA_SYSTEM_PROMPT = `
Eres el Enrutador Supremo y clasificador de intenciones para un sistema operativo en Realidad Virtual. Tu único objetivo es analizar el texto del usuario y devolver estrictamente un objeto JSON clasificado en una de las siguientes cuatro categorías:

1. "OBJETO": El usuario quiere crear, spawnear, buscar o materializar un objeto 3D o modelo físico en la escena (ej: "pon una mesa", "quiero ver una espada").
2. "INVESTIGAR": Peticiones académicas densas, resúmenes masivos, investigaciones profundas de texto (ej: "hazme un resumen de la historia de la computación").
3. "VISION": Consultas que involucren el entorno físico o visual del usuario, lo que está viendo o sosteniendo (ej: "¿qué tengo en la mano?", "¿qué estás viendo?", "analiza este objeto frente a mí").
4. "CONVERSACION_GENERAL": Preguntas conceptuales directas, cultura general, definiciones rápidas, lógica matemática o charla casual (ej: "¿qué es una planta?", "hola", "¿por qué el cielo es azul?").

Responde exclusivamente en este formato JSON, sin texto de introducción ni bloques de código markdown:
{"categoria": "CATEGORIA_AQUI", "target": "objeto_tema_o_contexto_buscado"}
`;

async function consultarClasificadorLocal(textoUsuario) {
    try {
        const response = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.2:1b', // Configurado para alta velocidad en la CPU del Ryzen 5
                messages: [
                    { role: 'system', content: OLLAMA_SYSTEM_PROMPT },
                    { role: 'user', content: textoUsuario }
                ],
                options: { temperature: 0.0 }, // Consistencia algorítmica pura
                stream: false,
                format: 'json' 
            })
        });

        const data = await response.json();
        return JSON.parse(data.message.content);
    } catch (error) {
        console.error('❌ Error en el Clasificador Local Edge:', error.message);
        return { categoria: 'CONVERSACION_GENERAL', target: '' };
    }
}

wss.on('connection', (ws) => {
    console.log('🥽 Meta Quest 3S enlazado por canal WebSocket.');

    ws.on('message', async (message) => {
        try {
            // Manejo flexible de datos: El Quest puede enviar JSON con texto e imágenes estructuradas
            const payload = JSON.parse(message.toString());
            const textoRecibido = payload.text || '';
            const imagenAsociada = payload.image || null; // String Base64 del frame de la cámara

            console.log(`📩 Entrada de Usuario en VR: "${textoRecibido}"`);

            console.log('🧠 Ejecutando enrutamiento inteligente en CPU local...');
            const decision = await consultarClasificadorLocal(textoRecibido);
            console.log('📋 Clasificación Devuelta:', decision);

            switch (decision.categoria) {
                case 'OBJETO':
                    console.log(`📦 Inicializando Pipeline Gráfico 3D para: ${decision.target}`);
                    ws.send(JSON.stringify({ action: 'UI_LOG', message: `Buscando modelo 3D para: ${decision.target}...` }));
                    // TODO: Conectar src/services/meshService.js (Sketchfab/Meshy)
                    break;

                case 'INVESTIGAR':
                    console.log(`🔍 Desviando a Pipeline Cognitivo de Texto (Gemini Pro): ${decision.target}`);
                    ws.send(JSON.stringify({ action: 'UI_LOG', message: `Investigando a fondo sobre: ${decision.target}...` }));
                    // TODO: Conectar src/services/geminiProService.js (Bypass UI Panels)
                    break;

                case 'VISION':
                    console.log(`👁️ Activando Pipeline Multimodal de Visión para: ${decision.target}`);
                    ws.send(JSON.stringify({ action: 'UI_LOG', message: "Analizando entorno visual y texturas..." }));
                    if (imagenAsociada) {
                        // TODO: Enviar buffer/base64 + prompt a Gemini Pro Vision / Thinking
                    } else {
                        ws.send(JSON.stringify({ action: 'VOICE_RESPONSE', message: "No he recibido datos visuales del visor." }));
                    }
                    break;

                case 'CONVERSACION_GENERAL':
                default:
                    console.log('💬 Enrutando al canal de baja latencia: Gemini Live API.');
                    // TODO: Hacer pipe directo al WebSocket abierto de la Gemini Live API
                    ws.send(JSON.stringify({ action: 'VOICE_RESPONSE', message: `Procesando de forma fluida: ${textoRecibido}` }));
                    break;
            }

        } catch (err) {
            // Soporte para mensajes de texto plano sin estructurar enviados durante pruebas tempranas
            const textoPlano = message.toString();
            console.log(`📩 Modo de compatibilidad de texto plano: "${textoPlano}"`);
            const decisionPlana = await consultarClasificadorLocal(textoPlano);
            console.log('📋 Clasificación Modo Compatibilidad:', decisionPlana);
            ws.send(JSON.stringify({ action: 'UI_LOG', message: `Procesando intención: ${decisionPlana.categoria}` }));
        }
    });

    ws.on('close', () => console.log('📴 Meta Quest desconectado del backend.'));
}); ```

---