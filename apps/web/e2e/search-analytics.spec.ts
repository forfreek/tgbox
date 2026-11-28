import type { Page } from "@playwright/test";
import { expect, test } from "./test.ts";

test.skip(
  process.env.TGBOX_E2E_ANALYTICS !== "1",
  "Dedicated opt-in build; default production feature stays off",
);
async function openSearch(page: Page) {
  await page.goto("/");
  await page.locator("[data-search-trigger]").first().hover();
  await expect(page.locator("astro-island:not([ssr])")).toHaveCount(1);
  await page.locator("#site-search").click();
  await expect(page.locator("[data-search-dialog]")).toBeVisible();
  return page.locator("[data-search-dialog]").getByRole("combobox");
}
test("IME composition is silent; quick result navigation reports one final event", async ({
  page,
}) => {
  const events: unknown[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/search-event", async (route) => {
    events.push(route.request().postDataJSON());
    await route.fulfill({ json: { status: "accepted", debounceMs: 1500 } });
  });
  const input = await openSearch(page);
  await input.dispatchEvent("compositionstart");
  await input.fill("科技");
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: true, keyCode: 229 });
  await page.waitForTimeout(1700);
  expect(events).toHaveLength(0);
  await expect(page).toHaveURL(/4329\/$/);
  await input.dispatchEvent("compositionend", { data: "科技" });
  await expect(page.locator("[data-search-result]").first()).toBeVisible();
  expect(errors).toEqual([]);
  if (process.env.TGBOX_E2E_ARTIFACT_DIR)
    await page.screenshot({ path: `${process.env.TGBOX_E2E_ARTIFACT_DIR}/desktop-search.png` });
  await page.locator("[data-search-result]").first().click();
  await expect(page).toHaveURL(/\/detail\//);
  await expect.poll(() => events.length).toBe(1);
  expect(events[0]).toMatchObject({
    keyword: "科技",
    trigger: "manual",
    reportedResult: "results",
  });
  // Edge can abort the existing cross-document View Transition after navigation.
  expect(
    errors.filter(
      (message) =>
        message !==
        "Transition was aborted because of invalid state. ViewTransition opt-in disabled",
    ),
  ).toEqual([]);
});
test("mobile zero results and service outage preserve Pagefind and search URLs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const events: unknown[] = [];
  await page.route("**/api/search-event", async (route) => {
    events.push(route.request().postDataJSON());
    await route.fulfill({ status: 503, json: { status: "unavailable" } });
  });
  const input = await openSearch(page);
  await input.fill("肯定没有这个词xyz");
  await expect(page.getByText("没有找到相关条目", { exact: true })).toBeVisible();
  if (process.env.TGBOX_E2E_ARTIFACT_DIR)
    await page.screenshot({ path: `${process.env.TGBOX_E2E_ARTIFACT_DIR}/mobile-zero-search.png` });
  await expect.poll(() => events.length).toBe(1);
  expect(events[0]).toMatchObject({ reportedResult: "zero" });
  await input.fill("科技");
  await expect(page.locator("[data-search-result]").first()).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "http://127.0.0.1:4329/",
  );
});
test("URL prefill/refresh creates no event; recommendation clicks carry their own trigger", async ({
  page,
}) => {
  test.skip(
    process.env.TGBOX_E2E_PUBLICATION !== "1",
    "Recommendations require reviewed API publication",
  );
  await page.route("**/api/trending", (route) =>
    route.fulfill({
      json: { version: 1, type: "recommended", items: [{ keyword: "Telegram News", rank: 1 }] },
    }),
  );
  const events: unknown[] = [];
  await page.route("**/api/search-event", async (route) => {
    events.push(route.request().postDataJSON());
    await route.fulfill({ json: { status: "accepted" } });
  });
  await page.goto("/?q=科技");
  await expect(page.locator("[data-search-result]").first()).toBeVisible();
  await page.waitForTimeout(1700);
  expect(events).toHaveLength(0);
  await page.reload();
  await expect(page.locator("[data-search-result]").first()).toBeVisible();
  await page.waitForTimeout(1700);
  expect(events).toHaveLength(0);
  const input = page.locator("[data-search-dialog]").getByRole("combobox");
  await input.fill("");
  await page
    .locator("[data-search-dialog]")
    .getByRole("button", { name: "Telegram News", exact: true })
    .click();
  await expect.poll(() => events.length).toBe(1);
  expect(events[0]).toMatchObject({ trigger: "recommended" });
});

test("Mini App reuses collector and sends launch proof without a client identity or source", async ({
  page,
}) => {
  const events: { body: unknown; proof: string | undefined }[] = [];
  await page.addInitScript(() =>
    sessionStorage.setItem("tgbox-app:init-data", "test-launch-proof"),
  );
  await page.route("**/api/app/search-event", async (route) => {
    events.push({
      body: route.request().postDataJSON(),
      proof: route.request().headers()["x-telegram-init-data"],
    });
    await route.fulfill({ json: { status: "accepted" } });
  });
  await page.goto("/app/");
  const input = page.locator("#app-browse-search");
  await expect(input).toBeVisible();
  await input.fill("科技");
  await expect(page.getByText("开发者日报", { exact: true })).toBeVisible();
  await expect.poll(() => events.length).toBe(1);
  expect(events[0]?.proof).toBe("test-launch-proof");
  expect(events[0]?.body).toMatchObject({
    keyword: "科技",
    trigger: "manual",
    reportedResult: "results",
  });
  expect(events[0]?.body).not.toHaveProperty("identity");
  expect(events[0]?.body).not.toHaveProperty("source");
});

test("Turnstile loads on demand and retries the same event at most once", async ({ page }) => {
  const ids: unknown[] = [];
  await page.unrouteAll({ behavior: "wait" });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4329\/|challenges\.cloudflare\.com\/)/, (route) =>
    route.abort(),
  );
  await page.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: 'window.turnstile={render:(element,options)=>{setTimeout(()=>options.callback("local-test-token"),0);return "widget"},remove:()=>{}};',
      }),
  );
  await page.route("**/api/search-event", async (route) => {
    ids.push(route.request().postDataJSON().eventId);
    await route.fulfill(
      ids.length === 1
        ? {
            status: 403,
            json: {
              status: "challenge",
              siteKey: "local-test-key",
              action: "search_analytics",
              context: "safe-context",
            },
          }
        : { json: { status: "accepted" } },
    );
  });
  await page.route("**/api/search-verify", async (route) => {
    expect(route.request().headers()["x-turnstile-token"]).toBe("local-test-token");
    await route.fulfill({ json: { status: "verified" } });
  });
  const input = await openSearch(page);
  await input.fill("科技");
  await expect.poll(() => ids.length).toBe(2);
  expect(ids[0]).toBe(ids[1]);
  await expect(page.locator("[data-search-result]").first()).toBeVisible();
});
