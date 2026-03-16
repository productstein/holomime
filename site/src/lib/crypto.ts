/**
 * Encryption utilities for sensitive data at rest.
 * Uses AES-256-GCM via Web Crypto API (available in Cloudflare Workers).
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96-bit IV recommended for AES-GCM
const TAG_LENGTH = 128; // 128-bit auth tag

/** Derive a CryptoKey from the ENCRYPTION_KEY env var (hex-encoded 32-byte key). */
async function getKey(keyHex: string): Promise<CryptoKey> {
  const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  if (keyBytes.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return crypto.subtle.importKey("raw", keyBytes, { name: ALGORITHM, length: KEY_LENGTH }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypt a plaintext string. Returns a base64 string of `iv:ciphertext`.
 * The IV is randomly generated per encryption call.
 */
export async function encrypt(plaintext: string, keyHex: string): Promise<string> {
  const key = await getKey(keyHex);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    encoded,
  );

  // Combine IV + ciphertext into a single buffer, then base64 encode
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a base64 string produced by `encrypt()`.
 * Returns the original plaintext string.
 */
export async function decrypt(encryptedB64: string, keyHex: string): Promise<string> {
  const key = await getKey(keyHex);
  const combined = Uint8Array.from(atob(encryptedB64), (c) => c.charCodeAt(0));

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}
