import { defaultSettings } from "@tgbox/search-analytics/config";
import { beforeEach, expect, test, vi } from "vitest";

type Context = Record<string, unknown>;
type Step = (args: {
  next: (options?: { context?: Context }) => Promise<unknown>;
}) => Promise<unknown>;
const state = vi.hoisted(() => ({
  request: new Request("http://localhost/_server"),
  status: 200,
  headers: new Map<string, string>(),
  read: vi.fn(async () => ({ kind: "settings", settings: { version: 1 } })),
  command: vi.fn(async () => ({ saved: true })),
  waitUntil: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({
  env: { ADMIN_DEV_BYPASS: "1", SETTINGS_KEY: "x".repeat(32) },
  waitUntil: state.waitUntil,
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => state.request,
  setResponseStatus: (n: number) => {
    state.status = n;
  },
  setResponseHeader: (k: string, v: string) => state.headers.set(k, v),
}));
vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => {
    const builder = { client: (_fn: unknown) => builder, server: (fn: Step) => ({ step: fn }) };
    return builder;
  },
  createServerFn: () => {
    let middlewares: { step: Step }[] = [];
    let validator: { parse: (raw: unknown) => unknown };
    const builder = {
      middleware: (steps: { step: Step }[]) => {
        middlewares = steps;
        return builder;
      },
      validator: (schema: typeof validator) => {
        validator = schema;
        return builder;
      },
      handler:
        (handler: (args: { data: unknown; context: Context }) => Promise<unknown>) =>
        async ({ data }: { data: unknown }) => {
          let context: Context = {};
          const run = (i: number): Promise<unknown> => {
            const middleware = middlewares[i];
            return middleware
              ? middleware.step({
                  next: async (options) => {
                    context = { ...context, ...options?.context };
                    return run(i + 1);
                  },
                })
              : handler({ data: validator.parse(data), context });
          };
          return run(0);
        },
    };
    return builder;
  },
}));
// Preserve the actual admin middleware and authenticate(); only database construction is inert.
vi.mock("@tgbox/db", () => ({ createDb: vi.fn(() => ({})) }));
vi.mock("@/server/search-analytics.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/search-analytics.ts")>()),
  searchAdminRead: state.read,
  searchAdminCommand: state.command,
}));
const { $searchAnalytics, $searchAnalyticsCommand } = await import("./search-analytics.ts");
const query = {
  version: 1 as const,
  view: "settings" as const,
  from: "2026-11-28",
  to: "2026-11-28",
  source: "all" as const,
  locale: "all" as const,
  search: "",
  sort: "searches" as const,
  page: 0,
  size: 25,
  ruleStatus: "all" as const,
};
const commands = [
  { version: 1 as const, action: "settings" as const, expectedVersion: 1, value: defaultSettings },
  { version: 1 as const, action: "refresh" as const, expectedVersion: 1 },
  {
    version: 1 as const,
    action: "rule" as const,
    id: 0,
    expectedRevision: 0,
    pattern: "example",
    match: "exact" as const,
    status: "hidden" as const,
    enabled: true,
  },
] as const;
beforeEach(() => {
  vi.clearAllMocks();
  state.status = 200;
  state.headers.clear();
});

test("the new GET server function executes real admin authentication before database access", async () => {
  state.request = new Request("https://admin.example.com/_server");
  await expect($searchAnalytics({ data: query })).rejects.toThrow("Unauthorized");
  expect(state.status).toBe(401);
  expect(state.read).not.toHaveBeenCalled();
  expect(state.headers.get("Cache-Control")).toBe("no-store");
  state.request = new Request("http://localhost/_server");
  await $searchAnalytics({ data: query });
  expect(state.read).toHaveBeenCalledOnce();
});
test.each(commands)(
  "POST $action rejects an unauthenticated caller before mutation",
  async (data) => {
    state.request = new Request("https://admin.example.com/_server", {
      method: "POST",
      headers: { Origin: "https://admin.example.com" },
    });
    await expect($searchAnalyticsCommand({ data })).rejects.toThrow("Unauthorized");
    expect(state.command).not.toHaveBeenCalled();
    expect(state.status).toBe(401);
  },
);
test.each([
  "https://evil.test",
  "https://localhost",
  "http://localhost:9999",
  "null",
  "http://localhost/path",
  "",
])("authenticated admin POST rejects incorrect Origin %s", async (origin) => {
  state.request = new Request("http://localhost/_server", {
    method: "POST",
    headers: origin ? { Origin: origin } : {},
  });
  await expect($searchAnalyticsCommand({ data: commands[0] })).rejects.toThrow("Forbidden origin");
  expect(state.command).not.toHaveBeenCalled();
  expect(state.status).toBe(403);
});
test.each(commands)(
  "authenticated same-origin POST $action forwards trusted actor and lifetime",
  async (data) => {
    state.request = new Request("http://localhost/_server", {
      method: "POST",
      headers: { Origin: "http://localhost" },
    });
    await $searchAnalyticsCommand({ data });
    expect(state.command).toHaveBeenCalledWith(
      expect.any(Object),
      data,
      "email:dev@localhost",
      state.waitUntil,
    );
  },
);
test("GET cannot execute the POST guard and malformed input never reaches the adapter", async () => {
  state.request = new Request("http://localhost/_server", {
    headers: { Origin: "http://localhost" },
  });
  await expect($searchAnalyticsCommand({ data: commands[0] })).rejects.toThrow("Forbidden origin");
  state.request = new Request("http://localhost/_server");
  await expect($searchAnalytics({ data: { ...query, size: 101 } })).rejects.toThrow();
  expect(state.read).not.toHaveBeenCalled();
  expect(state.command).not.toHaveBeenCalled();
});
