import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  importAwesomeReadme,
  parseAwesomeImportRequest,
  workersAiCategoryClassifier,
} from "../../../packages/telegram/src/awesome-import.ts";

const PORT = 8080;
const MAX_BODY = 2_000_000;

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += buf.length;
    if (size > MAX_BODY) throw new Error("too large");
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const path = req.url?.split("?")[0];
  if (req.method === "GET" && (path === "/" || path === "/ping")) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  if (req.method !== "POST" || path !== "/import") {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const body: unknown = JSON.parse(await readBody(req));
    const parsed = parseAwesomeImportRequest(body);
    if (!parsed) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "expected { markdown }" }));
      return;
    }
    const report = await importAwesomeReadme(parsed.markdown, {
      fetch,
      fetchProfiles: parsed.fetchProfiles,
      classify: parsed.ai ? workersAiCategoryClassifier(parsed.ai) : undefined,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(report));
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "too large";
    res.writeHead(tooLarge ? 413 : 400);
    res.end();
  }
}

const server = createServer((req, res) => {
  handle(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

server.listen(PORT, "0.0.0.0");
