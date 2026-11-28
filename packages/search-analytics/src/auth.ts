import { verifyInitData } from "@tgbox/telegram";
import { HARD_LIMITS } from "./config.ts";
import type { SearchSource } from "./contracts.ts";
import {
  hmac,
  type SearchSession,
  telegramIdentity,
  verifySession,
  websiteIdentity,
} from "./identity.ts";
import { MINUTE_MS } from "./time.ts";

const evidence = new WeakSet<object>();
/** Server-only capability. Never construct authentication from parsed request fields. */
export class AuthenticatedSearch {
  private constructor(
    readonly source: SearchSource,
    readonly identity: string,
    readonly ip: string | null,
    readonly expiresAt: number,
    readonly session: SearchSession | null,
  ) {
    evidence.add(this);
    Object.freeze(this);
  }
  static async website(
    secret: string,
    sessionSecret: string,
    token: string,
    ip: string,
    now: number,
  ) {
    const session = await verifySession(sessionSecret, token, now);
    if (!session || !ip || ip.length > 64) return null;
    return new AuthenticatedSearch(
      "website",
      await websiteIdentity(secret, session),
      await hmac(secret, "ip", ip),
      session.exp * 1000,
      session,
    );
  }
  static async miniapp(
    secret: string,
    botToken: string | undefined,
    initData: string,
    ip: string,
    now: number,
  ) {
    if (!ip || ip.length > 64 || initData.length > HARD_LIMITS.initDataHeader) return null;
    const params = new URLSearchParams(initData);
    if (
      params.getAll("auth_date").length !== 1 ||
      params.getAll("user").length !== 1 ||
      params.getAll("hash").length !== 1 ||
      !/^\d+$/.test(params.get("auth_date") ?? "")
    )
      return null;
    const user = await verifyInitData(initData, botToken, now);
    if (!user || user.id <= 0) return null;
    return new AuthenticatedSearch(
      "miniapp",
      await telegramIdentity(secret, user.id),
      await hmac(secret, "ip", ip),
      (Number(params.get("auth_date")) + HARD_LIMITS.telegramMaxAgeSeconds) * 1000,
      null,
    );
  }
  /** Call only after the existing Telegram secret-header webhook guard. No HTTP source selector. */
  static async bot(secret: string, verifiedTelegramUserId: number, now: number) {
    return new AuthenticatedSearch(
      "bot",
      await telegramIdentity(secret, verifiedTelegramUserId),
      null,
      now + MINUTE_MS,
      null,
    );
  }
}
export function trustedAuth(auth: AuthenticatedSearch, now: number) {
  return evidence.has(auth) && auth.expiresAt > now;
}
