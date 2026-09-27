# dsh-growth-workbench

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen.svg)](https://nodejs.org)
[![DSH plugin](https://img.shields.io/badge/DSH-plugin-blueviolet.svg)](https://github.com/deepseek-ai/deepseek-harness)

[中文](README.md) | English

A **personal growth workbench** for ordinary users, shipped as a bundle plugin for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (CLI name `dsh`).

It turns this line into one connected loop:

```
target role -> your conditions -> current situation -> transferable abilities
            -> capability model -> self-assessment -> 90-day plan
            -> daily execution -> evidence -> graded review
```

**The page and the agent read and write the same data.** The left sidebar gets a full
page (four tabs: 今日 / 计划 / 考核 / 画像), the right sidebar gets a 今日 tab, and the
agent gets six `growth_*` tools — one set of JSON documents, shared by both.

**Nothing about the domain changed.** The 8-field task contract, the weighted gap, the
four-dimension review, the iron rules and the evidence tiers are the same rules, and the
field names are the ones the original contract document uses — a second vocabulary for
one thing is how two definitions drift apart. What moved is where the data lives and who
can see it.

## Features

The page collects and displays; the agent derives and judges:

| | Page | Agent |
|---|---|---|
| Direction (from the catalog, or type your own) | click / type | reads it |
| Four intake questions + **conditional follow-ups** | type | **derives the three things below** |
| Transferable abilities (底盘) | confirm / reject one by one | `growth_propose_transferable` |
| Capability model | shows it, can discard it | `growth_propose_capability_model` |
| Capability self-assessment | **anchors on screen, one click each** | reads the scores and the gap |
| 90-day plan | shows it | `growth_save_plan` |
| Daily check-in / evidence / tier | **the page is the only way in** | reads it |
| Four-dimension review scoring | shows history and trend | `growth_save_assessment` |

Three things the agent derives, none of them fixed in advance:

- **Transferable abilities** are derived from the follow-up answers and land as a
  **pending list the user checks off**, so every confirmed line is something they said
  yes to. A rejected line is remembered and never proposed again.
- **The capability model** is generated from the same template for any direction
  (2-5 groups, weights summing to 100%, 8-40 items, three real anchors each) and is
  stamped **not industry-calibrated** — that distinction has to survive, or every score
  derived from it would look authoritative when it is not.
- **The follow-ups** depend on the current situation: students are asked about their
  major and year; employed users about role, industry and what they actually handle;
  freelancers about income sources, what they already deliver, and skills. A freelancer
  has no job title to look up — only what they actually get paid for.

Self-assessment is where a page beats a chat: every 1/3/5 anchor is visible at
the moment of scoring, and each item takes one click instead of a question in a
transcript that can only show one item at a time.

## Requirements

- Windows, macOS or Linux
- Node.js >= 22.19 (what `dsh` itself requires; this plugin uses only `node:` builtins)
- A working `dsh` CLI on `PATH` (`@deepseek-ai/dsh`)
- A DSH profile that supports bundle plugins (e.g. `web`)

## Install

### From GitHub (recommended)

```bash
dsh plugin --profile web add github:mingdui/dsh-growth-workbench
```

> This plugin **imports nothing from `@deepseek-ai/*` and has no build step** — the
> `.mjs` files in the repository are the artifact. So the git form needs **no** `prepare`
> script and **no** `allowBuilds` authorization. It works as installed.

### From npm

```bash
dsh plugin --profile web add dsh-growth-workbench
```

### From a tarball

```bash
npm pack     # produces dsh-growth-workbench-0.1.0.tgz
dsh plugin --profile web add ./dsh-growth-workbench-0.1.0.tgz
```

### From a local directory (most convenient while developing)

```bash
git clone https://github.com/mingdui/dsh-growth-workbench.git
dsh plugin --profile web add ./dsh-growth-workbench
```

This is a link install: delete the source directory and the plugin is gone. It is also
the one case where a link install is safe here — because the plugin imports no Harness
package, there is no "runtime peer import cannot resolve" problem.

**Whichever form you use, restart the DSH process afterwards** (plugin manifests and
package metadata are not hot-reloaded).

### Verify the install

```bash
dsh --profile web --dump-config | grep growth-workbench
# expected: - id: dsh-growth-workbench
```

## Updating

How you upgrade depends on how you installed it:

| Install form | Upgrade command |
|---|---|
| git (`github:mingdui/...`) | `dsh plugin --profile web update dsh-growth-workbench` |
| npm | `dsh plugin --profile web update dsh-growth-workbench` |
| tarball | `dsh plugin --profile web add ./dsh-growth-workbench-<new-version>.tgz` |
| local directory / link | `node scripts/update.mjs` |

- **The git form tracks the `main` branch.** `update` re-resolves it to the newest
  commit; the lockfile pins a commit SHA, so the plugin does not move on its own until
  you run `update` yourself.
- **The npm and tarball forms only see a change when the version number changes.** A
  commit that leaves the version alone never reaches you.
- **The tarball form upgrades in place** — just `add` the new `.tgz`, no `remove`
  first. The catch: the *old* `.tgz` file must still exist. If you deleted it, run
  `dsh plugin --profile web remove dsh-growth-workbench` first, then `add`.

**Restart the DSH process after upgrading, too.**

**Upgrading never touches your data.** It lives in `$DSH_HOME/growth-workbench/`,
separate from the plugin install; an upgrade only replaces code. To be safe, keep a
copy first:

```bash
curl -s localhost:<port>/gw/api/export > growth-workbench-backup.json
```

### Versions and the data format

Plugin versions follow [semantic versioning](https://semver.org/). Each of the four
data documents carries a `version` field (currently `1`), stamped by `store.mjs` on
every write.

**There is no automatic migration yet**: if a release changes the document shape, the
plugin will not rewrite data you already have, and the migration steps go in that
version's [CHANGELOG](CHANGELOG.md) entry. Export a backup before crossing a major
version.

## Quick start

After restarting, open the left sidebar -> 成长工作台 -> **画像**:

1. (1) Pick a direction (or type your own) -> (2) pick a route, answer the four questions,
   then answer the follow-ups your identity earns — all in the same step
2. (3) The **让 AI 给出底盘候选** button says "帮我看看我有什么底子" for you — the agent
   proposes your transferable abilities from your (2) answers; tick off the ones you
   actually did, reject the rest
3. If your direction has no capability model, the **让 AI 建这个方向的能力模型** button says
   it the same way; then score (4) item by item — every 1/3/5 anchor is on screen
4. The **让 AI 生成计划** button says "帮我生成成长计划"; the 计划 tab renders the plan as
   soon as it lands
5. Day to day, the 今日 tab and the right 今日 tab are the only place to check in and
   record evidence. For a review, the **让 AI 现在考核** button says "考核我"

Evidence can be a line of text or **a picture** (a screenshot, a whiteboard photo, a run's
output): hit **＋ 加一张图** and the thumbnail sits under the evidence line. Images live in
the plugin's data directory (`$DSH_HOME/growth-workbench/evidence/`) and **only the × on
the thumbnail deletes one** — rewriting the plan or dropping a task never touches them:
your evidence is yours, not a cache.

**An extra day spare? A task you already know how to do?** Once today's tasks are done the
今日 tab offers "继续做第 N 天 →": the pace is yours, there is no need to wait for the
calendar. It changes only *which day you are on* — the header then says both ("你已经在做第
8 天（按日历今天是第 5 天）") and offers *back to the calendar pace*. The start date and every
check-in date stay real: a check-in records what actually happened.

A button is **a shortcut for typing, not a hidden worker**: the phrase is delivered as an
**ordinary user turn**, so you watch it read, you can interrupt it, and you can correct it
mid-flight. And nothing that is *your* call gets generated at all — which abilities you
have, how you score (4), what counts as evidence and every check-in stay in forms you fill
in yourself.

**Which conversation?** From step (3) 可迁移能力 onwards, every run goes into the
workbench's own conversation — created automatically on first use and named 成长工作台 —
instead of whatever you happen to have open, so the plan, the review and the adjustments
stay in one context. The name sits in the page header, with *rebind to the current
conversation* and *start a fresh one* next to it; if that conversation is deleted the page
says so rather than quietly sending your request somewhere else. Clicking a button switches
to it first: a run has to be visible and interruptible.

The wording is on screen too: type any of those phrases by hand and you get the same run.

## Where the data lives

Four JSON documents under `$DSH_HOME/growth-workbench/`, each written atomically (a
sibling temporary file, then `rename`):

| File | Contents |
|---|---|
| `profile.json` | Direction, route, time budget, constraints, the (2) follow-up answers, confirmed abilities, rejected abilities, self-assessment, generated capability model |
| `plan.json` | Start date, phases (with day ranges), tasks (8 fields + 任务标识), self-check questions, portfolio |
| `progress.json` | Per-task completion, evidence, evidence tier, check-in dates |
| `assessments.json` | Review and self-assessment history (append-only) |

Separate files on purpose: the page writes `progress.json` many times a day while the
agent writes `plan.json` rarely, so one file would make every check-in a potential
conflict with a plan edit.

`GET /gw/api/export` returns all four as one document — the data moved out of the user's
browser, so it owes them a way to hold their own copy.

For experiments or moving machines, point `DSH_HOME` elsewhere and the plugin follows.

## Uninstall

```bash
dsh plugin --profile web remove dsh-growth-workbench
```

Registration only. `$DSH_HOME/growth-workbench/` keeps your data — export it first if you
want the copy, then delete the directory by hand.

## Repository layout

```
dsh-growth-workbench/
├── package.json        bundle identity: dsh.client + dsh.bundle.patch
├── cordis.patch.yml    the profile row
├── index.mjs           host: register the route and the six tools
├── api.mjs             host: the JSON routes the page calls
├── store.mjs           host: four documents under $DSH_HOME/growth-workbench/
├── model.mjs           domain: capability models, weights, gap, rates, curve rules
├── validate.mjs        domain: the plan and review write gates
├── tools.mjs           host: the agent's six tools and its briefings
├── client.js           browser: left page (4 tabs) + right 今日 tab
├── selftest.mjs        offline checks, no Harness required
├── docs/               product doc, architecture doc, blueprint
└── scripts/            local install / update scripts
```

## Development

```bash
npm test        # node selftest.mjs — offline checks, no DSH required
npm run check   # parse every file as the form it is loaded as
```

The self-test covers each file parsing as its loaded form; the four identities; that no
host file imports the Harness; the model's arithmetic (weights, gap, completion, streak,
phase intervals, curve eligibility); every plan and review gate, with counter-examples;
all six tools end to end against a throwaway home; and every HTTP route plus a 404.

Read [CLAUDE.md](CLAUDE.md) before changing anything — it is the repository-level
iteration contract, with the architectural boundaries and data principles that must not
be broken.

## Known limits

- **One human-written capability model.** 数据运营 is the only direction whose anchors a
  human wrote. The others can be self-scored only after the agent fills the template,
  and the page says that result is not industry-calibrated. Inventing anchors would be
  worse than admitting the gap.
- **Generated anchors are a first pass.** Structurally validated, not industry-checked.
- **Generated models are not versioned as a set.** They live on the profile; there is no
  gallery to pick a better one from.
- **No reminders.** The review cadence is still a sentence in the plan, not a timer.
  plan has to be re-generated or entered through `growth_save_plan`.
- **Routes are not individually authenticated.** The DSH web server binds loopback by
  default and the handler owns the response, so on `127.0.0.1` the trust boundary is the
  app's. Bound to `0.0.0.0`, the handler would need a cookie check.
- **No end-to-end acceptance run against a real model.** The six tools are verified with
  fixed inputs; "can the model score sensibly against the rubric after reading the
  briefing" needs a real conversation and is not automated.

## Documentation

- [产品文档](docs/产品文档.md) — who it is for, what it solves, the rules and why
  (Chinese)
- [架构文档](docs/架构文档.md) — how it is built, the DSH seams, invariants, verification
  (Chinese)
- [产品蓝图](docs/产品蓝图.md) — where it is going (**a proposal**, not current state)
  (Chinese)
- [Documentation index](docs/README.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## License

MIT. See [LICENSE](LICENSE).
