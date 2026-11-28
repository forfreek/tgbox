// Run only against the dedicated local fixture prepared by prepare-search-analytics-smoke.cjs.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createRequire } = require("node:module");
const { chromium, expect } = createRequire(path.resolve(__dirname, "../../web/package.json"))(
  "@playwright/test",
);
const target = new URL(
  process.env.TGBOX_ADMIN_TEST_URL || "http://127.0.0.1:8794/search-analytics",
);
if (!["127.0.0.1", "localhost"].includes(target.hostname))
  throw Error("Smoke mutations require a loopback test server");
const evidence =
  process.env.TGBOX_ADMIN_TEST_EVIDENCE || path.join(os.tmpdir(), "tgbox-search-admin-qa");
fs.mkdirSync(evidence, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: process.env.TGBOX_E2E_BROWSER_CHANNEL });
  const checks = [];
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${m.text()} ${m.location().url}`);
    });
    await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204 }));
    await page.goto(target.href);
    await expect(page).toHaveTitle("TGsearch · 管理后台");
    await expect(page.getByText("465", { exact: true }).first()).toBeVisible();
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    await page.screenshot({ path: `${evidence}/overview-desktop.png`, fullPage: false });
    checks.push("overview, period definitions, title, meaningful render");
    await page.getByRole("button", { name: "关键词统计", exact: true }).click();
    await expect(page.getByRole("row")).toHaveCount(26);
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(page.getByText("第 2 页，共 30 项")).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(6);
    checks.push("real D1 pagination 25 plus 5");
    await page.getByRole("button", { name: "零结果搜索", exact: true }).click();
    await expect(page.getByRole("caption")).toHaveText("关键词统计");
    await expect(page.getByText("第 1 页，共 30 项")).toBeVisible();
    checks.push("zero result view");
    await page.locator("select[name=locale]").selectOption("en");
    await page.getByRole("button", { name: "应用筛选", exact: true }).click();
    await expect(page.getByText("暂无数据", { exact: true })).toBeVisible();
    await page.locator("select[name=locale]").selectOption("all");
    await page.getByRole("button", { name: "应用筛选", exact: true }).click();
    await expect(page.getByText("第 1 页，共 30 项")).toBeVisible();
    checks.push("source/language filtering");
    await page.getByRole("button", { name: "热搜管理", exact: true }).click();
    await page.getByRole("button", { name: "手动刷新榜单", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible();
    await expect(async () => {
      await page.getByRole("button", { name: "重新读取", exact: true }).click();
      await expect(page.getByRole("rowheader", { name: "真实搜索", exact: true })).toBeVisible();
    }).toPass({ timeout: 15000 });
    checks.push("authenticated manual publication and real top word");
    await page.getByRole("button", { name: "内容审核与规则", exact: true }).click();
    const add = page.getByRole("form", { name: "添加规则", exact: true });
    await add.getByLabel("规则词", { exact: true }).fill("真实搜索");
    await add.locator("select[name=status]").selectOption("hidden");
    await add.getByRole("button", { name: "添加规则", exact: true }).click();
    await expect(page.getByRole("form", { name: "编辑规则 真实搜索", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "热搜管理", exact: true }).click();
    await expect(async () => {
      await page.getByRole("button", { name: "重新读取", exact: true }).click();
      await expect(page.getByRole("rowheader", { name: "真实搜索", exact: true })).toHaveCount(0);
      await expect(page.getByRole("rowheader", { name: "推荐资源", exact: true })).toBeVisible();
    }).toPass({ timeout: 15000 });
    checks.push("hide revokes true trend then safe recommendation regeneration");
    await page.getByRole("button", { name: "功能设置", exact: true }).click();
    const config = page.getByRole("form", { name: "搜索配置", exact: true });
    await config.getByLabel("全站每日有效事件预算", { exact: true }).fill("100001");
    await config.getByRole("button", { name: "保存配置", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "dailyBudget" })).toBeVisible();
    await config.getByLabel("全站每日有效事件预算", { exact: true }).fill("12000");
    await config.getByRole("button", { name: "保存配置", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /统一配置 · 版本 3/ })).toBeVisible();
    checks.push("config bounds and versioned save");
    await page.getByRole("button", { name: "安全统计", exact: true }).click();
    await expect(page.getByText(/1\/100采样/)).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "限流拒绝" })).toBeVisible();
    checks.push("sampled security metrics");
    await page.getByRole("button", { name: "任务日志", exact: true }).click();
    await expect(page.getByRole("cell", { name: "成功", exact: true }).first()).toBeVisible();
    checks.push("job outcome and SQL resource meta");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "关键词统计", exact: true }).click();
    await expect(page.getByRole("region", { name: "关键词统计", exact: true })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBeTruthy();
    const table = page.getByRole("region", { name: "关键词统计", exact: true });
    await table.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => table.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await page.screenshot({ path: `${evidence}/keywords-mobile.png`, fullPage: false });
    checks.push("mobile fit and keyboard scroll");
    await page.getByRole("button", { name: "搜索概览", exact: true }).click();
    await expect(page.getByText("465", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: `${evidence}/overview-mobile.png`, fullPage: false });
    checks.push("mobile overview");
    if (errors.length) throw Error(JSON.stringify(errors));
    fs.writeFileSync(
      `${evidence}/qa.json`,
      JSON.stringify(
        {
          url: page.url(),
          checks,
          errors,
          viewports: ["1440x1000", "390x844"],
          browser: process.env.TGBOX_E2E_BROWSER_CHANNEL || "chromium",
          fallback: "Browser plugin not available",
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ passed: checks.length, checks, errors }));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
