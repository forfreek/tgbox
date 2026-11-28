import { expect, test } from "./test.ts";

test.skip(process.env.TGBOX_E2E_PUBLICATION === "1", "Dedicated disabled publication build");
for (const path of ["/", "/zh-hant/", "/en/"]) {
  test(`disabled publication cannot restore static resource recommendations: ${path}`, async ({
    page,
  }) => {
    let calls = 0;
    await page.route("**/api/trending", (route) => {
      calls++;
      return route.fulfill({
        json: { version: 1, type: "trending", items: [{ keyword: "已隐藏的词", rank: 1 }] },
      });
    });
    await page.goto(`${path}?q=科技`);
    const dialog = page.locator("[data-search-dialog]");
    await expect(dialog).toBeVisible();
    await expect(page.locator("[data-search-result]").first()).toBeVisible();
    await dialog.getByRole("combobox").fill("");
    await expect(dialog.getByRole("button")).toHaveCount(0);
    expect(calls).toBe(0);
    const islandProps = await page
      .locator('astro-island[component-url*="SearchDialog"]')
      .getAttribute("props");
    expect(islandProps).not.toContain("hotKeywords");
    await dialog.getByRole("combobox").fill("科技");
    await expect(page.locator("[data-search-result]").first()).toBeVisible();
  });
}
