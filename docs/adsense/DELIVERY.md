# AdSense 验证脚本

日期：2026-11-17（Asia/Shanghai）。独立工作树 tgbox-adsense，分支 codex/adsense-verification，基于 origin/main 69ae235。

## 计划与实现

- 按用户提供的代码，在公共 BaseLayout.astro 的 head 中接入发布商 ca-pub-1797920702200847。
- 保留 async 和 crossorigin="anonymous"。Astro 的 is:inline 保证外部脚本原样输出，不参与打包。
- 既有 ads.txt 发布商 ID 一致，无需修改。原工作树已有修改保留。

## 当前状态与检查

- Biome 单文件检查通过。
- web 类型检查通过：311 文件，0 errors、0 warnings、0 hints。
- web 构建通过，使用默认本地开发数据。首次并行构建与类型检查发生 Astro 缓存写入竞争，串行重跑构建通过。
- Node HTML 断言检查通过：116 个公共布局页面中，脚本在 head 内恰好出现一次，URL、async、crossorigin 均正确，包含三语言首页。
- 仅创建 PR；未合并、部署或执行生产资源操作。线上脚本加载、AdSense 识别与审核结果未验证。

## 可复用决策

公共网站页面共用 BaseLayout；嵌入式 Mini App 使用独立布局。本次脚本只接入公共网站布局。供应商可变 URL 不固定 SRI 哈希，保持用户给定代码。回滚移除本次新增 script 即可。
