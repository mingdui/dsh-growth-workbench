任贡献指南

感谢你想改进 `dsh-growth-workbench`。本文件写给**改代码的人**；只想用的话看
[README](README.md) 就够了。

## 环境要求

- Node.js ≥ 22.19（`dsh` 自身的要求）
- 一个可用的 DSH profile（如 `web`），用于真机验证
- 本插件**没有运行时依赖、没有构建步骤**。仓库里的 `.mjs` 与 `.js` 就是发布产物，
  所以 `npm install` 装不出东西，也不需要装。

## 仓库结构

```
.
├── package.json        bundle 身份：dsh.client + dsh.bundle.patch
├── cordis.patch.yml    插入 profile 的那一行
├── index.mjs           宿主：注册路由与 6 个工具（只做装配）
├── api.mjs             宿主：页面调用的 JSON 路由与状态聚合
├── store.mjs           宿主：$DSH_HOME/growth-workbench/ 的原子读写
├── model.mjs           领域：岗位目录、能力模型、权重、缺口、完成率、曲线
├── validate.mjs        领域：计划、能力模型与考核的写入门禁
├── tools.mjs           宿主：Agent 的 6 个工具与它的简报渲染
├── client.js           浏览器：左侧整页（四页签）+ 右侧「今日」Tab
├── selftest.mjs        116 项离线检查
├── scripts/            install.mjs / update.mjs（本地安装与更新）
├── docs/               产品文档、架构文档、产品蓝图
└── .github/workflows/  CI 门禁
```

改动前请先读 [CLAUDE.md](CLAUDE.md) —— 那里写了不可破坏的架构边界、数据原则与
UI/UX 规范，本文件不重复它。两者的分工是：**CLAUDE.md 说"不能破什么"，
本文件说"怎么提交"**。

## 不可破坏的边界（摘要）

完整清单在 [CLAUDE.md](CLAUDE.md)。最容易踩的三条：

1. **宿主半边不得 import 任何 `@deepseek-ai/*` 包。** link 安装的插件真实路径在
   profile 的解析根之外，裸 import 解析不到。工具因此是普通对象，schema 直接写
   裸 JSON Schema。`selftest.mjs` 会断言这一点。
2. **`client.js` 必须保持 `window.__ModuleLoader__.load({ id, factory })` 形式**，
   不能改成 ESM import、TypeScript、JSX 或任何构建器专用语法。它的 `id` 必须等于
   包名。
3. **页面与 Agent 共用同一份 JSON。** 不允许在浏览器里另建真相源
   （`localStorage`、内存缓存、导出文件都不行）。

## 三处名字必须逐字一致

DSH 的加载器按 id 寻址，拼错一处就**静默不生效**：

| 位置 | 值 |
|---|---|
| `package.json` 的 `name` | `dsh-growth-workbench` |
| `cordis.patch.yml` 里插入行的 `id` 与 `name` | `dsh-growth-workbench` |
| `index.mjs` 的 `export const name` | `dsh-growth-workbench` |
| `client.js` 里 `__ModuleLoader__.load` 的 `id` | `dsh-growth-workbench` |

CI 会核对这四处。

## 开发循环

```bash
npm test        # node selftest.mjs —— 116 项离线检查，不需要 DSH 在跑
npm run check   # 七个文件逐个语法自检
```

改完代码后，把它推进正在跑的 profile：

```bash
node scripts/update.mjs     # 先跑自检，再重新注册本目录
```

然后**重启 DSH 进程**。插件清单与包元数据不热更新，改完不重启看不到效果。

真机验收最少要覆盖这几条用户路径：空状态、Agent 生成中、Agent 返回后、
已完成状态、错误状态，以及右侧窄栏。

## 提交规范

提交信息格式 `<type>: <描述>`，首行祈使句、不超过 72 字符。

| type | 用于 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修 bug |
| `docs` | 只改文档 |
| `refactor` | 不改行为的重构 |
| `test` | 测试 |
| `ci` | CI / 构建 |
| `chore` | 其他 |

- 一个提交只做一件事
- 破坏性变更在正文说明，并同步更新 [CHANGELOG.md](CHANGELOG.md)
- 改了产品行为就要同步更新 `selftest.mjs`；**但不许为了让测试变绿而删掉真实约束**

> **Windows 用户注意**：中文提交信息不要用 heredoc，Git Bash 会把它写成 U+FFFD
> 乱码而且不报错。用 `git commit -F <文件>`，提交后 `git log -1 --format=%B` 回读确认。

## 加一个 Agent 工具

工具定义集中在 `tools.mjs`，但**先想清楚它是否该存在**：

1. 它属于主线（目标岗位 → … → 考核复盘）的哪一段？说不出来就不要加。
2. 它是"读"还是"写"？写入必须走 `validate.mjs` 的门禁，不能绕过。
3. 在 `tools.mjs` 里加定义：`name` 用 `growth_` 前缀，`parameters` 与
   `output.schema` 写裸 JSON Schema（原因见上面的边界 1）。
4. 在 `selftest.mjs` 里加端到端检查，跑在临时 `DSH_HOME` 上。
5. 更新 [docs/产品文档.md](docs/产品文档.md) 的工具清单与 README 的功能表。
6. 工具数量变了，记得同步 `index.mjs` 的注释、`docs/架构文档.md` §三 与 §9.1。

## 加一个能力模型方向

岗位目录与能力模型在 `model.mjs`。新增方向要保证：2-5 组、权重合计 100%、
8-40 项能力、每项三个**真实**的 1/3/5 锚点（不能是占位符）。自检会拿同一个校验器
去校验**已发布的那份模型**，所以两者不可能各自漂移。

如果给不出真实锚点，就不要加这个方向 —— 让 Agent 按模板生成并标注"未经行业校准"
是诚实得多的做法。

## 改 UI

`client.js` 是手写的 `createElement` 树，没有构建步骤。它的失败模式是**静默的**：
深层调用里漏一个 `)` 不会报错，只会把后半棵树挪进错误的父节点。因此有一条硬规则：

> **每个 `createElement` 的 children 一律传数组**，不写可变位置参数。

UI 规范（触控目标 ≥ 44px、不用 emoji 当结构图标、尊重 `prefers-reduced-motion`、
窄宽度可用）见 [CLAUDE.md](CLAUDE.md)。

## 提交前清单

- [ ] `npm test` 全绿
- [ ] `npm run check` 无输出（七个文件语法都过）
- [ ] 没有新增绝对本地路径（尤其 `client.js` 与 docs）
- [ ] 有中文改动时扫过 U+FFFD：文件里不应出现 `\uFFFD`
- [ ] 改了行为就同步了 README / docs / CHANGELOG
- [ ] 三处名字仍然一致（若动过 `package.json` 或 `cordis.patch.yml`）

## 许可证

贡献即表示你同意以 [MIT](LICENSE) 许可发布你的贡献。
