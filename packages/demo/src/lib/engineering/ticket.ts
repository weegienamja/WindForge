const bytes = new TextEncoder();
async function key() {
  const s = process.env.WF_HANDOFF;
  return s
    ? crypto.subtle.importKey('raw', bytes.encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, [
        'sign',
        'verify',
      ])
    : null;
}
export async function signSite(site: unknown) {
  const k = await key();
  if (!k) return '';
  const a = new Uint8Array(await crypto.subtle.sign('HMAC', k, bytes.encode(JSON.stringify(site))));
  return Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
}
export async function verifiedSite(site: unknown, signature: unknown) {
  const k = await key();
  if (!k || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return crypto.subtle.verify(
    'HMAC',
    k,
    Uint8Array.from(signature.match(/../g)!, (v) => parseInt(v, 16)),
    bytes.encode(JSON.stringify(site)),
  );
}
