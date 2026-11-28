# 阶段五：Admin搜索分析实施报告

核验日期2026-11-28（Asia/Shanghai）。独立工作树C:/Users/123/tgbox-search-analytics-admin，分支codex/search-analytics-admin，基于0130d88 / 阶段四PR #93。远端main重新核验为d150e0d；#93未合并且CI46122070032通过。没有将本分支功能视作生产功能；本阶段未重新核验生产Worker部署版本。

## 已实现与数据流

后台 /search-analytics 包含八个按需加载的视图：概览、关键词、零结果、热搜、审核规则、安全、配置、任务日志。复用后台外壳、Button/Card/Input、React Query、TanStack路由和现有管理员认证。桌面/移动保留同一设计语言，表格独立滚动及键盘可达；不引入图表/数据源依赖。概览提供今日/昨日/7/30/90天卡片、趋势、来源/语言；关键词有日期/来源/语言/安全关键词、白名单排序与分页；任务日志附独立统计库操作审计分页，不输出身份哈希或完整审计payload。

数据流：浏览器纯契约 → createServerFn → adminMiddleware → POST精确同源保护 → 共享readSearchAdmin/changeSearchAdmin → 独立统计D1。正常读页面不写审计；写操作在D1 batch中原子执行CAS和HMAC审计。审核规则由0001触发器递增revision，旧公开榜单立即失配，随后best-effort后台重建。人工刷新await同一聚合函数，明确completed/busy/failed；配置/规则保存的waitUntil不保证送达，日志/人工刷新恢复。推荐回调只读核心库批准资源标题；不设置dirty，不构建部署，不影响Pagefind/Bot搜索。

排名由新ranking.ts集中维护，发布和Admin共用同一跨日身份去重/时间权重SQL。关键词页的资格得分是当前全球完整日窗口，已发布分数则来自0003的精确发布快照。100条页面分成最多80词一组复核，遵守D1每SQL100绑定参数上限。没有复制算法。

## 文件与职责

| 路径 | 作用 |
| --- | --- |
| packages/search-analytics/src/admin-contracts.ts | v1查询/命令schema、筛选/页大小/范围限制 |
| packages/search-analytics/src/admin.ts | readSearchAdmin八视图、changeSearchAdmin事务CAS/审计 |
| packages/search-analytics/src/ranking.ts | readSearchRanks共享排名SQL，publication.ts改为调用 |
| packages/search-analytics/src/admin.test.ts | 真实workerd/D1统计、CAS、审核、审计回滚、100词页及资源快照 |
| apps/admin/src/functions/search-analytics.ts | GET/POST权限、Origin及no-store、React Query |
| apps/admin/src/server/search-analytics.ts | 可信管理员HMAC/失败脱敏/后台或显式刷新生命周期 |
| apps/admin/src/server/search-publication.ts、worker.ts | Cron和人工共用推荐及任务适配器，原fetch委派保持 |
| apps/admin/src/features/search-analytics/* | 页面、八视图、规则表单、配置表单、语义表格及展示辅助，按职责拆分 |
| apps/admin/src/routes/search-analytics.tsx、components/shell/nav.ts、routeTree.gen.ts | 新后台入口 |
| apps/admin/test/*search-analytics* | 仅loopback的可复现本地fixture/真实浏览器验收 |
| docs/search-analytics/* | API/ADR/口径/配置/Schema/资源/Runbook/部署/技术债与节点报告 |

新增包子路径只导出纯config/admin-contracts给浏览器。模块依赖仍apps→共享包→Telegram/基础契约，没有反向apps依赖；不增第三方依赖，不改核心数据库。新增迁移0，云资源0，Worker0，Secrets0；复用Admin既有SETTINGS_KEY至少32字符+独立HMAC用途域，Admin无需采集身份Secret。默认部署开关不变。

## 验证结果

- 共享包83/83通过，其中14项Admin真实D1；Admin136/136通过，其中新GET/POST真实认证中间件、全部命令未授权拒绝、同源/端口/方法/无Origin拒绝、适配器失效与手动任务结果。认证harness仅替代框架执行器和DB构造/服务调用，实际authenticate/adminMiddleware执行；既有Access/TG密码学测试随Admin套件回归。
- 真实D1覆盖90天/身份日口径、跨入口COUNT DISTINCT、筛选/分页/排序、注入文本、范围限制、并发CAS、重复规则/500规则容量、审计故障回滚、配置边界、规则变更撤回、精确发布分数、失效得分隐藏、采样指标与日志；数据库迁移仅本地fixture。
- 全仓类型11/11通过；Lint通过，3条既有警告（friend-links无效抑制、BaseLayout arguments、历史大JSON）。后续最终构建与CI记录以STATE为准。
- Edge真实浏览器11条交互检查通过：概览/身份口径、25+5分页、零结果、语言筛选、手动生成真实榜、隐藏后撤回并重建推荐、预算上限和版本保存、安全样本、任务结果、移动无溢出/键盘滚动、移动概览。控制台相关错误0；缺失favicon使用fixture204拦截，未遮蔽业务错误。截图已逐张查看。
- 浏览器环境http://127.0.0.1:8794/search-analytics，1440×1000及390×844，已安装msedge；Browser plugin not available，依前端测试技能回退现有Playwright。没有下载安装浏览器。
- 没有以本地开发认证模式代替生产真实Access/TG/WAF与绑定验收；新专题第六阶段将做最终安全、容量、技术债及SEO/全仓回归。

## 本地浏览器复现

在仓库根执行node apps/admin/test/prepare-search-analytics-smoke.cjs，只重置专用LOCAL假ID数据库与忽略目录文件（核心推荐只有最小夹具表，不代替全核心回归）。在apps/admin运行pnpm exec vite --config node_modules/.cache/search-admin.vite.config.ts；另一终端设置TGBOX_E2E_BROWSER_CHANNEL=msedge（或已安装浏览器）后node apps/admin/test/search-analytics-smoke.cjs。TGBOX_ADMIN_TEST_EVIDENCE可指定截图目录。脚本禁止非loopback目标；不要将仅开发配置用于部署。

证据C:/Users/123/.codex/visualizations/2026/11/28/search-analytics-stage5/{qa.json,overview-desktop.png,overview-mobile.png,keywords-mobile.png}。仓库不提交本机截图路径数据或凭证。固定夹具可以重复初始化，不删除其他本地或生产库。

## 资源与限制

90天×10词=900日聚合行夹具：概览1814读/0写，关键词页3663读/0写，配置CAS+审计3读/3写；排除设置读取、失败查询/网络与外部FTS/KV，不作为生产账单。无自动轮询，后台访问和操作才增加请求；100相同页面约18.14万/36.63万读另加设置读取。参考RESOURCE-USAGE和真实snapshot。账号Paid额度不在本节点自动变更。

后台关键词分组/COUNT DISTINCT/offset仍随所选数据规模增长；页面最多100/日期90天/页号999，不宣传常量成本。独立身份不是精确真人；30/90天显示身份日；安全记录为1%有日封顶样本，Telegram300秒缓存查询会漏采。人工批准不追补被审核排除的贡献，不绕过自动过滤/最低上榜门槛。

手动请求保持连接可等待库内90秒任务预算，断连仍可能中断；规则保存后waitUntil受HTTP延长时间限制，先严格撤回保障安全，下次人工/Cron及120秒租约恢复保障可操作恢复。未引入Queues/DO，不假称恰好一次后台调度。

## 安全与技术债结论

本节点新增读写无未闭环P0；CAS/审计、输入绑定、最小输出、自动转义、所有server fn认证和同源、日志脱敏、旧榜失效、身份隐私已本地验证。数据库审计在统计库同事务，不双写核心库制造跨库原子性假象。已避免无用依赖/重复索引/算法复制/any与类型抑制。完整独立专项审查尚未执行，不宣传生产安全验收完成。

P1生产绑定/真实认证、500规则与高预算吞吐仍须部署前解决；P2后台生命周期/区间查询成本/审核不追补，P3样本与显示精度均已在DEBT记录原因、影响、建议和触发条件。原工作区用户改动保留；未创建修改生产资源、未迁移生产、未部署或合并。下一阶段六最终验证与部署准备。

## Modern Web Guidance

- responsive-table：我保留语义table/表头/行头和粘性上下文，宽表用命名且可键盘聚焦的滚动区，避免手机整页横溢（“Use standard <table> elements”）。采用保留列关系的滚动布局，不隐藏列，不强制堆叠。
- forms：我使用命名表单、关联标签、fieldset/legend、原生约束和状态公告；只在提交后显示服务器统一校验错误（“announce AJAX submission results”）。React Query按需请求且不自动轮询，管理员写操作持续禁用重复提交。

收尾源码检查新增P1：SearchDialog.tsx关闭publicationEnabled时仍直接采用hotKeywords静态推荐。未来已开启审核后编译关闭/回滚可能绕过隐藏词撤回；当前生产未修改。阶段六须修复关闭/回滚路径并测试，不可在该P1未解决时上线。此节点不把未改动的旧前端兼容路径宣传为全系统安全验收。

最终本地Admin构建和固定Wrangler4.132.0显式dist/server/wrangler.json dry-run通过，总包5048.12KiB / gzip1443.53KiB；相对阶段四同机记录约+59.86KiB / gzip+15.68KiB，非CPU或网络延迟。生成配置保留核心DB、SEARCH_JOBS_ENABLED=0和原域名，未出现本地fixture假ID，不进行实际部署。
