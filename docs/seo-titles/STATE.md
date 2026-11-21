# 标题优化当前状态

更新于 2026-11-21，Asia/Shanghai。

用户授权计划、提醒及节点一。独立工作树为 C:/Users/123/tgbox-seo-titles，分支 codex/seo-home-titles，起点 main 5181ebe。原工作树修改已核查并保留。

节点一实现三语首页方案 B，保留动态收录数量，独立繁体文案，将查找任务设为可见 H1。既有品牌拼写 TGsearch 继续由共享组件追加。

## 节点一验证

- web 测试 28 文件、429 项通过。命令为 pnpm --filter @tgbox/web test -- --maxWorkers=1 --testTimeout=20000。
- Astro 类型检查 311 文件，0 errors、0 warnings、0 hints。新增构建测试首轮因数组推断 string | undefined 报错，补充只读元组后复测通过。
- 5 个改动源码与测试文件 Biome 通过，git diff --check 通过。
- 本地 Astro 构建与 Pagefind 完成，使用开发数据集，三语对应的最终 HTML、动态数量与语言文案通过构建断言；另有 SQLite fixture → snapshot → Astro 的集成测试。
- Browser plugin not available。使用 Playwright 和已安装 Edge，地址 http://127.0.0.1:4347，三语各验证 1440×1000 与 390×844。检查响应、单个可见 H1、正文、无错误覆盖层、无水平溢出，键盘打开搜索、Escape 关闭、重新查询与打开同语言详情均通过。禁用 JavaScript 的三语 H1 与 Canonical 检查通过。
- 截图和 JSON 在 C:/Users/123/.codex/visualizations/2026/11/21/01a1fd99-89f2-7331-8771-3f0d7c980578，前缀 seo-home。外部统计、广告和头像使用本地占位，首次模拟脚本 MIME 类型错误已纠正，最终 consoleErrors 为零。
- Edge 导航仍会报告既有 ViewTransition opt-in disabled 中止提示，未出现其他 pageerror。首轮临时静态服务因 Windows 路径斜杠判定返回 404，已在临时启动脚本用绝对标准路径修正并重跑全部浏览器场景，应用代码不受影响。
- 源码自审确认只改首页文案及主标题语义，共享 SEO 输出、统计读取和索引规则沿用既有链路。最终 CI 状态在 PR 中核验。

## 待办与边界

已交付 [PR #58](https://github.com/forfreek/tgbox/pull/58)，源码提交 87f6115，CI 按 PR 最新提交核对。首次推送被 GitHub 邮箱隐私保护拒绝，使用账户已有的 noreply 提交地址修正本节点未发布提交后推送成功。

2026-11-21 复核 PR #58 已合并，main b45cdda 的构建部署流程 44905911068 成功。生产页面与新版 Google 抓取需分别验收，Google 搜索效果需确认抓取后观察。此处本地构建不用于证明当前生产数量。

每周一 10:00（Asia/Shanghai）提醒已创建，ID 为 tgsearch-seo。发布前说明待发布状态，发布后按首次新版抓取计算 7 日与 28 日完整窗口。

## 繁体首页台湾用词补充

2026-11-21 用户要求先将此前讨论的几处首页文案台湾用词化。行动前确认 PR #58 已于 2026-11-21T11:05:32Z 合并。新分支 codex/seo-home-taiwan 在现有专题独立工作树从 main b45cdda 创建，修改前工作树干净。

- 首屏说明使用「輸入關鍵字搜尋」「探索」「前往 Telegram 了解內容與使用規範」，保留可用成员资料和部分频道预览的限定。
- 搜索入口改为「搜尋頻道、群組或機器人…」，最新区域改为「最新收錄」。
- 动态摘要使用「探索本站收錄的 {total} 個…」「尋找感興趣的內容」，Title、H1、分类入口已符合前述台湾文案。
- 复用独立繁体词条与现有构建转换，数量继续由快照填充，最终构建核对 Meta、OG 与 JSON-LD。
- web 28 文件、429 项测试通过，Astro 311 文件零诊断，3 个改动源码及测试文件 Biome 与 git diff --check 通过。
- 本地 Astro 与 Pagefind 构建成功。SQLite fixture → snapshot → HTML 回归检查繁体文案、动态数量、OG、JSON-LD、Canonical 和语言替代链接，0/28/1969 的数量填充仍通过既有单元测试。
- Browser plugin not available。复用 Playwright + Edge 在 http://127.0.0.1:4347 检查三语 1440×1000、390×844，搜索键盘打开、Escape、查询及同语言详情跳转通过。禁用 JS 的三语主标题和 Canonical 检查通过。无溢出、无框架错误覆盖层，consoleErrors 为零，仍有既有 ViewTransition opt-in disabled 提示。
- 使用本地开发/fixture 数据，外部广告、统计和头像占位。真实设备、生产页面和本次文案的 Google 展示待验收。证据目录沿用上文，文件前缀 seo-taiwan。
- 源码自审仅改动独立 zhHant 文案和现有构建回归，无统计数据和查询逻辑变更。独立 PR 对应分支 codex/seo-home-taiwan，CI 状态以 GitHub 最新提交为准。
- 后续分类、标签及详情节点按用户指示推进。本补充节点回滚使用提交 revert，再按授权发布恢复上一版繁体文案。
