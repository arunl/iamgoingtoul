import crypto from "node:crypto"

function positive(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

export const ROTATE_MS = positive(process.env.ROTATE_MS, 5 * 60 * 1000)
export const TOKEN_TTL_MS = positive(process.env.TOKEN_TTL_MS, 10 * 60 * 1000)
export const POSTER_TTL_MS = positive(process.env.POSTER_TTL_MS, 16 * 60 * 60 * 1000)
export const SKEW_MS = positive(process.env.SKEW_MS, 15 * 1000)

export function signToken(data, secret = process.env.HMAC_SECRET) {
  const payload = Buffer.from(
    JSON.stringify({ iat: data.iat, exp: data.exp, n: data.n }),
  ).toString("base64url")
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url")
  return `${payload}.${sig}`
}

export function mintToken(now = Date.now(), ttl = TOKEN_TTL_MS) {
  const iat = now
  const exp = now + ttl
  const n = crypto.randomBytes(8).toString("hex")
  return { token: signToken({ iat, exp, n }), iat, exp, n }
}

export function readToken(token, revokeBefore = 0, now = Date.now()) {
  if (typeof token !== "string" || token.length > 512) return null
  const dot = token.indexOf(".")
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = crypto
    .createHmac("sha256", process.env.HMAC_SECRET)
    .update(payload)
    .digest("base64url")
  const got = Buffer.from(sig)
  const want = Buffer.from(expected)
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null
  let data
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (!data || !Number.isFinite(data.iat) || !Number.isFinite(data.exp)) return null
  if (typeof data.n !== "string" || data.n.length < 4 || data.n.length > 64) return null
  if (data.exp <= data.iat || data.exp - data.iat > 24 * 60 * 60 * 1000) return null
  if (now > data.exp + SKEW_MS) return null
  if (data.iat < Number(revokeBefore || 0)) return null
  return { iat: data.iat, exp: data.exp, n: data.n }
}
