function encodeHex(value: ArrayBuffer) {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeHex(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signBody(secret: string, timestamp: string, body: string) {
  return encodeHex(await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(`${timestamp}.${body}`)));
}

export async function verifyBody(secret: string, timestamp: string, body: string, signature: string) {
  const decoded = decodeHex(signature);
  if (!decoded) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(secret), decoded, new TextEncoder().encode(`${timestamp}.${body}`));
}
