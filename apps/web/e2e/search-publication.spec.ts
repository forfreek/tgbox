import { expect, test } from "./test.ts";

test.skip(process.env.TGBOX_E2E_PUBLICATION !== "1", "Dedicated publication build");
test("real ranking displays only actual count and a reopened failed ranking cannot restore old keywords", async ({
  page,
}) => {
  let fail = false;
  const events: unknown[] = [];
  await page.route("**/api/search-event", (route) => {
    events.push(route.request().postDataJSON());
    return route.fulfill({ json: { status: "accepted" } });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/trending", (route) =>
    route.fulfill({
      json: fail
        ? { version: 1, type: "unavailable", items: [] }
        : {
            version: 1,
            type: "trending",
            generatedAt: Date.now(),
            window: { from: "2026-11-21", to: "2026-11-27" },
            items: [
              { keyword: "科技", rank: 1 },
              { keyword: "Telegram", rank: 2 },
            ],
          },
    }),
  );
  await page.goto("/");
  await page.locator("[data-search-trigger]").first().hover();
  await expect(page.locator("astro-island:not([ssr])")).toHaveCount(1);
  await page.locator("#site-search").click();
  const dialog = page.locator("[data-search-dialog]");
  await expect(dialog.getByText("热门搜索", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "科技", exact: true })).toBeVisible();
  expect(await dialog.getByRole("button").count()).toBe(2);
  await expect(dialog).toHaveCSS("opacity", "1");
  if (process.env.TGBOX_E2E_ARTIFACT_DIR)
    await page.screenshot({ path: `${process.env.TGBOX_E2E_ARTIFACT_DIR}/trending-desktop.png` });
  await dialog.getByRole("button", { name: "科技", exact: true }).click();
  await expect(page.locator("[data-search-result]").first()).toBeVisible();
  if (process.env.TGBOX_E2E_ANALYTICS === "1") {
    await expect.poll(() => events.length).toBe(1);
    expect(events[0]).toMatchObject({
      keyword: "科技",
      trigger: "trending",
      reportedResult: "results",
    });
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  fail = true;
  await page.locator("#site-search").click();
  await dialog.getByRole("combobox").fill("");
  await expect(dialog.getByRole("button", { name: "科技", exact: true })).toHaveCount(0);
  await expect(dialog.getByText("推荐搜索", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("unknown API version stays empty without restoring static keywords", async ({ page }) => {
  await page.route("**/api/trending", (route) =>
    route.fulfill({
      json: { version: 2, type: "trending", items: [{ keyword: "旧版词", rank: 1 }] },
    }),
  );
  await page.goto("/?q=科技");
  const dialog = page.locator("[data-search-dialog]");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("");
  await expect(dialog.getByText("旧版词", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("热门搜索", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("推荐搜索", { exact: true })).toHaveCount(0);
});
test("cold start labels a reviewed recommendation without mixing it into a real ranking", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/trending", (route) =>
    route.fulfill({
      json: { version: 1, type: "recommended", items: [{ keyword: "科技", rank: 1 }] },
    }),
  );
  await page.goto("/?q=科技");
  const dialog = page.locator("[data-search-dialog]");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("");
  await expect(dialog.getByText("推荐搜索", { exact: true })).toBeVisible();
  await expect(dialog.getByText("热门搜索", { exact: true })).toHaveCount(0);
  await expect(dialog).toHaveCSS("opacity", "1");
  await expect(dialog.getByRole("button", { name: "科技", exact: true })).toHaveCSS("opacity", "1");
  if (process.env.TGBOX_E2E_ARTIFACT_DIR)
    await page.screenshot({ path: `${process.env.TGBOX_E2E_ARTIFACT_DIR}/recommended-mobile.png` });
});

for (const path of ["/", "/zh-hant/", "/en/"]) {
  test(`failed publication stays empty while local search works: ${path}`, async ({ page }) => {
    await page.route("**/api/trending", (route) =>
      route.fulfill({ status: 503, json: { items: [] } }),
    );
    await page.goto(`${path}?q=科技`);
    const dialog = page.locator("[data-search-dialog]");
    await expect(page.locator("[data-search-result]").first()).toBeVisible();
    await dialog.getByRole("combobox").fill("");
    await expect(dialog.getByRole("button")).toHaveCount(0);
    await dialog.getByRole("combobox").fill("科技");
    await expect(page.locator("[data-search-result]").first()).toBeVisible();
  });
}
