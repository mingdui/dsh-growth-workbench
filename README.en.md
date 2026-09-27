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

## Highlights

**One thing today.** The 今日 tab gives you exactly one action, with its minimum version, its done-criteria and what counts as acceptable evidence. Tick it off and the page moves you on.

**Every task tells you how to learn it.** Each task carries a one-line "how to start", an **AI digest** (the points to grasp and the usual pitfalls) and a few source links. Missing? Hit *让 AI 汇总资料* and the agent searches, reads, and writes it back — and says so when it finds nothing citable instead of inventing a dead link.

**AI generates, you decide.** The transferable-skill candidates, the capability model and the plan are generated. The **scoring and the judgment stay with you**: which skills you actually have (confirmed one by one), how you rate each one (1/3/5 anchors on screen), what counts as evidence. A score the AI hands you is worth nothing.

**Evidence reads like a note.** A line of text, a picture (screenshot, whiteboard photo, a run's output) or a file (csv / json / txt / md / zip / pdf, up to 8MB each). Click the evidence line and a writing sheet opens — full sheet, no border, roomy line height. ⌘/Ctrl + Enter saves; **closing saves too**, so walking away loses nothing.

**Reviews have a rhythm.** A **node exam** each week (only the items from that week) and a **phase exam** when a phase completes. You answer on the page; the agent grades four dimensions against the rubric and writes the score, the attribution, the report and the next 7 days' adjusted tasks back. Half-answered papers can be closed and resumed — the draft is kept.

**Pace can run ahead of the calendar.** Got a free afternoon, or a task you already know? *继续做下一天* moves the pointer a day ahead; *回到日历节奏* takes it back.

**Your data stays on your machine.** Everything lives under `$DSH_HOME/growth-workbench/` — four JSON documents and an `evidence/` folder — and exports as one file. No account, no cloud.

**Eleven directions ship with a capability model.** Pick one and score yourself item by item right away.

## Install

Requires Node.js ≥ 22.19, the `dsh` CLI on `PATH`, and a profile that supports bundle plugins (e.g. `web`).

```bash
# from GitHub (recommended)
dsh plugin --profile web add github:mingdui/dsh-growth-workbench
```

Then **restart the DSH process** — the plugin manifest is not hot-reloaded.

```bash
dsh --profile web --dump-config | grep growth-workbench   # expect: - id: dsh-growth-workbench
```

<details>
<summary>Other install shapes (npm / tarball / local) and upgrading</summary>

```bash
dsh plugin --profile web add dsh-growth-workbench                     # npm
npm pack && dsh plugin --profile web add ./dsh-growth-workbench-*.tgz # tarball
git clone https://github.com/mingdui/dsh-growth-workbench.git \
  && dsh plugin --profile web add ./dsh-growth-workbench              # local
```

Upgrading: `dsh plugin --profile web update dsh-growth-workbench` (git / npm), `add` the new tarball, or `node scripts/update.mjs` for a local clone. The git shape follows `main`; the lockfile pins a commit SHA, so nothing moves until you update. Restart after upgrading; **your data is not touched**.

Uninstall: `dsh plugin --profile web remove dsh-growth-workbench` (data under `$DSH_HOME/growth-workbench/` stays).

</details>

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

- **The capability models are drafts.** All eleven ship with the release, none is industry-calibrated, and the page says so. Good enough to locate yourself; not a standard.
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
