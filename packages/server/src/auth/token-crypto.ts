/**
 * AES-256-GCM helpers for encrypting/decrypting secrets at rest.
 *
 * Output format: "<iv_hex>:<ciphertext_hex>"
 * Key format:    64 hex chars (32 bytes), from APP_SESSION_ENCRYPTION_KEY env var
 *
 * Used for TOTP secrets (mfa.ts) and IdP refresh tokens (OIDC callback + refresh job).
 *
 * Ref: SD-004-authn-provider-abstraction.md §12
 * Issues: hx-c90fbc0a, hx-c757d0df
 */

/** Import a 32-byte hex key as a Web Crypto AES-GCM CryptoKey. */
async function importAesKey(hexKey: string): Promise<CryptoKey> {
	const keyBytes = Uint8Array.from(hexKey.match(/.{2}/g)?.map((b) => Number.parseInt(b, 16)) ?? []);
	if (keyBytes.length !== 32) throw new Error("Encryption key must be 32 bytes (64 hex chars)");
	return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Encrypt plaintext with AES-256-GCM. Returns "<iv_hex>:<ciphertext_hex>". */
export async function encryptToken(plaintext: string, hexKey: string): Promise<string> {
	const key = await importAesKey(hexKey);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encoded = new TextEncoder().encode(plaintext);
	const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
	const ivHex = Buffer.from(iv).toString("hex");
	const cipherHex = Buffer.from(ciphertext).toString("hex");
	return `${ivHex}:${cipherHex}`;
}

/** Decrypt a value produced by encryptToken. Returns the original plaintext. */
export async function decryptToken(encrypted: string, hexKey: string): Promise<string> {
	const [ivHex, cipherHex] = encrypted.split(":") as [string, string];
	const key = await importAesKey(hexKey);
	const iv = Uint8Array.from(Buffer.from(ivHex, "hex"));
	const ciphertext = Uint8Array.from(Buffer.from(cipherHex, "hex"));
	const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
	return new TextDecoder().decode(plaintext);
}
