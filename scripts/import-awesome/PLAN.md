# 从 awesome-telegram 导入条目

只记录已定步骤。转换脚本和导入都还没做。

来源是 [forfreek/awesome-telegram](https://github.com/forfreek/awesome-telegram) 的英文 `README.md`（1244 条）。链接仍是 `https://tgbox.cc/en/detail/用户名/`，用户名取路径最后一截。线上库是 tgsearch.app 用的 D1 `tgbox`，媒体进已有的 R2 桶 `tgbox-media`。

这次不新开 Workers AI、队列、Workflow 或 Durable Objects。分类和标签从 README 的标题、反引号标签来，不调用模型。付费版的静态文件上限（10 万）和子请求上限这次用不到：1244 条远低于现有构建脚本里的 2 万文件检查，刷新任务也不改。

## 脚本

`scripts/import-awesome/from-awesome.ts` 只把 README 转成种子 JSON。不访问 Telegram，不写数据库。

- 读原始文件 `https://raw.githubusercontent.com/forfreek/awesome-telegram/main/README.md`，不读 GitHub 网页（长表格会被折起来）。
- 只解析 `## Channels`、`## Groups`、`## Bots`。跳过 Most popular 和 Recently added。不读中文和繁体 README。
- 大节决定 `kind`，`###` 标题用固定对照表决定 `category`。标题不在表里就停，不写文件。
- 简介末尾反引号里的英文标签收成已有 slug，最多 5 个。对不上的打印后丢掉。
- 同一用户名只留第一次。
- 写出 `scripts/import-awesome/out/all.json`，再按每 80 条切成 `batch-01.json`。`out/` 不提交。
- 不修改 `scripts/seed/seed.ts`。

一条结果：

```json
{ "username": "solidot", "kind": "channel", "category": "news", "tags": ["daily-news", "science"] }
```

`https://t.me/solidot` 由种子命令自己打开。

## 顺序

1. 只添加转换脚本，不部署、不写库。
2. 在 tgbox 目录执行：

```bash
node scripts/import-awesome/from-awesome.ts \
  --readme https://raw.githubusercontent.com/forfreek/awesome-telegram/main/README.md \
  --out-dir scripts/import-awesome/out
```

3. 第一批先灌本地库：

```bash
node scripts/seed/seed.ts --local --list scripts/import-awesome/out/batch-01.json
```

`fetched` 是抓到了。`skip` 是号已失效，或实际类型和 README 不一致，这条不入库。

4. 本地这批正常后，在已登录 Cloudflare 的电脑上逐批写线上。两批之间停几分钟：

```bash
node scripts/seed/seed.ts --remote --list scripts/import-awesome/out/batch-01.json
```

5. 全部写完后，手动跑一次 Build & deploy，页面才会出来。

## 简介文字从哪来

导入写入的标题和简介是 `t.me` 公开页上的原文，原样保存，不经模型改写。

另一种语言的简介由已有的每小时任务翻译，不在这次脚本里。模型是 `@cf/meta/m2m100-1.2b`，调用只有原文、`source_lang` 和 `target_lang`，没有提示词。英文简介译成中文，中文简介译成英文，页面上标「自动翻译」。每小时最多 8 条。繁体页是构建时把简体页面做字形转换，不是模型。

分类模型 `@cf/google/gemma-4-26b-a4b-it` 只在用户投稿、关键词分不准时返回一个分类 slug，不改简介。这次导入不调用它。
