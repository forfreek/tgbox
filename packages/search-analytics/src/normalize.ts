import { characterFold } from "./character-fold.gen.ts";
import { HARD_LIMITS } from "./config.ts";

export type NormalizedKeyword = { keyword: string; display: string; review: boolean };
export type NormalizeResult =
  | { ok: true; value: NormalizedKeyword }
  | { ok: false; reason: "invalid" | "private" };
const unsafe = /[<>{}\p{Cf}]|javascript:/iu;
// Public @usernames and t.me/username are deliberately allowed; private invite links are not.
const privateContent =
  /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?<![\p{L}\p{N}_])\+?\d(?:[\s().-]*\d){7,}(?![\p{L}\p{N}_])|(?:\d{1,3}\.){3}\d{1,3}|(?:password|passwd|api[_ -]?key|secret|token|密码|密碼|私钥|私鑰)\s*[:=：]|-----begin|(?:sk|ghp|github_pat)[_-][a-z0-9_-]{12,}|t\.me\/(?:\+|joinchat\/)|(?:https?:\/\/)?[^\s/]+\/[^\s]*[?&](?:token|key|auth)=)/iu;
const highEntropy = /(?:\b[a-f0-9]{32,}\b|\b[a-z0-9_+/=-]{40,}\b)/iu;
export function normalizeKeyword(raw: string): NormalizeResult {
  if (
    [...raw].length > HARD_LIMITS.keywordMax ||
    unsafe.test(raw) ||
    [...raw].some((c) => /\p{Cc}/u.test(c) && !/\s/u.test(c))
  )
    return { ok: false, reason: "invalid" };
  const display = raw
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const length = [...display].length;
  if (length < HARD_LIMITS.keywordMin || length > HARD_LIMITS.keywordMax)
    return { ok: false, reason: "invalid" };
  if (privateContent.test(display) || highEntropy.test(display))
    return { ok: false, reason: "private" };
  const keyword = [...display.toLowerCase()].map((c) => characterFold[c] ?? c).join("");
  if ([...keyword].length > HARD_LIMITS.keywordMax) return { ok: false, reason: "invalid" };
  // Promotional but not private phrases are accepted for analysis, withheld pending moderation.
  const review =
    /(?:推广合作|推广联系|广告合作|加我|联系我|博彩|赌博|代开发票|购买账号|buy followers|dm me|contact me)/iu.test(
      keyword,
    );
  return { ok: true, value: { keyword, display, review } };
}
