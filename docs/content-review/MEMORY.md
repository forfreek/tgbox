# 站点内容项目记忆

## 详情页三语开场

2026-11-25 确认开场由 `apps/web/src/lib/seo.ts` 的 `entrySummary` 和 `apps/web/src/i18n/ui-seo.ts` 拼装，详情页正文及 meta description 共用，和收录时保存的 Telegram 原简介、人工稿与 AI 摘要分开。变更在 Web 构建时对既有条目生效。英文用句号连接标识和事实，繁中继续由现有构建转换。检查入口为 `apps/web/src/lib/seo.test.ts` 与 `apps/web/test/build.test.ts`，AI 摘要显示兼容由 `apps/web/test/ai-summary-build.test.ts` 覆盖。
