import { startGatewayServer } from "../features/gateway/gateway.routes.js";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function createApp() {
  const configDir = path.dirname(fileURLToPath(import.meta.url));
  const backendRoot = path.resolve(configDir, "..", "..");
  dotenv.config({ path: path.resolve(backendRoot, ".env") });
  return {
    start: startGatewayServer,
  };
}
