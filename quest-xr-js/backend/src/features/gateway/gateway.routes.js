import { WebSocketServer } from "ws";
import { handleGatewayConnection } from "./gateway.controller.js";
import { logInfo } from "../../shared/logger.js";

export function startGatewayServer() {
  const PORT = Number(process.env.PORT || 8787);
  const wss = new WebSocketServer({ port: PORT });

  logInfo(`Quest XR WS listening on ws://localhost:${PORT}`);
  wss.on("connection", handleGatewayConnection);

  return wss;
}
