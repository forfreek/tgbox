import { expect, test, vi } from "vitest";

const fetchHandler = vi.hoisted(() => vi.fn(async () => new Response("existing admin")));
vi.mock("@tanstack/react-start/server-entry", () => ({ default: { fetch: fetchHandler } }));
type Refresh = typeof import("@tgbox/search-analytics")["refreshSearchPublication"];
const refresh = vi.hoisted(() =>
  vi.fn<Refresh>(async () => ({ status: "succeeded", processed: 0, published: false })),
);
vi.mock("@tgbox/search-analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tgbox/search-analytics")>()),
  refreshSearchPublication: refresh,
}));

import worker from "./worker.ts";

test("wrapper preserves existing fetch and leaves disabled or unrelated scheduled invocations inert", async () => {
  const request = new Request("https://admin.test/");
  expect(await (await worker.fetch(request)).text()).toBe("existing admin");
  expect(fetchHandler).toHaveBeenCalledWith(request);
  // Minimal boundary fixture: schedule checks the deployment gate before touching resources.
  const waitUntil = vi.fn();
  const env = { SEARCH_JOBS_ENABLED: "0" };
  const schedule = worker.scheduled;
  expect(typeof schedule).toBe("function");
  // Invoke the exported handler through a structural, minimal fixture only for the disabled path.
  Reflect.apply(schedule, worker, [{ cron: "5 16 * * *" }, env, { waitUntil }]);
  Reflect.apply(schedule, worker, [
    { cron: "* * * * *" },
    { SEARCH_JOBS_ENABLED: "1" },
    { waitUntil },
  ]);
  expect(waitUntil).not.toHaveBeenCalled();
});

test("enabled daily trigger attaches the shared job and supplies the bounded core recommendation query", async () => {
  refresh.mockClear();
  const waitUntil = vi.fn();
  const bind = vi.fn(() => ({ all: async () => ({ results: [{ title: "可信资源" }] }) }));
  const prepare = vi.fn((_sql: string) => ({ bind }));
  Reflect.apply(worker.scheduled, worker, [
    { cron: "5 16 * * *" },
    { SEARCH_JOBS_ENABLED: "1", ANALYTICS_DB: {}, PUBLIC_CACHE: {}, DB: { prepare } },
    { waitUntil },
  ]);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(waitUntil).toHaveBeenCalledTimes(1);
  const call = refresh.mock.calls[0];
  if (!call) throw new Error("Shared job not invoked");
  expect(call[1]).toBe("cron");
  expect(await call[0].recommended()).toEqual(["可信资源"]);
  expect(prepare.mock.calls[0]?.[0]).toContain("e.status='approved'");
  expect(bind).toHaveBeenCalledWith(30);
  await waitUntil.mock.calls[0]?.[0];
});
