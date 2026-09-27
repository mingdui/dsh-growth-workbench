# dsh-growth-workbench

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen.svg)](https://nodejs.org)
[![DSH plugin](https://img.shields.io/badge/DSH-plugin-blueviolet.svg)](https://github.com/deepseek-ai/deepseek-harness)

中文文档 | [English](README.en.md)

**把「我要转型」变成今天能做完的一件事。**

它是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（CLI 名 `dsh`）的插件。装好之后，左侧菜单里多一个「成长工作台」。

## 它解决什么

想转行、想补一块能力的人，通常卡在三件事上：

- **不知道今天做什么。** 目标太大，落到日历上就是空白。
- **学了很多，拿不出东西。** 说不出自己会什么，也没有能给面试官看的东西。
- **走着走着不知道到哪了。** 没有记录，也没有一次认真的复盘。

这个插件把这三件事接成一条链：**今天做什么 → 留下证据 → 定期考一次 → 按结果调整**。

## 主线

```
① 目标岗位 → ② 你的条件 → ③ 当前状态 → ④ 可迁移能力 → ⑤ 能力模型 → ⑥ 能力自评
          → ⑦ 90 天计划 → ⑧ 今日执行 → ⑨ 证据 → ⑩ 考核复盘 → 回到 ⑦（调整）
```

前六步在「画像」页签一次做完；计划落到「计划」页签；每天的事在「今日」页签（或右侧的「今日」窄栏）；到点考核在「考核」页签。

## 亮点

**今天只有一件事。** 「今日」页一次只给你一道动作，带着它的最低完成版本、完成标准和可接受证据。做到了就勾掉，页面自动给下一天。

**每道题都告诉你怎么学。** 任务卡上有「怎么上手」一句话、「AI 汇总」（这道题要掌握的要点和常见的坑）和几条来源链接。缺资料时点「让 AI 汇总资料」，它会去查、去读，再把结果写回来 —— 查不到就如实说查不到，不会编一条打不开的链接。

**AI 生成，你判断。** 底盘候选、能力模型、90 天计划都由 AI 生成；但**打分、确认、判断全在你手上**：哪些能力你确实有（逐条勾）、每项自评几分（1/3/5 锚点常驻屏幕）、什么算证据。AI 替你打分的话，这一整套数字就一文不值。

**证据像写笔记。** 一段文字、一张图（截图 / 白板照 / 运行结果）、或者一个文件（csv / json / txt / md / zip / pdf，单个 ≤8MB）都能挂到这道题上。点证据那一行会打开一张写作纸：整张纸、无边框、行高放宽。⌘/Ctrl + Enter 保存，**关掉也先存**，中途走开不丢。

**考核有节奏。** 每周一次**节点小考**（只重测这一周相关的几项）、每个阶段走完一次**阶段大考**；考卷在页面上答，交卷交给对话里的 AI 按 rubric 打四维分，分数、归因、报告和接下来 7 天的调整版任务一起写回页面。答到一半可以关掉，草稿存着，回来接着答。

**节奏可以比日历快。** 今天有空多做一天、或者某道题你本来就会 —— 「继续做下一天」直接把进度推到下一天：它只改「我在做第几天」，「回到日历节奏」随时撤回。

**数据在你本机。** 全部在 `$DSH_HOME/growth-workbench/` 下，四份 JSON 加一个 `evidence/` 目录，随时能一次导出成一份文件带走。没有账号、没有云。

**十一个方向都自带能力模型。** 数据运营 / 产品运营 / 用户运营 / Agent 应用开发 / AI产品经理 / 数据分析·商业分析 / 互联网运营·增长 / 全栈工程师 / FDE工程师 / AI测试 / AI交付工程师 —— 选中即可逐项自评，不必等 AI 生成。

## 安装

需要 Node.js ≥ 22.19、`dsh` CLI 在 `PATH` 上，以及一个支持 bundle 插件的 DSH profile（比如 `web`）。

```bash
# 从 GitHub 安装（推荐）
dsh plugin --profile web add github:mingdui/dsh-growth-workbench
```

装完**重启 DSH 进程**。看不到效果先重启 —— 插件清单不热更新。

确认装上了：

```bash
dsh --profile web --dump-config | grep growth-workbench
# 期望看到：- id: dsh-growth-workbench
```

<details>
<summary>其它安装方式（npm / tarball / 本地目录）与升级</summary>

```bash
# npm
dsh plugin --profile web add dsh-growth-workbench

# tarball
npm pack
dsh plugin --profile web add ./dsh-growth-workbench-<版本>.tgz

# 本地目录（改代码时用）
git clone https://github.com/mingdui/dsh-growth-workbench.git
dsh plugin --profile web add ./dsh-growth-workbench
```

升级：

| 安装形态 | 升级命令 |
|---|---|
| git / npm | `dsh plugin --profile web update dsh-growth-workbench` |
| tarball | `dsh plugin --profile web add ./dsh-growth-workbench-<新版本>.tgz` |
| 本地目录 | `node scripts/update.mjs` |

git 形态跟的是 `main` 分支，锁文件里 pin 的是提交 SHA —— 你不主动 `update`，插件不会自己变。升级同样要重启 DSH，**升级不会动你的数据**。

卸载：`dsh plugin --profile web remove dsh-growth-workbench`（只注销插件，`$DSH_HOME/growth-workbench/` 里的数据不动）。

</details>

## 使用

重启后：左侧菜单 →「成长工作台」→ **画像**。

1. **选方向**。从目录里选一个，或者自己填一个岗位名。
2. **定路线、答四道选择题**。它按你的身份追问几件事（在校问专业年级、在职问岗位行业、自由职业问收入来源和已经在交付的东西）—— 后面的一切都从这几句里推。
3. **确认底子**。点「让 AI 给出底盘候选」，它会把你能迁移的经验列出来；划掉不符合的，勾选确实做过的。
4. **逐项自评**。每项 1/3/5 锚点都在屏幕上，点一下就是一分。这一步之后，你的差距和补强顺序就有了。
5. **生成计划**。点「让 AI 生成计划」，90 天落到「计划」页签。

之后每天只做一件事：打开「今日」，做那道题，勾掉，写一句证据（可以配图或文件）。

到点会提示考核：**节点小考**每周一次、**阶段大考**每个阶段走完一次。在「考核」页签点「打开考卷」，答完交卷，AI 在你那个专属对话里打分，结果写回页面。

## 数据放在哪

`$DSH_HOME/growth-workbench/`：`profile.json`（画像）、`plan.json`（计划）、`progress.json`（打卡与证据记录）、`assessments.json`（考核与自评历史）、`evidence/`（证据文件）。页面与 AI 读写的就是这一份，没有第二份。

导出备份：`curl -s localhost:<端口>/gw/api/export > growth-workbench-backup.json`。想换个地方做实验，把 `DSH_HOME` 指过去即可。

## 已知边界

- **能力模型是草稿。** 十一个方向的锚点都随版本发布，但都**未经行业校准** —— 页面如实这么标。它足够用来给自己定位，不该当成行业标准。
- **AI 打分没有自动化验收。** 工具本身是拿固定输入验过的；「AI 读完简报能不能打出合理分数」要靠真实对话。
- **没有提醒。** 考核节奏写在计划里，还没有接到定时器。
- **接口没有独立鉴权。** DSH web server 默认只绑 `127.0.0.1`；一旦绑到 `0.0.0.0`，需要自己加一层校验。

## 文档

- [产品文档](docs/产品文档.md) —— 给谁做的、怎么用、有哪些规则
- [架构文档](docs/架构文档.md) —— 怎么实现、数据长什么样、怎么验证
- [产品蓝图](docs/产品蓝图.md) —— 接下来做什么
- [二次开发](docs/二次开发.md) —— 想基于它做自己的版本，从这里开始
- [文档索引](docs/README.md) · [贡献指南](CONTRIBUTING.md) · [变更日志](CHANGELOG.md)

## 许可证

MIT，见 [LICENSE](LICENSE)。
