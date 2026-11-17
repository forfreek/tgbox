# 已上线页面的收录与搜索表现复核

查询日期为 2026-11-17，范围为 AI 群组分类页、排行榜及英文、繁体版本，共六个 URL。

## 当前结论

- Search Console 的六个 URL Inspection 结果均为已收录，Google 选定的 Canonical 与页面声明一致。
- 六页最近抓取时间均早于本次发布，新版内容的重新抓取状态待后续复核。
- 线上直接访问六页均返回 200，重要内容包含于 HTML。Canonical、四个语言 alternate、robots 规则及 sitemap 检查通过。
- 现有搜索样本较小，当前数据可保存为改版前基线，优化增量仍待后续观察。

## 数据与时区

- GSC 完整数据请求窗口为 PT 2026-10-17 至 11-13，dataState 为 final。网站实际正展示日仅为 11 月 9 至 13 日。
- 近期请求窗口为 PT 11 月 14 至 17 日，dataState 为 all，实际返回到 16 日，可能继续变化。
- AI 分类于北京时间 2026-11-17 15:25:38 发布，排行榜于 15:56:23 发布，对应 PT 11 月 16 日深夜。
- 页面、网站和查询的聚合口径分别记录。精确 URL 过滤无返回行的页面保留该状态，零展示日的 position=0 不解释为排名。
- 当前 Google 索引状态与当前线上 HTML 分别核验。URL Inspection 返回最近索引版本的信息。

## 报告与证据

- [私有 OpenSEO 报告](https://app.openseo.so/p/a7cf7268-8a2b-4c43-bbac-1f3d7eb03c97/reports/1a3ed203-cb45-4484-a31d-334affecdf72)包含各页抓取时间、点击展示基线与可见查询，需要项目访问权限。
- 本地证据目录为 C:/Users/123/.codex/visualizations/2026/11/17/01a1e825-c598-76f0-acad-36146b515dec，文件为 seo-search-review-evidence.json 与 seo-search-live-check.json。
- 本轮使用已连接 Search Console 的无 credits 工具读取，研究 credits 消耗为零。

## 后续复核入口

1. 重新读取六页 URL Inspection，逐页记录晚于发布的抓取时间。
2. 新版抓取后比较连续 7 个完整日，再补充 28 日观察，并纳入相同星期结构。
3. 继续按页面与查询明细复核语言、设备及国家分布，单独标注近期不完整数据。
4. 后续内容改动依据积累的查询和页面数据决定。本轮未建立自动提醒或持续跟踪任务。

## 官方口径

- [URL Inspection API 字段](https://developers.google.com/webmaster-tools/v1/urlInspection.index/UrlInspectionResult)
- [Search Console 聚合与近期数据](https://support.google.com/webmasters/answer/17011364?hl=en)
- [查询、页面与日期维度](https://support.google.com/webmasters/answer/17011259?hl=en)
