import { describe, expect, it } from "vitest";
import { defaultSettings, entryEnabled, SearchSettings } from "./config.ts";
import { signSession, telegramIdentity, verifySession, websiteIdentity } from "./identity.ts";
import { beijingDay, previousCompleteWindow } from "./time.ts";

const secret = "local-test-secret".repeat(3);
describe("configuration and time", () => {
  it("defaults all runtime features off and rejects unsafe combinations", () => {
    expect(entryEnabled(defaultSettings, "website", true)).toBe(false);
    for (const config of [
      { dailyBudget: 100001 },
      { minimumIdentities: 1 },
      { identityRetentionDays: 7 },
      { weights: [0.3, 0.6, 1] },
    ])
      expect(SearchSettings.safeParse(config).success).toBe(false);
    expect(SearchSettings.safeParse({ dailyBudget: 50000 }).success).toBe(true);
  });
  it("uses complete Beijing days across the UTC date and year boundary", () => {
    expect(beijingDay(Date.parse("2026-11-27T16:00:00Z"))).toBe("2026-11-28");
    expect(previousCompleteWindow(Date.parse("2026-01-01T16:05:00Z"))).toEqual({
      from: "2025-12-26",
      to: "2026-01-01",
      endExclusive: "2026-01-02",
    });
  });
});
describe("server derived identity and signed sessions", () => {
  const s = {
    v: 1 as const,
    id: "eeea35c4-b139-4e0d-b082-dbe3f1a21111",
    iat: 1000,
    exp: 4600,
    trustedUntil: 1000,
  };
  it("gives Mini App and Bot the same Telegram domain and separates website identities", async () => {
    expect(await telegramIdentity(secret, 123)).toBe(await telegramIdentity(secret, 123));
    expect(await websiteIdentity(secret, s)).not.toBe(await telegramIdentity(secret, 123));
    expect(await telegramIdentity(secret, 123)).toMatch(/^[0-9a-f]{64}$/);
    expect(() => telegramIdentity(secret, NaN)).toThrow();
  });
  it("rejects tampering, expiry, future sessions and secrets with no entropy budget", async () => {
    const token = await signSession(secret, s);
    expect(await verifySession(secret, token, 1000000)).toEqual(s);
    expect(await verifySession(secret, token, 4600000)).toBeNull();
    expect(await verifySession(secret, `${token.slice(0, -1)}x`, 1000000)).toBeNull();
    expect(await verifySession(secret, token, 0)).toBeNull();
    await expect(signSession("short", s)).rejects.toThrow();
  });
});
