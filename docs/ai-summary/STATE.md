# AI 资源摘要模块状态

记录日期为 2026-11-22，时区为 Asia/Shanghai。

## 当前状态与授权

步骤一、二已交付。2026-11-22 用户指示“下一步”，本轮实施步骤三数据与异步任务。仅在本地应用迁移并使用模拟模型，生产迁移、Cloudflare 资源操作、真实付费推理及部署按相应授权执行。

早期审查采用远端 main 的固定提交 cb0d6a658d1dc57c45ef3e6092d9f15c66386b7b。当时原目录 C:/Users/123/tgbox 的分支为 cursor/about-drop-awesome-list，HEAD 为 6fa6b0092837d0d6ca28ef5e8471b2b19df4f87e，含用户未提交改动。步骤二另从 main 建独立工作树。文档中的主线行为不能直接当作原目录 HEAD 或生产部署行为。

## 按需读取

先读本文件，再按问题选择一个文件。禁止一次性读取本目录全部文件或为恢复上下文全量读取源码。长文件先定位标题，再读取对应段落。

| 问题 | 文件 |
| --- | --- |
| 审查结论、可复用边界、证据基线 | [MEMORY](MEMORY.md) |
| 投稿、审核、抓取、翻译、D1、R2、静态构建真实链路 | [AUDIT](AUDIT.md) |
| Worker、迁移、队列、幂等、回填及输入输出 | [DESIGN](DESIGN.md) |
| 多语言、后台、模型测试、成本及回滚 | [DELIVERY](DELIVERY.md) |
| 拟涉及文件、实施顺序及验收 | [PLAN](PLAN.md) |
| 资料不足、来源冲突及逐步实施 | [PLAN 判定与分步计划](PLAN.md#来源信息不足的判定草案) |
| 步骤一判定规则与原因 | [SOURCE-RULES](SOURCE-RULES.md) |
| 真实资料与构造边界样本 | [SOURCE-SAMPLES](SOURCE-SAMPLES.md) |
| 步骤二 API、指纹与预检边界 | [CONTRACTS](CONTRACTS.md) |
| 步骤三迁移、队列、预算及回填 | [TASKS](TASKS.md) |

## 下一步

当前工作树 C:/Users/123/tgbox-ai-summary-jobs，分支 codex/ai-summary-jobs，基于步骤二 de44705 建立。2026-11-22 核对 PR #61 仍 OPEN，main 仍为 cb0d6a6，因此采用依赖 PR #61 的堆叠交付。步骤三已完成，本地及 Linux CI 通过，PR #62 待审合并，步骤 4–8 未开始。下一步为步骤四“提示词与模型比较”，等待继续指示。

## 步骤三本地验收

交付 [PR #62](https://github.com/forfreek/tgbox/pull/62)，base 为 codex/ai-summary-contracts，依赖 PR #61。先合并 #61，再核对并将 #62 基线切至 main 后按序合并。当前尚未合并，CI 核验结果在下方更新。

- pnpm --filter @tgbox/ai-summary test 复测通过 31 项，包含回填处理中暂停时保持 paused 的回归。
- pnpm --filter @tgbox/db test 通过，15 文件、74 项既有 DB 测试，包含新迁移。
- pnpm typecheck 通过，10 个任务，Web 311 文件零错误、零警告；新 Worker 类型检查单独复测通过。
- pnpm --filter @tgbox/ai-summary build 为 wrangler deploy --dry-run，打包通过，未部署。
- Drizzle 再生成检查显示 No schema changes，迁移与 schema/snapshot 一致。
- 本步代码审查发现并修正暂停后任务无法恢复、旧配置观察者可能作废新任务、删除后预算被级联释放三个边界，均有回归测试。
- 新改动文件的 Biome、专题链接及差异空白检查通过。Windows 全仓 pnpm check 记录 680 项格式诊断，输出受大量既有 CRLF 影响，Linux 完整检查随 PR 验证。
- Wrangler 生成的类型文件含五处尾随空白，已仅规范化空白后复核 diff --check，绑定与类型内容保持生成结果。
- 真实模型、生产迁移、队列及 Worker 创建、远端运行状态未验证。新应用测试 remoteBindings=false，未调用 AI binding。

Linux CI [44999638271](https://github.com/forfreek/tgbox/actions/runs/44999638271) 对 49002fc 完整通过。追加回填暂停保护后，[44999905516](https://github.com/forfreek/tgbox/actions/runs/44999905516) 对 14d139e3c93eec91a38f30b5a84cd6d94484fa1a 再次完整通过，包含全仓检查、测试和脚本检查。此后仅补充文档验收记录，代码保持该已验收版本。

以下步骤一、二记录为历史证据，不能当作本步 PR 状态。

本步再次核对远端 main，仍为 cb0d6a6。历史快照内时间为 2026-11-14T17:41:28.739Z，不能视作当前线上事实。步骤一仅变更项目文档，未调用模型或生产抓取，尚未提交或创建 PR。

本步用 Node 本地脚本检查 25 个案例数量、三类型各五种基本边界覆盖、六个历史来源身份及五份相关文档链接，全部通过。该检查验证样本编制完整性，判定器实现、自动事实判断及模型效果均未测试。

## 步骤二本地验收

2026-11-22 文档追加，将 PR 项目记忆同步要求提升到根 AGENTS.md 全项目规则，并同步原目录总规则和专题记忆。该次仅改文档，执行差异空白与恢复链接检查，业务验证沿用以下记录。

Linux CI 已在提交 e47892a7b7c71eec96c218d12494bff3ee4aaa7d 全部通过，运行 [44996364788](https://github.com/forfreek/tgbox/actions/runs/44996364788)，包含全仓 pnpm check、pnpm test、脚本类型和测试。其后仅补文档记录，代码保持该已验收版本。步骤二交付完成，PR 待审合并，步骤三等待继续指示。

交付 PR 为 [#61](https://github.com/forfreek/tgbox/pull/61)，状态以 GitHub 为准。该 PR 也归档前两步仍仅保存在原目录的专题文档，保留 main 总索引其他入口。尚未合并。首次推送被 GitHub 邮箱隐私保护拒绝，改用仓库主线已有的 GitHub noreply 身份重新生成未发布提交后推送成功。

- pnpm --filter @tgbox/shared test 通过，共 8 文件、198 测试。
- pnpm --filter @tgbox/shared exec vitest run src/ai-summary.test.ts 通过，新增契约测试 46 项。
- pnpm typecheck 通过，9 个实际执行任务，Web 311 文件零错误和警告。
- 对本次四个代码/fixture 文件的 Biome 检查通过，专题本地链接检查及 git diff --cached --check 通过。
- pnpm check 在 Windows 全仓格式检查阶段报告 678 项错误，输出包含已有文件的 CRLF 换行诊断，未进入类型检查；类型检查已单独执行通过。Linux CI 全仓检查通过。
- 源码自查覆盖输入上限、可见性顺序、Unicode 截断、抽样稳定、输出引用与数字约束、DB/Node 类型兼容及六条历史原文。发现的跨包 crypto 类型错误已通过注入 digest 并复制 ArrayBuffer 修正，全仓复测通过。

## 早期审查验证边界

上轮读取并核对有关源码、迁移结构、Cloudflare 配置和两份 GitHub Actions 工作流，跨仓检索资源与帖子写入点，并查阅 Cloudflare 官方文档。审查并未逐行覆盖所有外围功能，因此不能标记为全仓逐行审计完成。

没有验证生产 Worker 版本、D1 当前条数、账户剩余额度或真实模型输出。用户给出的约 2,000 条用于容量估算。没有运行迁移、付费推理、部署或业务代码测试。本次归档新增六份专题文件，更新总索引，七份 Markdown 的本地链接检查全部通过。另按用户授权在 Codex 记忆扩展目录保存恢复指引。归档位于本地工作树，尚未提交或创建 PR。
