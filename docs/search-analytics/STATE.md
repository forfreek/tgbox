# 当前状态

核验日期：2026-11-28（Asia/Shanghai）。
工作树：C:/Users/123/tgbox-search-analytics。
分支：codex/search-analytics-stage1；基线 origin/main d150e0d20041eb3a1c5d1315672bf0cb54c17e8f。
当前节点：阶段一已交付草稿 PR #90；运行时功能尚未接入。下一阶段在独立 service 工作树开发。

## 已核验事实

- 原入口 C:/Users/123/tgbox 在 cursor/about-drop-awesome-list，8 个已跟踪文件及若干未跟踪资料存在用户改动；未覆盖。
- 远端 main 仍为 d150e0d；Web 当前 100% 版本 7f7c763f-7999-4730-b24f-0c3001420443，对应构建 46093910802；Bot ac61a4c4、Admin 8923c4ef。版本为核验快照。
- 核心 D1 tgbox 存在；未发现 tgbox-analytics、tgbox-cache 或 TGSearch 专用 Turnstile widget。三 Worker 无统计 D1、KV、原生限流绑定。
- tgsearch.app 是 Free Website；可见 WAF 只有一条停用的 media skip 自定义规则，没有活动 http_ratelimit ruleset。账户订阅 API 403，Workers 订阅/额度未确认，不能从域名 Free 推断 Workers Free。
- Admin 使用 adminMiddleware + Access JWT/Telegram allowlist；已有 AI 摘要 POST Origin 校验可复用模式；其他模块的校验不自动证明新接口安全。
- Mini App verifyInitData 验签并校验 24h 有效期和 60s 时钟偏差；统计适配不得经 authenticateApp 强依赖核心 DB 用户查询。
- Bot webhook 已校验 Telegram secret header；inline 缓存 300s 保持。
- @tgbox/hant 明确仅用于构建，不能直接复用其入口做 Worker 简繁归并。
- 动态化未合并 PR 不属于生产能力。

## 用户确认的架构调整

1. KV 榜单读取前允许统计 D1 审核版本校验；不一致/故障返回空榜。
2. 网站/Mini App 手动上榜候选接受额外服务端核心 FTS 验证；两引擎不一致单独计量。

## 边界

未执行生产迁移、资源修改、WAF 修改、Secrets 写入、部署或 main 合并。
本地迁移和测试结果须在实际执行后追加，不能以计划代替结果。

## 阶段一验证记录

- 新包 Biome check、TypeScript、Workers D1迁移/契约测试 8/8 通过。
- 全仓 Lint通过，3条既有警告；全仓类型检查11/11通过，Astro零诊断。
- pnpm check 被基线Windows CRLF格式阻断；没有提交全仓格式变化。
- 全仓串行包测试在snapshot既有5000ms测试超时停止；snapshot文件串行复跑及其余包继续检查中。结果未完成前不宣称全仓测试通过。
- 本节点只有事件契约与Schema，无现有Worker运行时绑定/路由/搜索变更。

阶段一草稿PR：https://github.com/forfreek/tgbox/pull/90，代码5b42156。snapshot的超时用例独立运行（临时testTimeout=30000）1/1通过，原测试文件未改；全仓其他包与Linux CI仍在检查。阶段一不包含实际采集、聚合或后台页面，不将契约当功能上线。

2026-11-28 Linux CI 46097134175 全部通过（2m5s）；PR #90仍为草稿未合并。下一阶段工作树C:/Users/123/tgbox-search-analytics-service，分支codex/search-analytics-service；阶段二尚未交付。
