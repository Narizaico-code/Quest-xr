export function normalizePayload(data) {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString();
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString();
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer).toString();
  return String(data);
}

export function parseQuestPayload(data) {
  const raw = normalizePayload(data);
  if (!raw) return { text: "", raw: "" };

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          ...parsed,
          text: parsed.text || "",
          image: parsed.image || parsed.imageBase64 || parsed.frame || null,
          imageMimeType:
            parsed.imageMimeType || parsed.mimeType || parsed.image_type || null,
          raw,
        };
      }
    } catch (err) {
      return { text: raw, raw };
    }
  }

  return { text: String(raw), raw: String(raw) };
}

export function normalizeImagePayload(image, mimeType) {
  if (!image) return { data: "", mimeType: mimeType || "" };
  const value = String(image);
  if (value.startsWith("data:")) {
    const match = /^data:([^;]+);base64,/.exec(value);
    const data = value.slice(value.indexOf(",") + 1);
    return {
      data,
      mimeType: mimeType || match?.[1] || "",
    };
  }

  return { data: value, mimeType: mimeType || "" };
}
