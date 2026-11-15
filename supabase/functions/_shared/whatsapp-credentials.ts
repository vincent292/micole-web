// Adapted from saas-food. AES-GCM additionalData binds each token to its school.
const from64 = (v: string) => Uint8Array.from(atob(v), c => c.charCodeAt(0));
const to64 = (v: Uint8Array) => btoa(Array.from(v, b => String.fromCharCode(b)).join(''));
async function key(secret: string) {
  const bytes = from64(secret);
  if (bytes.length !== 32) throw Error('WhatsApp requiere una clave privada de 32 bytes.');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptWhatsAppToken(token: string, secret: string, schoolId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(schoolId) }, await key(secret), new TextEncoder().encode(token));
  return `v1.${to64(iv)}.${to64(new Uint8Array(encrypted))}`;
}
export async function decryptWhatsAppToken(value: string, secret: string, schoolId: string) {
  const [version, iv, body] = value.split('.');
  if (version !== 'v1' || !iv || !body) throw Error('Conexión de WhatsApp no válida.');
  const result = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: from64(iv), additionalData: new TextEncoder().encode(schoolId) }, await key(secret), from64(body));
  return new TextDecoder().decode(result);
}
export async function verifyWhatsAppSignature(body: Uint8Array, signature: string | null, secret: string) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.slice(7).match(/../g)!, h => parseInt(h, 16));
  return crypto.subtle.verify('HMAC', key, bytes, body);
}
