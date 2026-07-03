import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer } from "ws";
import { handleGatewayConnection } from "./gateway.controller.js";
import { resolveObjectPipelineConfig } from "../../configs/objectPipeline.config.js";
import { logInfo } from "../../shared/logger.js";

const MIME_TYPES = {
  ".gltf": "model/gltf+json",
  ".glb": "model/gltf-binary",
  ".bin": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ktx2": "image/ktx2",
};

export function startGatewayServer() {
  const PORT = Number(process.env.PORT || 8787);
  const { hosting } = resolveObjectPipelineConfig();
  const modelsRoot = path.resolve(hosting.modelDir);

  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "GET" && url.pathname.startsWith("/models/")) {
      serveModelFile(url.pathname, modelsRoot, res);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  // El WS comparte el mismo http.Server → un solo puerto (un solo túnel ngrok
  // expone WS-upgrade + estático /models).
  const wss = new WebSocketServer({ server });
  wss.on("connection", handleGatewayConnection);

  server.listen(PORT, () => {
    logInfo(`Quest XR WS listening on ws://localhost:${PORT}`);
    logInfo(`Modelos estáticos en /models (dir: ${modelsRoot})`);
  });

  return wss;
}

function serveModelFile(pathname, modelsRoot, res) {
  const rel = decodeURIComponent(pathname.replace(/^\/models\//, ""));
  const filePath = path.resolve(modelsRoot, rel);

  // Guard anti path-traversal: el archivo debe quedar dentro de modelsRoot.
  if (filePath !== modelsRoot && !filePath.startsWith(modelsRoot + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
    fs.createReadStream(filePath).pipe(res);
  });
}
