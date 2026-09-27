# dsh-growth-workbench

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen.svg)](https://nodejs.org)
[![DSH plugin](https://img.shields.io/badge/DSH-plugin-blueviolet.svg)](https://github.com/deepseek-ai/deepseek-harness)

中文文档 | [English](README.en.md)

面向普通用户的**个人成长工作台**，以 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（CLI 名 `dsh`）的 Bundle 插件形式分发。

它把这条主线串成一个闭环：

```
目标岗位 → 你的条件 → 当前状态 → 可迁移能力 → 能力模型 → 能力自评
        → 90 天计划 → 今日执行 → 证据 → 考核复盘
```

**页面和 Agent 读写同一份数据。** 左侧菜单就是一个整页（今日 / 计划 / 考核 / 画像 四个页签），右侧有一个「今日」Tab，另有 6 个 `growth_*` 工具给 Agent 用 —— 一份 JSON，两边共用。

## 功能

页面负责收集与展示，Agent 负责推导与判断：

| | 页面 | Agent |
|---|---|---|
| 方向（目录里的，或自己填一个） | 点选 / 输入 | 读取 |
| 四个选择题 + **条件追问** | 填写 | **据此推导下面三件事** |
| 可迁移能力（底盘） | 逐条确认 / 否决 | `growth_propose_transferable` |
| 能力模型 | 展示，可丢弃 | `growth_propose_capability_model` |
| 能力自评 | **锚点常驻屏幕，逐项点选** | 读取分数与缺口 |
| 90 天计划 | 展示 | `growth_save_plan` |
| 每日打卡 / 证据 / 档位 | **页面是唯一入口** | 读取 |
| 四维考核打分 | 展示历史与趋势 | `growth_save_assessment` |

Agent 推导的三件事都不预先写死：

- **可迁移能力**由追问答案推导，以**待确认清单**落到用户面前，每条确认过的都是用户自己点过头的；被否决的会被记住，不再提。
- **能力模型**按同一模板为任意方向生成（2-5 组、权重合计 100%、8-40 项、每项三个真锚点），并标注**未经行业校准** —— 这个区分必须活着，否则由它推出的每一个分数都会显得权威，而它们并不是。
- **追问**随当前状态而变：在校问专业与年级；在职问岗位、行业、日常经手的事；自由职业问收入来源、已经在交付的东西、技能。自由职业者没有岗位名可查，只有实际被付钱做过的事。

能力自评把 1/3/5 锚点常驻在屏幕上：打分时每个锚点都看得见，每项一次点击 —— 这是表单该做的事，也是逐条问答做不到的事。

## 环境要求

- Windows、macOS 或 Linux
- Node.js ≥ 22.19（`dsh` 自身的要求；本插件只用 `node:` 内置模块）
- `dsh` CLI 在 `PATH` 上（`@deepseek-ai/dsh`）
- 一个支持 bundle 插件的 DSH profile（如 `web`）

## 安装

### 从 GitHub 安装（推荐）

```bash
dsh plugin --profile web add github:mingdui/dsh-growth-workbench
```

> 本插件**不 import 任何 `@deepseek-ai/*` 包，也没有构建步骤** —— 仓库里的 `.mjs` 就是产物。所以 git 安装**不需要** `prepare` 脚本，也**不需要** `allowBuilds` 授权，装完即可用。

### 从 npm 安装

```bash
dsh plugin --profile web add dsh-growth-workbench
```

### 从 tarball 安装

```bash
npm pack     # 产出 dsh-growth-workbench-0.1.0.tgz
dsh plugin --profile web add ./dsh-growth-workbench-0.1.0.tgz
```

### 从本地目录安装（开发时最方便）

```bash
git clone https://github.com/mingdui/dsh-growth-workbench.git
dsh plugin --profile web add ./dsh-growth-workbench
```

这是 link 安装：源码目录删掉，插件就没了。它也是本插件唯一敢用 link 的场景 —— 因为不 import Harness 包，所以不存在"解析不到 peer 依赖"的问题。

**无论哪种方式，装完都要重启 DSH 进程**（插件清单与包元数据不热更新）。

### 验证装上了

```bash
dsh --profile web --dump-config | grep growth-workbench
# 期望看到：- id: dsh-growth-workbench
```

## 更新

升级方式取决于你当初是怎么装的：

| 安装形态 | 升级命令 |
|---|---|
| git（`github:mingdui/...`） | `dsh plugin --profile web update dsh-growth-workbench` |
| npm | `dsh plugin --profile web update dsh-growth-workbench` |
| tarball | `dsh plugin --profile web add ./dsh-growth-workbench-<新版本>.tgz` |
| 本地目录 / link | `node scripts/update.mjs` |

- **git 形态跟的是 `main` 分支。** 我们一推新提交，`update` 就会拉到最新那个提交；锁文件里 pin 的是提交 SHA，所以在你主动 `update` 之前，插件不会自己变。
- **npm 与 tarball 形态只在版本号变化时才算升级。** 只改文档、不改版本号，不会推送到你那里。
- **tarball 形态可以直接用新版覆盖旧版**，不需要先 `remove` —— 但**旧的 `.tgz` 文件必须还在**。如果已经删了，先 `dsh plugin --profile web remove dsh-growth-workbench`，再 `add` 新 tgz。

**升级后同样要重启 DSH 进程。**

**升级不会动你的数据。** 数据在 `$DSH_HOME/growth-workbench/`，与插件安装目录是分开的，升级只替换代码。稳妥起见可以先留一份备份：

```bash
curl -s localhost:<端口>/gw/api/export > growth-workbench-backup.json
```

### 版本与数据格式

插件版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。四份数据文档各自带一个 `version` 字段（当前为 `1`），由 `store.mjs` 在每次写入时盖上。

**目前还没有自动迁移**：文档结构若在某版本发生变化，插件不会自动改写你已有的数据，迁移步骤会写在该版本的 [CHANGELOG](CHANGELOG.md) 条目里。跨大版本升级前建议先 `export` 备份。

## 快速上手

重启后，左侧菜单 →「成长工作台」→ **画像**：

1. ① 选一个方向（或自己填）→ ② 先定路线、答四个选择题，它按你的身份追问的那几题也在这一步里
2. ③ 点「让 AI 给出底盘候选」—— 它会替你说「帮我看看我有什么底子」，Agent 据此给出可迁移能力；划掉不符合的，勾选确实做过的
3. 方向还没有能力模型时，「让 AI 建这个方向的能力模型」同理；然后 ④ 逐项自评，**每一项的 1/3/5 锚点都在屏幕上**
4. 点「让 AI 生成计划」，计划随即落到「计划」页签
5. 日常打卡、记证据只走「今日」页签或右侧「今日」Tab；要考核就点「让 AI 现在考核」

证据可以是一段文字，也可以**直接贴一张图**（截图、白板照、运行结果）：点「＋ 加一张图」即可，缩略图长在证据那一行下面。图片存在插件的数据目录里（`$DSH_HOME/growth-workbench/evidence/`），**只有你点缩略图右上角那个 × 才会删** —— 计划重写、任务被删都不会动它：证据是你的东西，不是缓存。

「让 AI 来做」按钮**只是替你打字的快捷方式**，不是隐藏的后台任务：那句话会作为**一个普通用户回合**发出去，你能看着它读、能打断、能中途纠正。而真正该由你判断的事 —— 你有什么底子、④ 怎么打分、什么算证据、每一次打卡 —— 都没有按钮，只有表单。

**发到哪个对话？** 从 ③ 可迁移能力起，工作台的运行都发进**它自己的那个对话**（第一次用时自动新建，名字叫「成长工作台」），而不是你此刻打开的那个 —— 上一轮的计划、考核、调整因此留在同一个上下文里。固定的名字就在页头，旁边可以「改绑到当前对话」或「重建一个」；那个对话被你删掉时页面会明说，不会悄悄发去别处。按钮按下去会先切到那个对话：运行必须看得见、能打断。

按钮上的措辞是公开的，你手打同样的话会触发同一次运行。

## 数据放在哪

`$DSH_HOME/growth-workbench/` 下四份 JSON，每份都原子写入（先写同目录临时文件，再 `rename`）：

| 文件 | 内容 |
|---|---|
| `profile.json` | 方向、路线、时间投入、约束、② 追问答案、已确认底盘、被否决的底盘、自评、生成的能力模型 |
| `plan.json` | 起始日、阶段（含天区间）、任务（8 字段 + 任务标识）、考核自查、作品集 |
| `progress.json` | 每个任务的完成状态、证据、证据档位、打卡日期集合 |
| `assessments.json` | 考核与自评历史（只追加） |

拆成四份是有意的：页面一天要写很多次 `progress.json`，而 Agent 很少写 `plan.json`，合成一份会让每次打卡都可能和一次计划修改撞车。

`GET /gw/api/export` 把四份合成一份返回 —— 数据搬出了用户的浏览器，就该还他一个自己留存的出口。

做实验或换机器时可以用 `DSH_HOME` 指向别处，插件跟着走。

## 卸载

```bash
dsh plugin --profile web remove dsh-growth-workbench
```

只注销插件。`$DSH_HOME/growth-workbench/` 里的数据不会被删 —— 想留底就先 export，再自己删目录。

## 项目结构

```
dsh-growth-workbench/
├── package.json        bundle 身份：dsh.client + dsh.bundle.patch
├── cordis.patch.yml    插入 profile 的那一行
├── index.mjs           宿主：注册路由与 6 个工具
├── api.mjs             宿主：页面调用的 JSON 路由
├── store.mjs           宿主：$DSH_HOME/growth-workbench/ 下的四份文档
├── model.mjs           领域：能力模型、权重、缺口、完成率、曲线规则
├── validate.mjs        领域：计划与考核的写入门禁
├── tools.mjs           宿主：Agent 的 6 个工具与它的简报
├── client.js           浏览器：左侧整页（四页签）+ 右侧「今日」Tab
├── selftest.mjs        离线自检，不需要 Harness，不需要 Harness
├── docs/               产品文档、架构文档、产品蓝图
└── scripts/            本地安装 / 更新脚本
```

## 开发

```bash
npm test        # node selftest.mjs —— 离线自检，不需要 DSH 在跑
npm run check   # 七个文件逐个语法自检
```

自检覆盖：每个文件按它被加载的形式解析、四处身份一致、宿主半边不 import Harness 包、模型的算术（权重 / 缺口 / 完成率 / 连续打卡 / 阶段天区间 / 曲线准入）、计划与考核的每一道门禁反例、6 个工具端到端跑在临时 `DSH_HOME` 上、每一条 HTTP 路由加一个 404。

动手改之前请先读 [CLAUDE.md](CLAUDE.md) —— 仓库级迭代规范，写了不可破坏的架构边界与数据原则。

## 已知边界

- **只有一份人工撰写的行业能力模型。** 数据运营是唯一由人写好锚点的方向；其余方向要等 Agent 按模板生成后才能逐项自评，而页面会如实标注它未经行业校准。编造锚点比承认这个缺口更糟。
- **生成的锚点只是第一版。** 结构上被校验过，但没有经过行业核对。
- **生成的能力模型不按集合做版本管理。** 它挂在画像上，没有可供挑选的画廊。
- **没有提醒。** 考核节奏目前只是计划里的一句话，尚未接到定时器。
- **路由没有独立鉴权。** DSH web server 默认绑 `127.0.0.1`，handler 拥有响应，信任边界与整个 app 一致；一旦绑到 `0.0.0.0`，就需要自行加 cookie 校验。
- **真模型未做端到端验收。** 6 个工具是拿固定输入验的；"AI 收到简报后能否按 rubric 打出合理分数"没有自动化验证，需要真实对话。

## 文档

- [产品文档](docs/产品文档.md) —— 这是给谁做的、解决什么问题、用户怎么用、有哪些规则和为什么不这么做
- [架构文档](docs/架构文档.md) —— 怎么实现的、与 DSH 怎么接、数据长什么样、哪些不变量被强制、怎么验证
- [产品蓝图](docs/产品蓝图.md) —— 往哪走、为什么这么走（**提案**，不是现状）
- [文档索引](docs/README.md)
- [贡献指南](CONTRIBUTING.md)
- [变更日志](CHANGELOG.md)

## 许可证

MIT，见 [LICENSE](LICENSE)。
