import { getSessionSecret } from "@/lib/config";
import { hmacSha256, safeEqual } from "@/lib/crypto";

export const SESSION_COOKIE = "nofit_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

interface SessionPayload {
  u: string;
  iat: number;
  exp: number;
}

export function signSession(userId: string, nowSeconds = Math.floor(Date.now() / 1000), secret = getSessionSecret()): string {
  const payload: SessionPayload = { u: userId, iat: nowSeconds, exp: nowSeconds + SESSION_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmacSha256(secret, body)}`;
}

/** Returns the user id for a valid, unexpired, correctly signed token; otherwise null. */
export function verifySession(
  token: string | undefined | null,
  nowSeconds = Math.floor(Date.now() / 1000),
  secret = getSessionSecret(),
): string | null {
  if (!token || token.length > 1024) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  if (!safeEqual(sig, hmacSha256(secret, body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.u !== "string" || typeof payload.exp !== "number" || payload.exp <= nowSeconds) return null;
    return payload.u;
  } catch {
    return null;
  }
}
