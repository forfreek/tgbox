# 实施计划

阶段四本地实现已建立草稿PR #93，依赖#92；以当前STATE为恢复入口，完整数据流/测试/风险查PUBLICATION.md。下一节点阶段五Admin，不提前实施生产部署。

2026-11-28第四阶段实现3e41929的Linux全仓CI 46121763628通过；该节点关闭态可独立验收，未合并/部署。下一阶段在此验收基线建立独立工作树，复用既有Admin权限/CSRF/审计，不把本阶段共享manual函数误当已经暴露的后台接口。

日期：2026-11-28。用户授权独立开发、本地测试及交付；生产操作全部另行确认。

| 阶段 | 可独立验收的交付 | 影响范围 | 兼容性 |
| --- | --- | --- | --- |
| 一 | 最新生产基线、ADR、完整指标/API/配置契约、独立统计迁移及迁移约束测试、AGENTS 索引 | 新包与 docs；不改现有运行时 | 无生产资源依赖 |
| 二 | 共享规范化、HMAC、会话/Telegram 验证适配、请求幂等与原子预算/贡献、Turnstile 防重放、可关闭的写入服务 | packages/search-analytics | 现有 Worker 尚不启用 |
| 三 | 网站/Mini App 1500ms 独立统计和点击合并；Bot 后台统计；公开 API 分层校验和 FTS 复核 | Web/Bot 适配与三语文案 | Pagefind 200ms、URL、缓存保持 |
| 四 | 北京 00:05 Cron、7 完整自然日跨日去重加权、D1 租约及版本发布、KV/公开接口、推荐降级 | Admin 独立 scheduled 入口优先；Web UI | 审核主库故障安全空榜 |
| 五 | 概览、关键词/零结果、榜单、规则审核、配置、安全、任务日志、分页图表与权限审计 | 现有 Admin 路由/组件/函数 | 不改无关认证/页面 |
| 六 | 并发/故障/攻击测试、类型/Lint/集成/SEO回归、独立技术债清单、部署/回滚演练说明 | 专项测试与文档 | 无生产执行 |

## 工作方式

每阶段完成检查、源码审查及 MEMORY/STATE/PLAN 同步，再建立独立 PR。依赖 PR 使用堆叠，但每个节点必须是关闭态可部署、已验收的交付，不长期留下互相依赖且无法验收的半成品。不得自动合并。
每阶段交付记录修改文件、功能、数据流、实际测试、风险及下一步。

## 资源清单

- 新 D1 tgbox-analytics / ANALYTICS_DB，仅统计迁移目录。
- 新 KV tgbox-cache / PUBLIC_CACHE，Admin 发布、Web 读取。
- Web/Bot/Admin 复用；Admin 承担新独立 Cron（需验证 TanStack 入口扩展方式）。
- Web 统计与会话端点原生限流绑定；计划一条仅覆盖新端点的 WAF 限流规则，实际 entitlement 未确认。
- 新本站 managed Turnstile widget；不更改其他站点 widget。
- Secrets 与配置详见 DEPLOYMENT.md；不自动创建任何资源。

## 主要风险与处置

- 客户端结果不可信：保存为报告状态，排名另要求 FTS 复核；搜索不等待统计。
- KV 最终一致性/过期发布：不可变版本键 + D1 主库发布指针和审核 revision；不读无版本旧 alias 作为回退。
- 任务租约不能阻止已超时进程继续写 KV：版本键独立，发布指针 CAS fencing，旧进程无法切换权威指针。
- 攻击导致写放大：边缘近似限流先行，签名/格式检查先于 D1；严格预算 WHERE 原子门禁，拒绝不逐条写日志。
- 1KB JSON 与最大 2048 字符 Turnstile token：token 置受限专用请求头，不放 JSON；Mini App initData 同样放认证头，分别设置头长度上限。
- 8 天身份留存限制可配置榜单周期：第一版窗口只允许 1–7 天，身份保留最少 window+1 天；延长窗口须先改变保留政策。
- 90 天不是 90 天独立用户：超出身份留存只提供身份日，清楚标注。
- 模块依赖和 OpenCC CPU：仅共享包有规则，禁止 Worker 导入 build-only hant，选用构建生成的归并数据并记录语义边界。

## 2026-11-28 阶段二交付边界

阶段一PR #90。阶段二共享服务、0001规则版本迁移与51项库/真实D1验收本地完成，独立堆叠PR以#90分支为base；阶段三至六未开始。按付费确认修订配置与成本评估，不按免费额度刻意限流，不自动改生产参数。实现、数据流、测试、风险及剩余任务见SERVICE.md和STATE.md。

阶段二已交付草稿PR #91（依赖#90），实现398462b的Linux CI 46102332989通过；阶段二验收完成，下一阶段三入口采集。未合并/迁移/部署。

2026-11-28阶段三代码及本地专项验收见COLLECTION.md，工作树tgbox-search-analytics-collection、分支codex/search-analytics-collection；PR/CI以STATE最新记录为准。生产开启前追加两字符LIKE最坏扫描容量检查，不改变已确认2–64字符范围。阶段四继续KV/Cron/清理/版本gate；阶段五Admin；阶段六最终专项与部署准备。

阶段三草稿PR #92已建立，依赖#91；阶段四开工方案和独立验收标准见PUBLICATION-PLAN.md。

2026-11-28阶段四已在tgbox-search-analytics-publication完成本地实现，基于阶段三PR #92；验收/PR/CI查STATE，细节查PUBLICATION.md。新增0003仅统计库，下一节点阶段五Admin的统计/规则/配置/审计界面，阶段六最终容量、安全及技术债专项；不提前启用生产。

2026-11-28阶段五在tgbox-search-analytics-admin完成Admin八视图及管理访问层，验收标准及实际证据见ADMIN-PLAN/ADMIN，PR/CI看STATE。无新迁移、生产配置修改；下一节点阶段六完整安全、资源容量、技术债/SEO与部署准备。
