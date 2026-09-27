# dsh-growth-workbench

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen.svg)](https://nodejs.org)
[![DSH plugin](https://img.shields.io/badge/DSH-plugin-blueviolet.svg)](https://github.com/deepseek-ai/deepseek-harness)

[中文](README.md) | English

**Turns "I want to change careers" into one thing you can finish today.**

A plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (CLI name `dsh`). Once installed, a **成长工作台** entry appears in the left menu.

## The problem it solves

People who want to switch fields or patch a skill gap get stuck on three things:

- **No idea what to do today.** The goal is too big to land on a calendar.
- **Lots of studying, nothing to show.** They can't say what they know, and have nothing to put in front of an interviewer.
- **No idea where they are.** No record, and no honest review.

This plugin links those three into one chain: **do one thing today → leave evidence → take a review on schedule → adjust from the result.**

## The main line

```
(1) target role → (2) your situation → (3) current state → (4) transferable skills
    → (5) capability model → (6) self-assessment → (7) 90-day plan → (8) today
    → (9) evidence → (10) review → back to (7), adjusted
```

Steps 1-6 happen on the 画像 tab; the plan lands on 计划; the daily work is on 今日 (or the narrow 今日 pane on the right); reviews are on 考核.

## Install

Requires Node.js >= 22.19, the `dsh` CLI on `PATH`, and a profile that supports bundle plugins (e.g. `web`).

**From GitHub (recommended)**

```bash
dsh plugin --profile web add github:mingdui/dsh-growth-workbench
```

**From npm**

```bash
dsh plugin --profile web add dsh-growth-workbench
```

**From a local directory** (while changing the code)

```bash
git clone https://github.com/mingdui/dsh-growth-workbench.git
dsh plugin --profile web add ./dsh-growth-workbench
```

**From a tarball**

```bash
npm pack     # produces dsh-growth-workbench-<version>.tgz
dsh plugin --profile web add ./dsh-growth-workbench-<version>.tgz
```

**Restart the DSH process afterwards** either way (the plugin manifest is not hot-reloaded).

### Confirm it is installed

```bash
dsh --profile web --dump-config | grep growth-workbench   # expect: - id: dsh-growth-workbench
```

### Upgrading

| Install shape | Command |
|---|---|
| git (`github:mingdui/...`) or npm | `dsh plugin --profile web update dsh-growth-workbench` |
| local directory | `node scripts/update.mjs` |
| tarball | `dsh plugin --profile web add ./dsh-growth-workbench-<new version>.tgz` |

The git shape follows `main`; the lockfile pins a commit SHA, so nothing moves until you update. npm and tarball only count as an upgrade when the version number changes. **Restart after upgrading; your data is not touched.**

### Uninstall

```bash
dsh plugin --profile web remove dsh-growth-workbench
```

Unregisters the plugin only. Data under `$DSH_HOME/growth-workbench/` stays — export it first if you want a copy.
## Using it

After the restart: left menu → **成长工作台** → **画像**.

1. **Pick a direction** from the catalog, or type your own job title.
2. **Pick a route and answer four questions.** It follows up based on your situation — student, employed, switching, or freelance. Everything downstream is derived from those answers.
3. **Confirm your ground.** *让 AI 给出底盘候选* proposes the experience you can carry over; cross out what doesn't fit, tick what you've really done.
4. **Score yourself, item by item.** Every 1/3/5 anchor is on screen. After this you have a gap and an order to close it in.
5. **Generate the plan.** *让 AI 生成计划* writes the 90 days onto the 计划 tab.

From then on it is one thing a day: open 今日, do the task, tick it, leave a line of evidence (pictures and files welcome).

Reviews show up on time: a **node exam** weekly, a **phase exam** when a phase completes. Open the paper on 考核, answer, submit — the agent grades it in your own conversation and writes the result back.

## Where the data lives

`$DSH_HOME/growth-workbench/`: `profile.json`, `plan.json`, `progress.json`, `assessments.json` and `evidence/`. The page and the agent read and write this one copy — there is no second one.

Export: `curl -s localhost:<port>/gw/api/export > growth-workbench-backup.json`. Point `DSH_HOME` elsewhere to experiment in a separate sandbox.

## Known limits

- **The capability models are drafts.** All eleven ship with the release, none is a strict industry standard, and the page says so. Good enough to locate yourself; not a standard.
- **AI grading is not automatically verified.** The tools are tested against fixed inputs; "does the model score reasonably after reading the briefing" needs a real conversation.
- **No reminders.** The review cadence lives in the plan and is not wired to a timer.
- **No separate auth on the routes.** The DSH web server binds `127.0.0.1` by default; binding `0.0.0.0` needs your own check in front.

## Docs

- [产品文档](docs/产品文档.md) — who it is for, how it is used, what the rules are
- [架构文档](docs/架构文档.md) — how it is built, what the data looks like, how it is verified
- [产品蓝图](docs/产品蓝图.md) — what comes next
- [二次开发](docs/二次开发.md) — building your own version on top of this one
- [Docs index](docs/README.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## License

MIT — see [LICENSE](LICENSE).
