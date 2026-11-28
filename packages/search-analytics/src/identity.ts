import { z } from "zod";
import { HARD_LIMITS } from "./config.ts";

const encoder = new TextEncoder();
const Session = z.strictObject({
  v: z.literal(1),
  id: z.uuid(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
  trustedUntil: z.number().int().nonnegative(),
});
export type SearchSession = z.infer<typeof Session>;
export async function hmac(secret: string, domain: string, value: string) {
  if (secret.length < HARD_LIMITS.secretMinCharacters)
    throw new Error("Analytics secret is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(JSON.stringify([1, domain, value]))),
  );
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function telegramIdentity(secret: string, verifiedTelegramUserId: number) {
  if (!Number.isSafeInteger(verifiedTelegramUserId) || verifiedTelegramUserId <= 0)
    throw new TypeError("Invalid trusted identity");
  return hmac(secret, "telegram", String(verifiedTelegramUserId));
}
export function websiteIdentity(secret: string, verifiedSession: SearchSession) {
  return hmac(secret, "website", verifiedSession.id);
}
function constantEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function signSession(secret: string, session: SearchSession) {
  const data = Session.parse(session);
  if (data.exp <= data.iat || data.trustedUntil > data.exp)
    throw new TypeError("Invalid session lifetime");
  const body = btoa(JSON.stringify(data))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return `${body}.${await hmac(secret, "session", body)}`;
}
export async function verifySession(
  secret: string,
  token: string,
  nowMs: number,
): Promise<SearchSession | null> {
  if (token.length > HARD_LIMITS.sessionCookie || !/^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/.test(token))
    return null;
  const [body, mac] = token.split(".");
  if (!body || !mac || !constantEqual(await hmac(secret, "session", body), mac)) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(atob(body.replaceAll("-", "+").replaceAll("_", "/")));
  } catch {
    return null;
  }
  const result = Session.safeParse(decoded);
  if (!result.success) return null;
  const s = result.data,
    now = Math.floor(nowMs / 1000);
  return s.exp > now &&
    s.exp > s.iat &&
    s.exp - s.iat <= HARD_LIMITS.sessionMaxAgeSeconds &&
    s.iat <= now + HARD_LIMITS.sessionClockSkewSeconds &&
    s.trustedUntil <= s.exp
    ? s
    : null;
}
