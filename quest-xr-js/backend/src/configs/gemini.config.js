export const DEFAULT_GEMINI_LIVE_MODEL = "gemini-3.1-flash-live-preview";
export const DEFAULT_GEMINI_VISION_MODEL = "gemini-3.5-flash";
export const DEFAULT_GEMINI_PRO_MODEL = "gemini-3.1-pro-preview";
export const DEFAULT_GEMINI_ROUTER_MODEL = "gemini-3.1-flash-lite-preview";

export function resolveGeminiApiKey() {
  return process.env.GEMINI_API_KEY || "";
}
