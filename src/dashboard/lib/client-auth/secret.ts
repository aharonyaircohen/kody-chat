/**
 * @fileType utility
 * @domain client-auth
 * @pattern derived-secret
 * @ai-summary Derive the Auth.js session-signing secret from KODY_MASTER_KEY
 *   via HKDF (info: "kody-client-auth:v1") — same pattern as VAPID keys, so
 *   no new env var is introduced. Bumping the info string to ":v2" rotates
 *   every client session (all brand users get signed out).
 */
import { hkdfSync } from "crypto";

let cached: string | null = null;

function masterKeyBytes(): Buffer {
  const masterRaw = process.env.KODY_MASTER_KEY?.trim();
  if (!masterRaw) {
    throw new Error(
      "KODY_MASTER_KEY is not configured — required for client auth secret derivation",
    );
  }
  // Accept hex (64 chars) or base64url. Same shape the vault accepts.
  if (/^[0-9a-fA-F]+$/.test(masterRaw) && masterRaw.length === 64) {
    return Buffer.from(masterRaw, "hex");
  }
  return Buffer.from(
    masterRaw.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );
}

export function deriveClientAuthSecret(): string {
  if (cached) return cached;
  const secret = Buffer.from(
    hkdfSync("sha256", masterKeyBytes(), Buffer.alloc(0), "kody-client-auth:v1", 32),
  ).toString("base64url");
  cached = secret;
  return secret;
}
