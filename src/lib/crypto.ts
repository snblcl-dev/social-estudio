import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getKey() {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;

  if (!secret) {
    throw new Error(
      "Falta API_KEY_ENCRYPTION_SECRET. Genera uno con: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  return createHash("sha256").update(secret).digest();
}

/** Cifra un texto con AES-256-GCM. Formato: iv:tag:datos (base64). */
export function encryptSecret(plainText: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(
    ":",
  );
}

/** Descifra un texto generado por encryptSecret. */
export function decryptSecret(payload: string) {
  const [ivPart, tagPart, dataPart] = payload.split(":");

  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("La clave almacenada tiene un formato inválido.");
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Devuelve una versión enmascarada para mostrar en la interfaz. */
export function maskSecret(plainText: string) {
  if (plainText.length <= 8) return "••••••••";
  return `${plainText.slice(0, 4)}••••••••${plainText.slice(-4)}`;
}
