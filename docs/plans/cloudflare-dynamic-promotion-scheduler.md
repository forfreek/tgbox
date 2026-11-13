# P1-7 既有Bot定时任务接入推广准备

本节点承接#31，将数据层准备接入Bot既有五分钟scheduled入口。P1-7整体继续待验收，Phase1保持5/8、总任务12/55。

## 执行与预算

支付监听、广播及runRefresh按现有顺序完成后，使用result.subrequests判断余量。runRefresh返回值已包含前两项消费。
少于10个额度时推广准备直接跳过，D1访问为0。额度足够时用一次固定键读取检查开关、投影enabled/ready及轮转cursor。
开关 `public_promotion_preparation_enabled` 只有值为1才启用，默认关闭；投影未就绪时只消费这一次检查。

启用后仅对一个ProductKind执行一次preparePublicPromotions，limit100、batchSize100，保留完整代扫描与有限前100输出。
产品类型顺序使用既有ProductKind.options，cursor保存在 `public_promotion_preparation_cursor`，完成、pending、contended或单类型失败后均让出下一次机会。
异常cursor从0恢复。单次最多1次门禁读取+8条准备SQL+1次轮转写入，统一预留10个额度，既有50请求上限内执行。
准备故障记录日志，返回failed，不改变此前支付/广播/刷新结果。轮转写入失败可在下一tick重试同scope，准备状态CAS保护内容进度。
使用实际Date.now检查准备窗口，避免把固定scheduledTime当作长任务结束时刻。

轮转为尽力公平，重叠Cron可能重复同类型，但数据层CAS防止覆盖较新准备。持续满预算会推迟准备，五类在连续有空闲额度时约25分钟一轮。
因此短有效窗口、高频版本更新及繁忙时完成延迟仍需实测；本节点不能据此认定首次SSR切换已经可用。

## 验证与后续

- [x] 额度不足零SQL、默认关闭、投影ready门禁。
- [x] 逐scope轮转、跨Db句柄续跑、失败让出下一类型及损坏cursor恢复。
- [x] 记录实际SQL调用数并限制在预留10额度内。
- [x] Bot162/162，其中调度6/6且含真实scheduled入口；全仓typecheck9/9、最终Bot增量typecheck通过，Biome/diff check通过。空源调度实测9SQL，独立PR CI以对应checks为准。
- [ ] Worker环境Cache/KV adapter与Web读取接入、多地区及完整HTTP兼容验收。
- [ ] P1-7其余写入路径和P1-8回填审计验收。

源码审查覆盖已有spent累计、调度顺序、低余量分支、默认门禁、故障隔离与实际时钟。固定读取键与cursor写入复用site_state主键，索引和数据库结构变更为0。
调度准备结果的前100限制是本节点后台准备范围，Phase2需按现有页面确认完整性与hasMore处理，不能直接静默截断原页面推广输出。

## 部署与回滚

该PR只交付代码和测试。生产Cron表达式、Worker Binding、Cloudflare资源、数据库内容和部署操作为0。
未来启用需先完成目标环境迁移/回填并确认enabled/ready，再经该次生产操作授权将上述开关置1。该开关属于迁移渐进启用门禁。
回滚可revert本节点提交；已授权环境可将开关置0关闭准备，已有准备行保留且读取继续受revision/时间约束。
