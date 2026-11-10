// Resolve Workers AI credentials for local import scripts.
// Prefer CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN; fall back to wrangler OAuth.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type CfAiCredentials = { accountId: string; apiToken: string };

const DEFAULT_ACCOUNT_ID = "152fd11a0e36927bf20f6fc9ab2bc4fa";

function oauthTokenFromWranglerConfig(): string | null {
  const path = join(homedir(), ".config", ".wrangler", "config", "default.toml");
  try {
    const toml = readFileSync(path, "utf8");
    return /oauth_token\s*=\s*"([^"]+)"/.exec(toml)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function resolveCfAiCredentials(): CfAiCredentials | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || DEFAULT_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim() || oauthTokenFromWranglerConfig();
  if (!accountId || !apiToken) return null;
  return { accountId, apiToken };
}
