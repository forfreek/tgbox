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

PR、发布及新版 Google 抓取待记录。真实设备与生产版本尚未验收，Google 搜索效果需上线并确认抓取后观察。此处本地构建不用于证明当前生产数量。

每周一 10:00（Asia/Shanghai）提醒已创建，ID 为 tgsearch-seo。发布前说明待发布状态，发布后按首次新版抓取计算 7 日与 28 日完整窗口。

下一步提交独立 PR 并等待 CI，后续实施节点按 PLAN 和用户指示推进。
