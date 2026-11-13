# P1-8 本地回填与一致性审计工具

本节点承接#33，提供本地SQLite副本上的可续跑重建工具，复用D1原有回填SQL与投影触发器。Phase1保持5/8、总任务12/55；远端D1运维入口、部署级校验及历史镜像回填继续验收。

## 使用范围

`scripts/public-projection.ts`只接收已存在的本地SQLite文件，要求包含0025的表、索引、view和触发器。SQL导出文件需先按现有离线流程还原为副本。
status与audit用readOnly连接，start/restart/step/finish修改指定副本。工具没有Cloudflare凭据、网络命令或自动生产迁移路径。
生产结构、资源与部署操作仍按既有规则授权。本节点测试只创建隔离临时副本。

```powershell
node scripts/public-projection.ts status --database "C:\work\tgbox-copy.sqlite"
node scripts/public-projection.ts start --database "C:\work\tgbox-copy.sqlite"
node scripts/public-projection.ts step --database "C:\work\tgbox-copy.sqlite" --batch 100
node scripts/public-projection.ts audit --database "C:\work\tgbox-copy.sqlite"
node scripts/public-projection.ts finish --database "C:\work\tgbox-copy.sqlite"
```

按step返回的phase重复推进，达到verify后执行audit/finish。输出为JSON。audit发现差异时退出码1，finish不通过时ready保持0。
start重复调用保留进度，done后再次start也保留状态。需要从头重建时显式使用restart。finish重复执行不再次推进revision。

## 阶段与原子性

| phase | 单次工作 |
|---|---|
| listing_cleanup | 按entry_id seek最多100个派生条目ID，删除源条目已不存在的目录行 |
| promotion_cleanup | 按entry_id seek最多100个推广状态，删除源条目已不存在的状态 |
| backfill | 按entries.id seek最多100条，复用publicBackfillStatements重置推广状态、重建目录并推进cursor |
| counts | 按scope续跑最多100个计数键，修正count及非法排序版本 |
| verify | 等待完整本地审计，step不自动发布 |
| done | finish在同一事务内通过审计后设置ready=1并推进内容版本 |

每个修改命令使用BEGIN IMMEDIATE，数据修改与游标同事务提交，异常回滚。并发CLI写入由SQLite事务串行化；进度保存在site_state固定的public_local_rebuild_*键。
start关闭ready、启用来源触发器并从cursor0开始，源数据在批次之间通过正常写入更新时仍能同步。工具不删除entries、stats、taxonomy等来源数据。
禁止同时对同一副本运行另一个会主动切换enabled/ready的运维流程；命令检测到门禁变化会中止。
源ID遵守现有回填支持的正安全整数范围，异常ID在开始前报错，避免静默漏填。

## 校验内容与成本

完整本地audit使用双向EXCEPT核对public_listing_source与public_listing的七个字段，检查缺失及多余行。
另检查各scope计数、排序版本及每个来源条目的推广状态存在性、公开状态和tier范围，包含推广状态孤儿。
缺失表/view、审计差异或异常状态均不能通过finish开放ready。已有推广dirty状态可保留，付费推广时间计算仍由独立有界准备流程推进。

原生SQLite完整审计和scope计数修复含全范围聚合，可能建立临时集合，耗时与副本大小有关。它们只用于离线副本，不得复制到SSR或在线D1请求。
单个条目的标签数会影响目录行写入量，按100个ID分批不等于每批100行。counts中的all范围仍可能聚合全部目录，需在副本上观察磁盘、CPU与锁持有时间。
在线D1回填仍调用原API，五条写SQL已抽为与本地工具共用的纯SQL模块，保留enabled/ready/cursor条件。
原API空尾批次现在使用原子条件更新，防止并发关闭或推进游标后再错误开放ready。它原有完成语义继续兼容，完整审计发布门禁由此CLI负责。

## 测试与验收

- [x] 暂停同步遗留的目录/推广状态孤儿和错误计数修复。
- [x] 失败批次原子回滚、审计失败不发布、重复start/finish及显式restart。
- [x] 子进程重启续跑、只读status/audit和1001条样本期间的正常源变更。
- [x] DB空尾批次遇到并发disable时保持ready关闭。
- [x] DB121/121、本地工具4/4，全仓typecheck9/9、最终DB及scripts检查、Biome/diff check通过。独立PR CI以对应checks为准。
- [ ] 远端D1操作适配、生产规模/成本与远端导出还原兼容验收。
- [ ] 历史镜像/排行回填、Phase1完整验收与Phase2页面接入。

## 回滚与恢复

对副本保留操作前备份，工具失败后可继续step或restart；需要丢弃修复结果时切换回操作前副本。辅助状态只存进度，不作为收录来源。
未来将副本结果用于远端恢复前，需要单独验收导入顺序、触发器、迁移版本、准备/缓存命名空间和上线步骤，避免备份中的revision与既存缓存键重用。
代码回滚可revert本节点，新增纯SQL模块的调用方需随同回退。数据库migration、远端D1写入、Worker配置、Cron与生产部署操作为0。
