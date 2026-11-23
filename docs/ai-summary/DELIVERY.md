# 多语言、质量与运维方案

2026-11-22 待确认设计和价格快照。实际模型输出、账户额度及生产部署未验证。源事实见 [AUDIT](AUDIT.md)，任务和表见 [DESIGN](DESIGN.md)。

## 多语言及后台

一次生成简中和英文，共享逐句证据，繁中复用现有构建 OpenCC。原简介独立判断语言，覆盖日、俄、阿语及混排，未知语种抽检或跳过。保护品牌和标识，校验最终繁体 HTML 及 metadata。人工编辑简中和英文，后台同时预览三语。

在现有 adminMiddleware 下增 AI 摘要页。按类型、状态和版本筛选，显示积压、今日配额、失败/跳过原因。支持白名单模型选择、日配额、批量预检/提交、暂停/恢复、失败重试、编辑、锁定/解锁、批准/撤回及抽检。详情并排展示来源、证据和修订差异。沿用 audit_log，发布前复查来源及编辑版本。

## 静态接入、灰度及回退

scripts/build-site.ts 以默认关闭开关导出摘要 public 和 public_config。迁移缺失或可选摘要输入读取失败时使用既有快照，单条坏摘要在 SiteData 整体解析前降为 null。复核复用当前构建实际读取的频道帖子。生成、重试和草稿不触发构建，批准、撤回、灰度按批调度。

首轮仅替换详情首段正文，metadata 在内容验证后独立放开，继续使用当前截断预算。保持 URL、canonical、hreflang、robots、sitemap 规则及 lastmod 来源，摘要不改 entries.updated_at。保留 Pagefind 范围、语言目录和区域，索引词随可见首段变化。Bot FTS、公开导出、卡片、Telegram 公告及原简介沿用当前契约。

独立发布修订号记录本次导出的版本，成功部署后只确认该版。构建中发生的新发布保持待发布，不能单靠 dirty_since 清理确认。合并批量构建，避免每条结果重跑全量 Astro/Pagefind。

先仅存草稿，全部人工审阅，再固定白名单，按 entryId 稳定分桶扩大到 5%、25%、100%，每条三语同步。暂停生成保留已批准内容。关闭展示需触发一次静态重建发布，部署前拦截或取消在途增强构建。严重问题可恢复已验证的无增强 Web 版本，再以最新数据重建。原始资料、修订和队列可继续保留。

## 模型与质量测试

步骤四最新实际结果见 [PILOT](PILOT.md)，接口与复现见 [MODELS](MODELS.md)。2026-11-22 用户确认付费 Workers，要求用 10–20 条来源确认模型与提示词，取代此前 120 条评分提案。最终选定 Gemma + summary-prompt-v2 / summary-params-v3，不再要求扩大样本后才进入下一节点。

本轮共 12 条来源、18 次尝试，最终配置 10 条全部通过结构与逐句源文核对，2 条预检跳过；中英及现有 OpenCC 繁体文本已核对。GLM 的旧配置出现格式与用途误判，未进入支持白名单；Llama 本轮未运行。后台只允许已验证模型与版本。现有 Gemma 分类调用不构成摘要质量验证，本次选择依据独立真实摘要响应。

本次按小批逐句核事实、引用、双语和繁体转换，保留旧版失败、修订版本、延迟与用量，不以 10 条结果推算全站正确率。短资料保持短句，不为凑信息增量而编写事实。早期 98%/80% 大样本建议不再作为本次门禁；拟公开内容仍须无严重事实错误或隐藏泄漏，初期全审，后续根据真实业务抽检决定是否扩大自动化。页面 HTML/metadata 及信息价值、SEO 效果在后续节点分别验收。

模型目录与 JSON Mode 说明可能有差异，本次已验证 Gemma 的 json_schema 和关闭思考参数，不因目录列表漏项否认实测。其他型号能力仍需各自验证，不照搬。此前查询的 qwen3-30b-a3b-fp8 页面标记 Deprecated，不作为默认推荐。

## 成本快照与估算

最新试跑 16 个已知响应报告约 92.878 Neurons，token 标价估算约 $0.001063；两个送达未知请求费用不按零计，整体账单未知，见 PILOT。用户已确认付费 Workers，不再提议新增付费套餐。以下 2,000 条及其他生态用量为早期容量假设，不是本次实付结果。

按 2,000 条，每条一次，平均 900 输入和 250 计费输出 token，未抵免费额度。模型可能产生额外计费输出，用量以实测替换。Gemma 输入 $0.10/M、输出 $0.30/M，本轮约 $0.33，20% 等量重试约 $0.40，约 30,000 Neurons。GLM 按输入约 $0.060–0.0605/M、输出 $0.40/M，约 $0.31；Llama 3.3 按 $0.293/$2.253，约 $1.65。100 条 Gemma 约 1,500 Neurons/日。每日 10,000 免费 Neurons 与分类/翻译共享，按 UTC 重置。若需 Workers Paid，当时最低 $5/月。以上为 2026-11-22 查询估算。

2,000 条小队列消息顺利处理约 6,000 操作，重试/DLQ 另计。当时 Free 包含每天 10,000 操作，Paid 包含每月 100 万操作，超额 $0.40/百万。D1 记录实际读写行及索引写入。每天检查 1,000 频道对象约 30,000 R2 HEAD/月，加变化对象 GET。是否落免费额度取决于账户总用量。批量发布还需计入全量构建耗时、内存和 Actions 用量。

官方证据入口如下，实施时按问题单独刷新。

- [Gemma 模型](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/) · [GLM 模型](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/) · [Llama 模型](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/)
- [JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/) · [AI 定价](https://developers.cloudflare.com/workers-ai/platform/pricing/) · [Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)
- [Queues 至少一次投递](https://developers.cloudflare.com/queues/reference/delivery-guarantees/) · [重试](https://developers.cloudflare.com/queues/configuration/batching-retries/) · [定价](https://developers.cloudflare.com/queues/platform/pricing/)
- [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) · [D1 定价](https://developers.cloudflare.com/d1/platform/pricing/) · [R2 定价](https://developers.cloudflare.com/r2/pricing/)
