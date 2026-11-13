# P1-8 远端D1回填与分页审计入口

本节点承接#34，提供管理员CLI及本地API模拟测试。Phase1保持5/8、总任务12/55。真实远端运行、生产规模和历史镜像/排行回填继续验收。

## 接口与资源

`scripts/public-projection-remote.ts`使用D1管理查询API，显式指定account和database，凭据只读取CLOUDFLARE_API_TOKEN。参数绑定按API格式发送，错误只打印状态摘要，HTTP请求禁止重定向。
传输与业务操作分离，可注入本地模拟fetch验证事务与响应处理。请求入口、batch及params格式依据官方查询API文档。 [Cloudflare D1 Query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)

status/audit为只读查询。其余操作默认仅打印dry-run参数且不请求远端，添加--apply才执行写入。生产执行继续遵守该次操作专项授权要求。
本节点开发与测试只使用本地SQLite和模拟HTTP，生产D1读写、资源/Binding、Cron及部署操作为0。

## 操作顺序

先确认目标已包含0025结构、索引、view与触发器，并保留恢复所需备份。下列写命令展示默认预演用法，实际操作另行确认后添加--apply。

```powershell
node scripts/public-projection-remote.ts status --account <account-id> --database <database-id>
node scripts/public-projection-remote.ts start --account <account-id> --database <database-id>
node scripts/public-projection-remote.ts step --account <account-id> --database <database-id> --batch 100
node scripts/public-projection-remote.ts cleanup --account <account-id> --database <database-id> --after 0 --batch 100
node scripts/public-projection-remote.ts audit --account <account-id> --database <database-id>
node scripts/public-projection-remote.ts repair-counts --account <account-id> --database <database-id>
node scripts/public-projection-remote.ts finish --account <account-id> --database <database-id>
```

- start先检查结构，再在批次中创建run UUID、关闭ready、启用同步、重置回填cursor并推进内容revision。重复start保留已有run；需要全新一代时显式restart。
- step最多推进100个entries ID，五条SQL复用publicBackfillStatements。cursor由D1持久化，返回exhausted=true表示当前源尾部已到达，仍保持ready=0。
- cleanup按目录/推广状态的entry_id分页，删除本批孤儿，并按created_at索引删除至多batch条旧数字页锚点。按next续跑，next为空但anchorsRemaining=true时重复当前after继续清理锚点。
- audit完整分页核对源view与目录七字段、推广状态、孤儿和计数。差异退出码1，期间revision/run/门禁变化则中止，结果不能用于发布。
- repair-counts先执行完整审计，目录/推广/锚点未通过时拒绝修计数；通过后按最多50条写SQL一组修复计数与排序版本，每条都校验run、ready和审计revision。
- finish再次独立审计，全部通过后用单条条件UPDATE发布ready，原子核对revision/run/门禁和锚点为空。已发布状态可重复校验，重复finish不推进revision。

内容版本由start/restart和回填推进，ready关闭期间缓存读取受门禁阻止，finish不需要再次写版本。备份恢复仍需单独处理缓存命名空间，避免备份revision与既存缓存复用。
本工具未自动切换现有收录入口和页面，也不会自动暂停Bot或源数据更新。

## 并发、锚点与失败恢复

共享回填SQL增加可选run条件，原D1与离线调用方不传run时保留原行为。旧run的延迟写入无法在restart后推进新一代cursor。
分页锚点插入改为单条条件INSERT，检查内容版本、scope排序版本及enabled/ready，避免已开始的旧请求在重建后写回旧锚点。
离线工具也在verify前分批清理旧锚点，并在finish拒绝残留锚点，覆盖计数重建时排序版本复用的风险。

请求失败或超时后先查看status和持久cursor，再决定重发step/cleanup。工具不自动重试写请求，避免未知提交结果被当作未执行。
审计跨请求采用全局版本校验，持续源写入可能使审计多次重启，大库的完成时间与稳定审计窗口仍需测量。该限制不转化为自动暂停业务的规则。
真实Cloudflare预发布环境中的REST批次事务、响应meta、权限与故障注入仍为待验证；本节点的原子性证据来自同结构SQLite事务API模拟及既有本地D1测试。

## 查询和成本边界

远端审计没有整库COUNT或EXCEPT，源与派生ID按索引seek，每页最多100个ID，计数键按scope每页100条。
源view与目录对比只读取当批ID关联记录，内存保留该批数据与scope计数Map，避免把完整收录DTO存入内存。标签数影响每个ID的扇出行数，scope Map也随taxonomy规模增长。
总审计仍会遍历全目录，属于显式运维作业，不能放入SSR。原始表查询计划在本地测试检查索引，真实rows-read/rows-written与Paid费用待等价远端测量。
REST请求默认间隔500ms，可用--delay-ms调整0到60000ms。限流或网络错误会中止操作并保留D1进度，审计错误需要重新取得一致结果。

## 验收记录

- [x] 120条源数据的重启/续跑、孤儿清理、计数修复与审计后发布。
- [x] 1001条源数据按最多100个ID核对，远端执行路径无整库聚合SQL。
- [x] 旧run写入被拒绝，审计期间源变更与发布前晚到变更阻止ready。
- [x] 锚点每批清理上限、残留阻止发布、旧请求原子写入防护。
- [x] 批次失败回滚、异常ID拒绝、默认dry-run无网络及凭据错误摘要。
- [x] DB122/122，远端API模拟8/8、离线工具4/4，全仓typecheck9/9、scripts及Biome/diff check通过。源码审查覆盖run条件、审计分页、ready CAS、锚点竞态与凭据处理；独立PR CI以对应checks为准。
- [ ] 预发布远端D1实际执行、恢复演练与资源费用验收。

## 回滚

代码回退需同时回退可选run参数调用方与分页锚点插入变更。远端作业失败时ready保持关闭，源表数据保留，可继续step/cleanup或restart重新重建。
生产恢复与手工门禁调整按该次操作授权执行，避免在审计未完成时手动开放ready。辅助run键可保留，旧缓存按revision门禁及恢复时的命名空间策略处理。
