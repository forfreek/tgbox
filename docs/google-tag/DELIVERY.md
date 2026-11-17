# Google 标签接入

2026-11-17，Asia/Shanghai。基于 origin/main 7afdd99，在独立分支 codex/google-tag 交付。

## 计划与实现

按用户提供的代码，在公共 BaseLayout.astro 的 head 内添加 GTM-5VXM285L 的异步脚本和 dataLayer、gtag 初始化。使用 Astro is:inline 原样输出，覆盖共用该布局的三语言公共页面。

## 状态与验证

代码已加入仓库并提交 PR。遵照用户指示跳过测试和构建。实际线上加载和 Analytics 数据接收待发布后验证。

## 项目记忆

GTM 容器 ID 是客户端公开配置。Analytics 的实际采集还取决于该容器内的标签配置与发布状态。源码入口为 apps/web/src/layouts/BaseLayout.astro，回滚时移除本次两个 script 元素。
