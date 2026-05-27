import { createGatewaySession } from "./gateway.service.js";

export function handleGatewayConnection(questSocket) {
  createGatewaySession(questSocket);
}
