// Pack contents at rest: AES-256-GCM with a key derived from PACK_SECRET by scrypt
// (salt "as-described"), so a blob URL that leaks leaks nothing. With PACK_SECRET unset the
// envelope says so and carries the JSON in the clear: that is the dev mode, and the status
// route tells nobody about it. Server side only (node:crypto).

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

export const SCRYPT_SALT = "as-described";
const ALG = "aes-256-gcm";

export type SealedEnvelope =
  | { v: 1; alg: "aes-256-gcm"; iv: string; tag: string; data: string }
  | { v: 1; alg: "none"; data: unknown };

let cachedKey: { secret: string; key: Buffer } | null = null;

/** The 32-byte key for a secret; scrypt is slow on purpose, so the result is cached. */
export function deriveKey(secret: string): Buffer {
  if (cachedKey && cachedKey.secret === secret) return cachedKey.key;
  const key = scryptSync(secret, SCRYPT_SALT, 32, { N: 16384, r: 8, p: 1 });
  cachedKey = { secret, key };
  return key;
}

export const packSecret = (): string => process.env.PACK_SECRET || "";
export const encryptionOn = (): boolean => packSecret() !== "";

/** JSON value → envelope text. Encrypted when PACK_SECRET is set, plain otherwise. */
export function sealJson(value: unknown, secret: string = packSecret()): string {
  if (!secret) {
    const env: SealedEnvelope = { v: 1, alg: "none", data: value };
    return JSON.stringify(env);
  }
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const plain = Buffer.from(JSON.stringify(value), "utf8");
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const env: SealedEnvelope = {
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: data.toString("base64"),
  };
  return JSON.stringify(env);
}

/** Envelope text → JSON value. Throws on a wrong key, a tampered body or a malformed envelope. */
export function openJson<T = unknown>(text: string, secret: string = packSecret()): T {
  let env: SealedEnvelope;
  try {
    env = JSON.parse(text) as SealedEnvelope;
  } catch {
    throw new Error("stored pack is not a valid envelope");
  }
  if (!env || typeof env !== "object" || env.v !== 1) throw new Error("stored pack has an unknown envelope version");
  if (env.alg === "none") return env.data as T;
  if (env.alg !== "aes-256-gcm") throw new Error("stored pack uses an unknown cipher");
  if (!secret) throw new Error("PACK_SECRET is unset but the stored pack is encrypted");
  const key = deriveKey(secret);
  const decipher = createDecipheriv(ALG, key, Buffer.from(env.iv, "base64"));
  decipher.setAuthTag(Buffer.from(env.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(env.data, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString("utf8")) as T;
}
