# CLAUDE.md · 仓库级迭代规范

本文件是给在本仓库干活的 Agent（Claude Code、Codex 等）的规范。
**继续开发前必须先读本文件与 [README.md](README.md)。**

文档分工：README 给使用者，[CONTRIBUTING.md](CONTRIBUTING.md) 给贡献者（提交规范、
开发循环），本文件给 Agent（命令、隐性规范、踩坑点）。**一事一处**，不要在多个文件里
复述同一条规则 —— 同一条规则写进两个文件，迟早只剩一个是对的。

## 项目定位

`dsh-growth-workbench` 是面向 C 端用户的 **DSH Bundle 插件**（`@deepseek-ai/dsh`）。
它不是静态 Demo，也不是独立 Web App。它由 Host half、Browser half、JSON API、
四份持久化文档和 7 个 Agent tools 组成。

产品主线：

```text
目标岗位 -> 你的条件 -> 当前状态 -> 可迁移能力 -> 能力模型 -> 能力自评
        -> 90 天计划 -> 今日执行 -> 证据 -> 考核复盘
```

任何新功能都必须说明它落在这条路径的哪一段，以及它如何把用户送到下一步。

## DSH 插件契约（改动 manifest 前必读）

DSH 的加载器**按 id 寻址**，下列四处必须逐字一致，拼错一处就**静默不生效**：

| 位置 | 值 |
|---|---|
| `package.json` 的 `name` | `dsh-growth-workbench` |
| `cordis.patch.yml` 插入行的 `id` 与 `name` | `dsh-growth-workbench` |
| `index.mjs` 的 `export const name` | `dsh-growth-workbench` |
| `client.js` 里 `__ModuleLoader__.load` 的 `id` | `dsh-growth-workbench` |

其它契约要点（CI 会核对能自动核对的部分）：

- `dsh.bundle.patch` 指向包内 `cordis.patch.yml`，且该文件必须被 `files[]` 收录 ——
  否则发布的 tarball 丢失配置层，插件装上却不会被挂载。
- `dsh.client.platform` 必须是 `"web"`，且 `exports["./client"]` 必须指向真实存在的
  文件；`exports` 必须含 `./package.json`（dsh 要读 manifest）。
- 新增/覆盖 patch 行时：**新行放 `insert` 下，覆盖已有行写在顶层**。把覆盖写进
  `insert` 会触发 `duplicate loader entry id`，profile 起不来。
- patch 对目标行的 `config` 是**整段替换、不做深合并**，覆盖时必须重述该行全部键。
- 本插件**刻意不声明 peerDependencies** —— 因为它一个 `@deepseek-ai/*` 包都不 import。
  改这条之前先读下一节。

## 不可破坏的架构边界

- `index.mjs` 只负责 Host 插件注册：JSON API route 与 Agent tools（纯装配）。
- `api.mjs` 负责页面 API、状态聚合和写入路由。
- `store.mjs` 负责 `$DSH_HOME/growth-workbench/` 的原子读写。
- `model.mjs` 负责岗位目录、能力模型、权重、缺口、证据和阶段计算。
- `validate.mjs` 负责计划、能力模型和考核的写入门禁。
- `tools.mjs` 是 Agent 读写同一份数据的唯一工具层。
- `client.js` 是浏览器端页面与右侧 Today tab。只能通过 `/gw/api` 访问数据，
  不能读取磁盘。
- Client code 必须保持 `window.__ModuleLoader__.load` factory 形式，不能改成
  import、TypeScript、JSX 或 bundler 专用语法。
- **Host 文件不得 import 任何 `@deepseek-ai/*` 包。** link 安装的插件真实路径在
  profile 的解析根之外，裸 import 解析不到；所以工具是普通对象、schema 直接写裸
  JSON Schema（就是 `defineTool` 编译出来的形状），代价是校验断言要自己写。
  `selftest.mjs` 会断言这条边界。
- **这条边界反过来是资产**：宿主半边与领域层能在普通 `node` 里直接跑 ——
  离线自检（`npm test`）就是这么验的，不需要 Harness、不需要 DSH 在运行、不需要浏览器。
  它也让我们能用 git 形态分发而无需 `prepare` 脚本与 `allowBuilds` 授权。

## 数据原则

- 页面与 Agent 必须读写同一份 JSON 数据，不得另建 localStorage 真相。
- `profile.json`、`plan.json`、`progress.json`、`assessments.json` 分开保存，
  写入必须原子化（同目录临时文件 + `rename`）。
- `verifiedFacts`、`pending`、`dismissedTransferable` 只追加，不得静默覆盖。
- 用户未确认的推测不能写入 `verifiedFacts`。
- `任务标识` 一经分配不复用；删除任务的编号永久作废（存储以它为键）。
- 计划任务必须满足 8 字段合同，预计分钟必须在 15-60 之间。
- `planStart` 必须存在，阶段天数必须从 1 开始连续无重叠无空洞。
- 能力模型必须有 2-5 组、权重合计 100%、8-40 项能力和真实的 1/3/5 锚点。
- `未确认` 与 `0 分` 不等价；缺数据要显式记录为未提交（`unsubmitted`）。
- 完成率和证据质量必须分开，不得合成一个"真实完成率"。
- **改动记录（`profile.changes`）只由 Agent 写**：页面上的编辑是用户自己做的，不进这份账。
  写入走 `store.appendChange()`（不走 `updateProfile` —— `APPEND_ONLY` 那套只留 `text` 一个
  字段）；**模块名由工具层给，不让模型填**；只追加，最多 50 条。
- **四个写入类工具的说明里必须带 `${TEACHER_CONTRACT}`**（能改什么 / 不许改什么 / 拒绝要给
  出路 / 改动留痕）。模型每次调用只看得到它正要调的那个工具 —— 抽成一个常量复用，不要各写一份。
  新增写入类工具时照做。

## UI/UX 规范

- 面向普通 C 端用户，不要出现"画外音"、实现解释、内部数据结构、工具调用说明。
- 用户看到的是"我现在该做什么"，不是"系统为什么这样实现"。
- 每个页面或模块都要有明确下一步，优先使用 `state.nextAction` 和深链锚点。
- 画像模块采用渐进式确认：完成并确认后折叠，只显示岗位、路线、状态或数量摘要；
  点击可重新编辑。
- 用户确认「你的条件」后，自动提交 Agent 任务生成可迁移能力；生成期间要显示
  "智能生成中…"。
- 用户确认可迁移能力后，自动提交 Agent 任务生成能力模型；不要强迫用户复制 prompt。
- 右侧 Today 是窄栏执行面板，不要复用主页面的完整列表。只突出一项最重要任务：
  动作、最低完成版本、完成勾选和证据入口。
- 完成任务必须有明显的正反馈：绿色状态、已完成文字、轻微层次变化；不能出现黑色
  大块或"像失败"的状态。
- 不使用 emoji 作为结构性图标。
- 可点击元素需要可见 hover/focus/pressed 状态，触控目标至少 44px。
- 支持窄窗口和移动宽度，表格必须允许横向滚动或提供卡片降级。
- 尊重 `prefers-reduced-motion`。

### `client.js` 的硬规则

每个 `createElement` 的 children **一律传数组**，不写可变位置参数。深层位置参数表
是这个文件唯一反复丢括号的地方，而丢括号**不会报错**：它只会把后半棵树静默挪进
错误的父节点（曾导致「考核自查」与「作品集」整段消失且无任何错误输出）。

## Agent 交互规范

- Agent 按钮是当前对话的普通用户回合，不要创建不可见的私有后台 Agent。
- 发送使用 `beginSubmission({ mode: 'queue' })` 与 `prompt(..., 'queue', ...)`，
  不能打断用户正在运行的对话。
- 发送中不能静默吞掉点击；必须有 running/queued/error 状态。
- Agent 写盘后页面必须通过刷新、轮询或事件更新。只显示"已发送"而不确认结果是不
  合格的。
- 只有状态满足预期 predicate 后，才能说"已完成"。

## 修改流程

1. 先读取相关文件，理解现有函数和测试契约。
2. 一个改动只解决一个明确问题，不要同时重写 API、状态模型和整页 UI。
3. 小范围精确修改；大块结构重构先读取完整区间后再一次性替换。
4. 每次修改后立刻执行：

```powershell
node --check client.js
node --check api.mjs
node selftest.mjs
```

5. 自测失败时先修复失败，不要继续叠加新功能。
6. 修改产品行为时同步更新 `selftest.mjs`，但**不能为了"变绿"删除真实约束**。
7. 最后检查用户路径：空状态、已完成状态、Agent 处理中、Agent 返回后、错误状态
   和右侧窄栏。

## 已知的坑

- **装完必须重启 DSH 进程。** 插件清单与包元数据不热更新；只有用户自己的
  `cordis.patch.yml` 是热重载的。改完看不到效果，先怀疑没重启。
  （判断有没有重启：`GET /gw/api/state` 里有没有你新加的字段 —— 宿主半边的代码旧了，
  它会直接缺席。）
- **侧栏对"没有消息的空会话"一律显示「新会话」，不看标题。** 这是
  `dsh-client-ui-workspace` 的 `displayTitle` 写死的规矩（`node.blank ? t('session.new') : node.title`）。
  所以**判断改名成没成，别看侧栏** —— 看 `~/.dsh/storages/session_projcache/sessions/<id>.json`
  里的 `rows.title.val`（那才是真相）。我为此查错过一次：会话日志里没有 `session/title` 事件，
  我据此断定改名失败，其实标题一直是对的。第一条消息发出去，那一行自己就会变。
- **会话归属看工作区注册表，不看 `cwd`。** 只带 `cwd` 建出来的会话在侧栏挂「未分组」——
  注册表（`~/.dsh/storages/workspace.json`）问的是"这个目录注册成工作区了吗"。两处都要做：
  宿主挂载时 `ctx.get('workspaceRegistry').create(path, title)`（异步挂载，服务可能还没上，
  要重试），页面再用 `rootCtx.get('workspaces').create({path})` 确保一次。
- **`dsh plugin --profile web --dump-config`** 是看层栈是否正确的第一手段：应出现
  `# == dsh-growth-workbench` 层且无 duplicate 告警。
- **不要手写 profile 的 `package.json`。** `dsh plugin` 子命令负责维护它。
- **不要直接改已安装的 DSH deployment preset。** 改本仓库，再用
  `node scripts/update.mjs` 重新注册。
- **`client.js` 里不得出现绝对本地路径。** 它要跑在浏览器里。
- **中文提交信息不要用 heredoc。** Windows + Git Bash 会把 heredoc 里的中文写成
  U+FFFD 乱码而且**不报错**，静默进历史。用 `git commit -F <文件>`，提交后回读
  `git log -1 --format=%B` 确认。
- **改完中文文档要扫 U+FFFD。** 这个写入通道会逐字节损坏中文字符，产出仍是合法
  UTF-8，所以严格解码器抓不到：

```powershell
$t=[System.IO.File]::ReadAllText('文件路径',[System.Text.Encoding]::UTF8); ([regex]::Matches($t,[char]0xFFFD)).Count
```

CI 已把这条做成门禁。

- **GitHub Actions 的步骤名里不能出现「冒号 + 空格」。** `- name: A (b: c)` 会让 YAML 把
  `c` 当成嵌套映射，**整个工作流文件解析失败**。表现极具迷惑性：GitHub 照样创建 run 并标
  Failure，但 **job 数为 0**、没有任何日志可点开 —— 看起来像「CI 挂了」，其实是文件根本没被
  接受。改完 `ci.yml` 先用 js-yaml 在本地解析一遍再推（`dsh` 自带 js-yaml，不必装依赖）。

- **客户端插件的 `inject` 只写真正的必需服务（现在是 `slots`）。** 用户在另一台电脑上撞过：
  `dsh-growth-workbench: pending (waiting for services: sidebarRightTabs, sidebarRight)` ——
  那台机器的 profile 没装右侧栏那一套，于是插件一直 pending，整个 web boot 报
  「1 entry did not activate」。右栏只是加分项，所以它改成运行时 `ctx.get`、取不到就跳过并
  在控制台说一句。**新增任何"只有某些 profile 才有"的服务时，一律走 `ctx.get`，不要写进 `inject`。**

## 不在本仓库里的东西

- **浏览器级验收脚本**（无头 Chrome + DevTools Protocol，驱动一次性 DSH 实例、
  真的点页面并回查磁盘）不在本仓库内。它依赖本机排障材料，暂不外发。
  本仓库提供的自动化验证是 `npm test` 的离线自检。
- **真模型的端到端验收没做。** 7 个工具是拿固定输入验的；"模型读到简报后能否按
  rubric 打出合理分数"需要真实对话。

## 发布清单

- [ ] `npm test` 全绿；`npm run check` 无输出
- [ ] 四处身份仍然一致；`files[]` 含 `cordis.patch.yml`、`client.js`、`dsh.client`
      与 `exports["./client"]` 指向的文件真实存在
- [ ] 无 `@deepseek-ai/*` import 混入宿主半边
- [ ] 中文文件无 U+FFFD；无绝对本地路径
- [ ] 改过行为则 `CHANGELOG.md` 与 README/docs 同步
- [ ] `npm pack --dry-run` 的产物列表符合预期
- [ ] 发布后给仓库打 `dsh-plugin` topic（DSH 官方插件发现机制）
- [ ] 真机走一遍：装 → 重启 → 侧栏出现「成长工作台」→ 打卡一次并回查
      `progress.json`

## 版本与数据格式

- **语义化版本。用户能看到的变化就 bump 版本号**：git 形态跟的是 `main` 提交，但
  npm 与 tarball 形态**只认版本号** —— 不 bump，那两种用户永远收不到。
- 四份文档各自带 `version` 字段（`store.mjs` 的 `DATA_VERSION`，每次写入时盖上）。
  **改文档结构必须同时 bump `DATA_VERSION`。**
- **读取端目前不校验 `version`，也没有自动迁移。** 所以结构变更只有两条安全路径：
  ① 向后兼容（新字段给默认值，旧文档仍读得下去）；② 在该版本的 `CHANGELOG.md`
  条目里写清手工迁移步骤。**不要指望插件自动改写用户已有数据。**
- 改了文档结构或写入门禁，同步更新 `selftest.mjs` 的断言 —— 但不能为了变绿删掉
  真实约束。
- 用户数据在 `$DSH_HOME/growth-workbench/`，与插件安装目录分离。升级只替换代码；
  **任何版本都不许在升级路径上删除或改写用户数据。**

## 推荐迭代命令

```powershell
npm test
node scripts\update.mjs
dsh --profile web --dump-config | Select-String growth-workbench
```
