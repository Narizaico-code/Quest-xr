import "dotenv/config";
import { createGeminiLiveSession } from "../src/services/geminiLiveService.js";

// Simple CLI probe: connects, sends a single text, logs text + audio byte length, then closes.
const session = createGeminiLiveSession({
  onText: (text) => console.log("TEXT:", text),
  onAudio: (audio) => console.log("AUDIO bytes:", audio?.data?.length || 0),
  onEvent: (evt) => console.log("EVENT:", evt?.serverContent ? "model turn" : evt?.type || "event"),
  onToolCall: (tool) => console.log("TOOL CALL:", tool),
});

await session.connect();

if (session.isReady()) {
  session.sendText("Hola, ¿qué puedes hacer en WebXR?");
} else {
  console.error("Session not ready; check API key / project config.");
}

setTimeout(() => {
  session.close();
  console.log("Session closed");
  process.exit(0);
}, 8000);
