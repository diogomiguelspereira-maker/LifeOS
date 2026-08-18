import crypto from "crypto";

/** Encrypt a string with AES-256-GCM using GOOGLE_TOKEN_KEY (or a fallback dev key). */
export function encryptToken(plain: string): string {
  const key = tokenKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptToken(payload: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = payload.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function tokenKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_KEY;
  if (raw && raw.length >= 16) {
    return crypto.createHash("sha256").update(raw).digest(); // 32 bytes
  }
  // Fallback dev key — only used when GOOGLE_TOKEN_KEY is not set.
  return crypto.createHash("sha256").update("lifeos-dev-token-key-fallback").digest();
}
