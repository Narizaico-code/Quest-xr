export const DEFAULT_GEMINI_LIVE_MODEL = "gemini-3.1-flash-live-preview";
export const DEFAULT_GEMINI_VISION_MODEL = "gemini-3.5-flash";
export const DEFAULT_GEMINI_PRO_MODEL = "gemini-3.1-pro-preview";
export const DEFAULT_GEMINI_ROUTER_MODEL = "gemini-3.1-flash-lite-preview";

function isTruthy(value) {
  if (!value) return false;
  return ["1", "true", "yes", "y", "on"].includes(String(value).toLowerCase());
}

export function isGeminiVertexEnabled() {
  return (
    isTruthy(process.env.GOOGLE_GENAI_USE_VERTEXAI) ||
    isTruthy(process.env.GOOGLE_GENAI_USE_ENTERPRISE)
  );
}

export function resolveGeminiApiKey() {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
}

export function resolveGeminiClientOptions() {
  if (isGeminiVertexEnabled()) {
    return {
      mode: "vertex",
      options: {
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT || "",
        location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
      },
    };
  }

  return {
    mode: "developer",
    options: {
      apiKey: resolveGeminiApiKey(),
    },
  };
}
