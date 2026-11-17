import { expect, test } from "./test.ts";

for (const prefix of ["", "en/", "zh-hant/"]) {
  test(`rankings retain defaults, hashes, filters and native disclosure for ${prefix || "zh"}`, async ({
    page,
  }) => {
    await page.goto(`/${prefix}rank/`);
    const root = page.locator("[data-rankings]");
    const defaultTab = await root.getAttribute("data-default-rank");
    await expect(page.locator(`[data-rank-tab="${defaultTab}"]`)).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.goto(`/${prefix}rank/#weekly`);
    await expect(page.locator('[data-rank-tab="weekly"]')).toHaveAttribute("aria-selected", "true");
    await page.goto(`/${prefix}rank/#unknown`);
    await expect(page.locator(`[data-rank-tab="${defaultTab}"]`)).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.locator('[data-rank-tab="newest"]').click();
    await page.locator('[data-rank-kind="bot"]').click();
    const visible = page.locator('[data-rank-panel="newest"] [data-rank-item]:not([hidden])');
    for (const row of await visible.all()) await expect(row).toHaveAttribute("data-kind", "bot");
    await page.locator('[data-rank-kind="all"]').click();
    await expect(page.locator('[data-rank-panel="newest"] [data-rank-item][hidden]')).toHaveCount(
      0,
    );

    const summary = page.locator("[data-rank-method] summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-rank-method] details")).toHaveAttribute("open", "");
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-rank-method] details")).not.toHaveAttribute("open");
  });
}

test("English rankings fit a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/rank/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator("[data-rank-timestamp]")).toContainText("UTC+08:00");
});
