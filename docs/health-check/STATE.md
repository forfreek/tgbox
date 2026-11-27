# 当前状态

核验日期：2026-11-27，Asia/Shanghai。

- 工作树C:/Users/123/tgbox-health-check，分支codex/health-check-stage1，基线main 31778c9。
- 用户已授权拆分任务并按阶段实施；当前实施阶段一。阶段二统一证据/策略，阶段三历史修复，阶段四生产验收及清理，范围与验收见PLAN。
- 已实现已有资源占位页unknown、正常主页不被预览重定向推翻，以及头像优先通道仅写头像且不影响健康/发布状态。
- 新收录身份限制保留，不将未知自动收录。机器人身份可识别与功能可用没有合并成一个结论。
- 阶段一仍保留常规轮询旧type_changed策略与历史字段，明确由阶段二替换、阶段四清理；历史误隐藏未处理，不能声称完整问题解决。
- 验证结果和PR在完成后追加。生产未部署、未改数据、未执行迁移；原任务工作树修改保留。

## 阶段一验证与交付

- Telegram全套7文件91项通过；core全套15文件159项通过；bot刷新专项32项通过，bot全套15文件172项通过。
- Telegram/core/bot类型检查通过，6个变更TypeScript文件Biome检查与git diff --check通过。首轮类型检查发现测试残留的previewRedirected参数，已移除并复查；该判定参数已经从源码及测试删除。
- 源码审查：已有资源占位页只进入unknown，正常频道预览重定向不再改写主页判定；头像通道提前结束非头像写入且不进入存活记录；旧类型变化路径以真实类型差异测试保留覆盖，阶段二替换。
- 所有测试为本地D1/R2和模拟网络，不以测试通过当作真实Telegram恢复或生产验收。

- 阶段一草稿PR #84：https://github.com/forfreek/tgbox/pull/84 。代码d51150f；Linux全仓CI按PR最新检查核验。阶段一代码交付完成，尚未合并/部署；下一节点为阶段二契约、数据模型及策略统一。

## 阶段二2A契约节点

2026-11-27：用户要求PR下一步，进入阶段二，先交付2A契约和迁移设计。当前工作树C:/Users/123/tgbox-health-contract，分支codex/health-check-contract，堆叠base=codex/health-check-stage1（#84，e1b2576）。阶段一工作树历史边界保持。

- CONTRACT.md定义正向识别/不确定/身份复核与发布状态分离、机器人功能结果独立、当前web自动隐藏/恢复充分证据清单为空。
- 已按源码梳理Cron、手动、新增/审核、后台列表/仪表板/标签、Bot三语、seed与snapshot消费者，列清旧字段迁移、16槽有界证据存储、幂等/乱序/binding保护及请求预算验收。
- 本节点只文档，未创建表/修改运行时/UI/生产，也没有真实采集证据或恢复历史条目。阶段二实现与验收仍为2B，不声称已完成。
- #84仍未合并；CI结果按当前远端核验，不将先前检查快照当最新结果。
- 2026-11-27核验：阶段一#84全仓CI 45942342071通过（check 1m58s）。2A文档经源码入口核对与git diff --check验证，未改可执行代码，因此不重复运行实现测试；2A与后续2B不可混为已实现。
- 2A已提交草稿PR #85：https://github.com/forfreek/tgbox/pull/85 ，base=codex/health-check-stage1，代码9727ce2。阶段一#84已标记ready且CI通过；两PR均未合并。本节点git diff --check通过，远端CI按PR最新检查核验。

## 2026-11-27 阶段二2B1数据与判定基础

- 工作树C:/Users/123/tgbox-health-data，分支codex/health-check-data，基线2A a2d88eb，堆叠base=codex/health-check-contract（#85）。独立PR待完成验证后登记。
- 新增共享证据/功能/身份确认校验与判定、0027本地迁移、16槽证据、事务化条件写入、有界分页及来源退避/CAS。实现和限制见DATA.md。
- 当前只交付2B1；2B2的Cron/手动/后台/三语/收录入口与预算接入未实施，旧运行路径仍存在，阶段二整体未完成。本节点未执行生产迁移、部署或历史数据修复。
- 不将2B1 API导出当成已有生产观测。新API没有发布状态变更权限，未来入口亦不得退回旧自动隐藏。

## 2B1验证结果（2026-11-27）

- shared全套9文件205项、db全套17文件96项通过；最新数据/来源专项22项通过。Node SQLite旧库升级测试1项、scripts类型检查通过。
- 全仓turbo typecheck 10个实际任务通过，Astro314文件0诊断；11个变更TS文件Biome及git diff --check通过。
- 本地pnpm check因未改动文件大量CRLF格式诊断未通过，没有批量格式化全仓；Linux全仓CI按PR最新检查核验。
- 源码审查核对条件UPSERT与证据同事务、16槽采样与功能明细保留、复核栅栏、actor/时间需可信服务端、来源CAS与不提前解除Retry-After，以及静态导出allowlist未扩入私有表。
- 2B1是可独立审阅的基础实现；2B2运行/UI接入、整体tick预算与浏览器验证尚未执行。没有授权或执行生产迁移/部署/历史恢复。
- 2B1已提交草稿PR #86：https://github.com/forfreek/tgbox/pull/86，base=codex/health-check-contract（#85），代码14635f0。#85 CI 45942928545核验通过；#86 Linux CI按最新检查核验。下一节点2B2接入运行/UI并停用旧隐藏路径，本节点不声称已完成该工作。

## 2026-11-27 阶段二2B2运行与后台集成

当前工作树C:/Users/123/tgbox-health-integration，分支codex/health-check-integration，基线2B1 90ba34e，堆叠base=codex/health-check-data（#86）。阶段二运行/后台本地集成完成，详见INTEGRATION.md；独立PR创建后登记。

- Cron/手动/收录/审核/Bot采集接入统一证据与来源退避；旧自动隐藏/恢复调用和失效通知已停用，头像通道不写健康。
- Admin列表/仪表板/证据与人工验证、服务端白名单/actor/审计事务、三语Bot口径接入；未知不自动收录或恢复。已解决D1 batch联合查询重复entry_id导致列映射错位，并加入成员与健康过滤回归。
- 本地全量Telegram96/core161/db99/Admin113项通过；Bot全量175项通过，随后新增admin三语专项12项与刷新36项通过。全仓typecheck10任务、Admin生产构建、Node旧库迁移1项通过。变更文件Biome与最终Linux CI在交付检查登记。
- 浏览器桌面/手机表单、真实本地POST及审计读回、并发冲突、GET未认证401通过。仅模拟资源，未发送真实机器人消息；不将QA视为生产验证。
- 2B1 #86 Linux CI45944985860核验通过。阶段三历史评估、阶段四生产发布/观察/旧列清理尚未执行；禁止把本节点交付写成线上已修复或专题结束。生产迁移/部署/数据恢复均未执行。

2026-11-27 2B2运行/后台已交付草稿PR #87 https://github.com/forfreek/tgbox/pull/87 ，base=codex/health-check-data（#86），代码ece8088。恢复 C:/Users/123/tgbox-health-integration/docs/health-check/STATE.md、INTEGRATION.md。#86 CI45944985860通过；#87 CI按最新检查核验。生产未迁移/部署，未恢复历史条目；本工作树此前节点边界保留。

2026-11-27 PR #87 CI45949457611：lint/typecheck通过，测试发现繁体生成词典不同步（简体源格式化后未重生成，且localeCompare受宿主ICU默认排序影响）。已修正为固定码点顺序、规范生成换行，按最终简体源重新生成；同步测试只忽略checkout换行，新增禁止宿主localeCompare及CRLF/LF等价回归。Hant本地6项与类型检查通过；最新完整CI待核验。

2026-11-27 PR #87 CI45949801379：Hant同步、lint/typecheck及其余9个包测试通过，Web Mini App测试4项因DB mock缺readHealthSources失败。已补齐mock并发现/修正Mini App preview直接采集漏接共享退避；新增真实采集函数下preview+submit冷却期零网络/零收录回归，API63项通过。Mini App未确认文案改为本次未确认，seed离线CLI仍仅作正向导入校验，不写新健康或发布决策。

## 2026-11-27 阶段三只读复核（最新）

- 当前工作树C:/Users/123/tgbox-health-history，分支codex/health-check-history，基线9f41632，堆叠base=codex/health-check-integration（#87）。#87 Linux CI45950431638于本次核验成功，仍OPEN/draft，未合并/部署。
- 生产SELECT重新确认12条系统隐藏+3条上线旧异常；实时网页5条当前channel可识别、1条bot识别为channel、9条占位无法确认。见HISTORY.md与四份精简证据，不把可识别写成原主体或机器人功能确认。
- 首次Node直连超时后停批，等待退避到期并沿现有代理重采；20次GET完成15条。二次只读导出的15条与之前一致，所有查询0写入；新迁移/健康表未上线。
- 新增只读采集/评估与指纹工具，没有生产应用命令；Node专项8项和scripts类型检查通过，PR/最终CI在交付后登记。
- 阶段三正式数据修复尚未完成：需要安全版本上线、独立人工原主体证据、明确恢复授权、新鲜快照及本地执行器演练。阶段四生产观察和旧列最终清理亦未完成。本节点无生产变更。
