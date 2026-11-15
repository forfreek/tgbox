import { Container, getContainer } from "@cloudflare/containers";

/**
 * Proxies one README at a time into the container that runs `importAwesomeReadme`.
 * The container is not on the public internet; this worker is, so it requires IMPORT_TOKEN.
 * Model credentials stay here and are added to the container request. The caller cannot set them.
 */
export class AwesomeImportContainer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "5m";
}

interface Env {
  IMPORT: DurableObjectNamespace<AwesomeImportContainer>;
  IMPORT_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
}

function authorized(request: Request, token: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (presented.length !== token.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= (presented.charCodeAt(i) ?? 0) ^ (token.charCodeAt(i) ?? 0);
  }
  return mismatch === 0;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/import") {
      return new Response("Not found", { status: 404 });
    }
    if (!env.IMPORT_TOKEN) {
      return Response.json({ error: "IMPORT_TOKEN is not configured" }, { status: 503 });
    }
    if (!authorized(request, env.IMPORT_TOKEN)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "expected JSON" }, { status: 400 });
    }
    if (typeof body !== "object" || body === null || !("markdown" in body)) {
      return Response.json({ error: "expected { markdown }" }, { status: 400 });
    }

    const forwarded = {
      markdown: body.markdown,
      fetchProfiles: !("fetchProfiles" in body) || body.fetchProfiles === true,
      ai:
        env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN
          ? { accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN }
          : null,
    };
    return getContainer(env.IMPORT, "awesome-list").fetch("http://container/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(forwarded),
    });
  },
} satisfies ExportedHandler<Env>;
