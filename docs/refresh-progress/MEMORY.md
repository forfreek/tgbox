# 决策与恢复入口

- 2026-11-21 头像 Invalid URL 来自 Gmail Bot 的协议相对地址 //telegram.org/img/tgme/gmailbot.png?1。页面解析入口补全 HTTPS，可使指纹和下载共享同一绝对地址。保留 pathname 指纹和忽略 query 的行为，R2 下载成功后才更新 D1 版本。
- 对应分支 codex/avatar-url-normalization，基线 main 60c3772，独立 PR 交付。生产 bot 部署仍需单独核验，网页构建成功不表示 bot 修复生效。
- 此节点 Telegram 89、core 158、bot 165 项测试及三包类型检查通过。Windows 并行 workerd 内存不足，限制单 worker 和文件串行后复测通过。刷新回归验证 PNG 写入、版本保存、批次后续处理与 query 变化不重复下载。

- 旧刷新调度无持久游标；不能声称“PR 清空了进度”或通过改一个现有游标解决跳段。
- maxId 变化只改变扫描终点，不应重新映射扫描位置。以条目 ID 保存进度，并在预算/限流延期时回到首条未处理记录。
- 使用现有 site_state 的单键状态及条件更新，避免引入新资源或迁移。租约防重叠，比较交换防过期所有者覆盖；失败重试允许重复读写，不能假称跨 R2/D1 原子完成。
- 首次建立进度时检查最新段，再完整轮询；旧日志只证明实际处理过的段，不能推断中间所有 ID 都已处理。
- 2026-11-20 已补齐近期 9 条真实头像，3 条无公开头像跳过，正式构建 44742432293 成功。手工补齐与永久调度修复是两项独立结果，见 STATE。
- 恢复时先核验 PR、bot 部署版本和进度键，再判断是否已上线；本地完成或网页部署成功都不代表 bot 调度已生效。

- 2026-11-26：生产已于11-25部署持久游标与URL规范化，但新收录仍默认avatar_version为空，首部署处理尾段后扫描从头开始。生产日志证明正常推进不等于近期收录已被访问；排障须同时核对条目ID、游标、部署时间及D1头像版本。具体批次统计见STATE。
- 缺头像优先扫描采用ID键集分页及独立avatarNextId，与常规进度共享单租约/CAS及既有预算。无公开图也推进，不能每次LIMIT取最前几个空头像导致永久饥饿。空队列回退常规扫描；频率交替保证已有头像仍获更新。
- 本地bot刷新28项/core进度9项及db/core/bot类型检查通过。代码及回归入口：packages/core/src/{refresh,refresh-progress}.ts、packages/db/src/access.ts、apps/bot/test/refresh/refresh.test.ts。尚未部署生产；正常轮巡吞吐在优先队列繁忙时降低，不能承诺即时更新。

- 本节点独立草稿PR #82：https://github.com/forfreek/tgbox/pull/82；生产未部署，CI结论按最新检查核验。
