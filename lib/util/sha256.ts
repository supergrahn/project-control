// Browser-safe SHA-256 helper. The docs page uses this to compute a stable
// hash of the markdown body so the critic-findings panel can flag stale
// findings (where the file's content has drifted from what was critiqued).
//
// Stays a thin wrapper around the Web Crypto API so test environments with
// the standard `crypto.subtle` mock work without extra setup. Server-side
// callers should use `crypto.createHash('sha256')` from node:crypto instead;
// this helper is intentionally async so it can never accidentally be inlined
// at module-eval time on the client.
export async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  const bytes = new Uint8Array(hash)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}
