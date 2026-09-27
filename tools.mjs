/**
 * `dsh-growth-workbench` — the tools the agent uses.
 *
 * This module is the whole agent-facing half. The agent calls a tool and reads the
 * same documents the page writes — no export step, no intermediate file format,
 * no copy to keep in sync.
 *
 * Six tools, split by who owns the write:
 *
 *     growth_context                    read  — the briefing; scopes cover the whole picture
 *     growth_save_plan                  write — the plan; identifiers and intervals validated
 *     growth_save_profile               write — the 画像; confirmed facts are append-only
 *     growth_propose_transferable       write — the 底盘 proposal, pending until checked off
 *     growth_propose_capability_model   write — fill the model template for a new direction
 *     growth_save_assessment            write — one review round; history is append-only
 *
 * This plugin imports nothing from the Harness: a plugin installed
 * by path sits outside the profile's resolution root, so a bare `@deepseek-ai/...`
 * import would not resolve. Tool definitions are therefore written as plain objects
 * whose `parameters` and `output.schema` are already raw JSON Schema.
 *
 * @module dsh-growth-workbench/tools
 */
import {
  ATTRIBUTIONS,
  FEEDBACK_ROWS,
  IRON_RULES,
  ROLE_STATUS,
  ROLES,
  backgroundLines,
  backgroundQuestionsFor,
  completionRate,
  currentPhase,
  curvePoints,
  dateOfDay,
  dayNumber,
  evidenceDistribution,
  gapAnalysis,
  gradeOf,
  highWeightItems,
  missingBackground,
  planTasks,
  resolveRole,
  resolveRoleStatus,
  streakDays,
  weekRate,
} from './model.mjs'
import { appendAssessment, effectiveToday, readAll, setTransferableSuggestions, today, updatePlan, updateProfile, updateTask } from './store.mjs'
import { MODEL_TEMPLATE_NOTE, canonicalCapabilityModel, canonicalLearning, canonicalNotTransferable, canonicalPlan, canonicalReview, canonicalTransferable } from './validate.mjs'

/** Tool names are prefixed so they cannot collide with another plugin's. */
export const TOOL_NAMES = [
  'growth_context',
  'growth_save_plan',
  'growth_save_profile',
  'growth_save_assessment',
  'growth_propose_transferable',
  'growth_propose_capability_model',
  'growth_save_learning',
]

/** Render a string-valued tool result as one text block. */
const asText = (_args, value) => [{ type: 'text', text: String(value) }]

/** A generic pending card, so the tool row reads as itself while it runs. */
const card = (title) => () => ({ card: 'generic', title, kind: 'other', rawInput: {} })

/** One line per task, for the briefing's progress section. */
function progressLine(task, entry) {
  const tier = entry?.tier ?? 'null'
  const dates = (entry?.checkInDates ?? []).join(',')
  return [
    `- [${entry?.done === true ? 'x' : ' '}] ${task.ref} ${task.action}`,
    `任务标识：${task.id}`,
    `能力项：${task.capability}`,
    `预计分钟：${task.minutes ?? ''}`,
    `打卡日期：${dates}`,
    `证据档位：${tier}`,
    `证据：${entry?.evidence ?? ''}`,
  ].join(' | ')
}

/** The metrics block every briefing opens with. */
function metricsBlock(state) {
  const { profile, plan, progress, assessments } = state
  // 两个时钟都交给 Agent，别让它自己猜：`day` 是**进度天**（它写考核轮次要用的），
  // `planDate` 是那一天对应的**计划日期**，`today()` 是**真实日期**。提前模式下后两者不同。
  const date = effectiveToday(profile)
  const day = dayNumber(plan.planStart, date)
  const planDate = day === null ? '' : dateOfDay(plan.planStart, day)
  const phase = currentPhase(plan, day)
  const completion = completionRate(plan, progress)
  const evidence = evidenceDistribution(plan, progress)
  const rate = weekRate(plan, progress, day)
  const role = resolveRole(profile)
  const analysis = role === undefined ? null : gapAnalysis(role, profile.selfAssessment?.scores ?? {})
  const lastReview = (assessments.history ?? []).filter((entry) => entry.kind === 'review').at(-1)

  const lines = [
    `# 成长工作台 · 现状`,
    ``,
    `- 今天：${day === null ? date : planDate}（计划第 ${day === null ? '—' : String(day)} 天，当前阶段：${phase?.name ?? '—'}）`,
    // 只有两个时钟不同的时候才啰嗦这一句 —— 平时它就是噪音。
    planDate.length > 0 && planDate !== today() ? `- ⚠️ 节奏比日历快：进度天是第 ${String(day)} 天，实际日期是 ${today()}（打卡日期照样记实际日期）` : '',
    `- 目标方向：${profile.targetRole || '（未设定）'}${profile.targetRoleStatus ? `（${ROLE_STATUS[profile.targetRoleStatus]?.label ?? profile.targetRoleStatus}）` : ''}`,
    `- 路线：${profile.route || '—'}　每天投入：${profile.timePerDay || '—'}　截止：${profile.deadline || '—'}`,
    `- 计划起始日：${plan.planStart || '（未设定 —— 面板只能拿首次打开日当第 1 天）'}`,
    ``,
    `## 进度口径`,
    `- 完成率：已完成 ${String(completion.done)} / 全部 ${String(completion.total)}（${completion.rate === null ? '—' : `${String(Math.round(completion.rate * 100))}%`}）`,
    `- 第 ${day === null ? '—' : String(Math.floor((day - 1) / 7) + 1)} 周完成率：${rate === null ? '—（这一周没有排到天的任务，不是 0%）' : `${String(Math.round(rate * 100))}%`}`,
    `- 连续打卡天数：${String(streakDays(progress, day, plan.planStart))}（按**进度天**算：一天里推进三天就是连续三天）`,
    `- 证据档位分布：成果 ${String(evidence.成果)} 条 / 过程 ${String(evidence.过程)} 条 / 自述 ${String(evidence.自述)} 条 / 无证据 ${String(evidence.无证据)} 条`,
  ].filter(Boolean)
  if (analysis !== null) {
    lines.push(
      ``,
      `## 自评与差距`,
      `- 加权缺口 gap：${analysis.gap === null ? '—（还没有已确认的项，先做一次自评）' : `${analysis.gap.toFixed(2)} 分（目标线 3 分，W = ${String(analysis.W)}）`}`,
      `- 已确认 ${String(analysis.answeredCount)} 项 / 未确认 ${String(analysis.skippedCount)} 项${analysis.unansweredGroups.length > 0 ? `（本读数不含 ${analysis.unansweredGroups.join('、')} 组）` : ''}`,
      `- 补强优先级（按单项缺口降序，最多 5 条）：`,
      ...(analysis.priorities.length === 0
        ? ['  - 无（已确认项都在目标线上）']
        : analysis.priorities.slice(0, 5).map((item) => `  - ${item.id} ${item.name}：${String(item.score)} 分，缺口 ${String(item.shortfall)}（权重 ${String(item.weight)}）`)),
    )
  }
  lines.push(
    ``,
    `## 最近一次考核`,
    ...(lastReview === undefined
      ? ['- 还没有考核记录']
      : [
        `- ${lastReview.date}（第 ${String(lastReview.day)} 天）总分 ${String(lastReview.total)}（${lastReview.grade ?? gradeOf(lastReview.total).grade}）`,
        `- 四维：完成率 ${String(lastReview.scores.完成率)} / 证据质量 ${String(lastReview.scores.证据质量)} / 作品达标度 ${String(lastReview.scores.作品达标度)} / 知识考核 ${String(lastReview.scores.知识考核)}`,
        `- 覆盖项集：${lastReview.coverage}　置信度：${lastReview.confidence}　数据来源：${(lastReview.sources ?? []).join('、')}`,
        ...(lastReview.unsubmitted?.length > 0 ? [`- 未提交（按 0 计）：${lastReview.unsubmitted.join('、')}`] : []),
      ]),
  )
  return lines.join('\n')
}

/** The plan block: phases with their day intervals, then the task contract. */
function planBlock(state) {
  const { plan } = state
  if (plan.phases.length === 0) return '## 计划\n\n（还没有计划 —— 先在页面上回答四个选择题、选定方向与路线，再来生成计划）'
  const lines = ['## 计划', '', `总目标：${plan.goal || '—'}`, '']
  for (const [index, phase] of plan.phases.entries()) {
    lines.push(`### 阶段${String(index + 1)} ${phase.name}（第 ${String(phase.days[0])}-${String(phase.days[1])} 天）`)
    lines.push(`- 阶段目标：${phase.goal || '—'}`)
    lines.push(`- 实战项目：${phase.project || '—'}`)
    lines.push(`- 考核标准：${phase.criteria || '—'}`)
    if (phase.tasks.length === 0) {
      // 第一段没有天级任务不是「以后再说」：这份计划在「今日」页是空的，Agent 读到这句就该先补它。
      lines.push(index === 0
        ? '- 任务：⚠️ 第一段必须排到天，现在只排到周 —— 这份计划在「今日」页一条能执行的动作都没有，先把它细化到天'
        : '- 任务：只排到周（尚未细化到天）')
      for (const week of phase.weeks ?? []) lines.push(`  - 第 ${String(week.week ?? '?')} 周：${week.theme ?? ''}（验收：${week.acceptance ?? ''}）`)
    } else {
      lines.push('', '| 标识 | 引用 | 天 | 一句话动作 | 能力项 | 理由 | 预计分钟 | 最低完成版本 | 完成标准 | 可接受证据 | 前置依赖 |')
      lines.push('|---|---|---|---|---|---|---|---|---|---|---|')
      for (const task of phase.tasks) {
        lines.push(`| ${task.id} | ${task.ref} | ${task.day === null ? '—' : String(task.day)} | ${task.action} | ${task.capability} | ${task.reason} | ${String(task.minutes)} | ${task.minimumVersion} | ${task.doneCriteria} | ${task.acceptableEvidence} | ${task.dependsOn} |`)
        // 学习资料单独一行：它的正文可能很长，塞进表格会把表撑烂；也让人一眼看出**哪几道题
        // 还只有要求、没有方法** —— 那正是最该先补的一批。
        const learn = task.learn
        if (learn === undefined) {
          lines.push(`  - ${task.id} 的学习资料：还没有（只有要求，没有方法）`)
        } else {
          lines.push(`  - ${task.id} 的学习资料：怎么上手「${learn.method || '—'}」　汇总 ${String((learn.digest ?? '').length)} 字　来源 ${String((learn.links ?? []).length)} 条（${(learn.links ?? []).map((link) => link.url).join('　') || '无可引用来源'}）　找于 ${learn.foundAt ?? '—'}`)
        }
      }
    }
    lines.push('')
  }
  if (plan.selfCheck.length > 0) {
    lines.push('### 考核自查（只有题目，答案在考核时现场给）\n**考完必须调用 growth_save_assessment 收尾** —— 只在对话里问完不算考过，页面上不会出现这一轮。')
    for (const item of plan.selfCheck) lines.push(`- [${item.id}]（${item.phase}）${item.question}　→ 能力项 ${item.capability}`)
  }
  return lines.join('\n')
}

/** The per-task progress rows — the replacement for `progress.md`. */
function progressBlock(state) {
  const { plan, progress } = state
  const tasks = planTasks(plan)
  if (tasks.length === 0) return '## 进度明细\n\n（计划里还没有任务）'
  const lines = ['## 进度明细', '']
  for (const phase of plan.phases) {
    const phaseTasks = tasks.filter((task) => task.phaseName === phase.name)
    const done = phaseTasks.filter((task) => progress.tasks?.[task.id]?.done === true).length
    lines.push(`## ${phase.name}（${String(done)}/${String(phaseTasks.length)}）`)
    for (const task of phaseTasks) lines.push(progressLine(task, progress.tasks?.[task.id]))
    lines.push('')
  }
  return lines.join('\n')
}

/** Today's tasks, and the rule that decides which ones those are. */
function todayBlock(state) {
  const { profile, plan, progress } = state
  const day = dayNumber(plan.planStart, effectiveToday(profile))
  const tasks = planTasks(plan)
  const scheduled = tasks.filter((task) => task.day === day)
  const focus = scheduled.length > 0 ? scheduled : tasks.filter((task) => progress.tasks?.[task.id]?.done !== true).slice(0, 3)
  if (focus.length === 0) return '## 今日任务\n\n（计划里没有待办任务）'
  const lines = [
    '## 今日任务',
    '',
    scheduled.length > 0 ? `排到第 ${String(day)} 天的任务：` : '今天没有排到天的任务，以下是接下来的未完成任务：',
  ]
  for (const task of focus) lines.push(`- ${task.id}（${task.ref}）${task.action}　能力项 ${task.capability}　预计 ${String(task.minutes)} 分钟　最低完成版本：${task.minimumVersion}`)
  return lines.join('\n')
}

/** The 画像 block, including the three-layer fact separation . */
function profileBlock(state) {
  const { profile } = state
  const answers = Object.entries(profile.intake ?? {}).map(([key, value]) => `${key}=${String(value)}`).join(' ')
  const questions = backgroundQuestionsFor(profile.intake)
  const lines = [
    '## 画像',
    '',
    `- 当前身份：${profile.currentRole || '—'}`,
    `- 目标方向：${profile.targetRole || '—'}（${profile.targetRoleStatus || '—'}）`,
    `- 一句话定位：${profile.positioning || '—'}`,
    `- 路线：${profile.route || '—'}　每天投入：${profile.timePerDay || '—'}　截止：${profile.deadline || '—'}`,
    `- 四个选择题：${answers || '—'}`,
  ]

  // 追问答不上来，底盘与能力模型就没有来源 —— 这一块要显式说清缺什么。
  if (questions === undefined) {
    lines.push('- **当前状态的追问还没答**：先答 ② 的第一题（当前状态），追问才定得下来')
  } else {
    const background = backgroundLines(profile)
    lines.push(`- 当前状态的追问（${questions.when}）：${background.length > 0 ? '' : '**还没答**'}`)
    for (const line of background) lines.push(`  - ${line}`)
    const missing = missingBackground(profile)
    if (missing.length > 0) lines.push(`  - ⚠️ 必填还没填：${missing.join('、')} —— 底盘与能力模型都要从它推，不能在空白上编`)
  }

  lines.push(
    `- 已确认的底盘（可用、可讲）：${(profile.verifiedFacts ?? []).join('；') || '—'}`,
    `- 待用户确认的底盘提议：${(profile.transferableSuggestions ?? []).map((item) => `${item.name}：${item.text}`).join('；') || '—'}`,
    `- 用户已否掉的底子（**不要再提议**）：${(profile.dismissedTransferable ?? []).join('；') || '—'}`,
    `- 待确认的推测（**不得当作用户事实**）：${(profile.pending ?? []).join('；') || '—'}`,
    `- 经历替代不了的部分（当前提案）：${(profile.notTransferable ?? []).join('；') || '—'}`,
    `- 能力模型来源：${describeModelSource(profile)}`,
    `- 最近一次自评：${profile.selfAssessment === null || profile.selfAssessment === undefined ? '—' : `${profile.selfAssessment.date}，已确认 ${String(Object.keys(profile.selfAssessment.scores ?? {}).length)} 项，gap ${profile.selfAssessment.gap === null ? '—' : profile.selfAssessment.gap.toFixed(2)}`}`,
  )
  return lines.join('\n')
}

/** 一两句话说明"现在拿哪份模型给你打分"，因为生成的模型与预置模型可信度不同。 */
function describeModelSource(profile) {
  const source = resolveRoleStatus(profile)
  const role = resolveRole(profile)
  if (role === undefined) return `${ROLE_STATUS[source]?.label ?? source}（还没有模型，无法逐项自评）`
  const label = ROLE_STATUS[source]?.label ?? source
  if (source === 'generated') {
    return `${label} · ${role.name} · ${String(role.items.length)} 项 · 依据：${(role.basedOn ?? []).join('；') || '未记录'}`
  }
  return `${label} · ${role.name} · ${String(role.items.length)} 项`
}

/** The active capability model, in full — the structural template for a new one. */
function modelBlock(state) {
  const { profile } = state
  const role = resolveRole(profile)
  const source = resolveRoleStatus(profile)
  if (role === undefined) {
    const template = ROLES['data-ops']
    return [
      `## 能力模型`,
      ``,
      `当前方向（${profile.targetRole || '未设定'}）还没有能力模型，所以自评与差距分析都无法逐项落点。`,
      `可以让 AI 生成一份：「帮我建这个方向的能力模型」。`,
      ``,
      `下面是随版本发布的预置模型，**结构照它**：`,
      ``,
      ...renderModel(template, 'preset'),
    ].join('\n')
  }
  return [`## 能力模型（${ROLE_STATUS[source]?.label ?? source}）`, '', ...renderModel(role, source)].join('\n')
}

/** Render one capability model as a readable table. */
function renderModel(role, source) {
  const lines = [
    `- 方向：${role.name}　定位：${role.positioning}`,
    `- 来源：${ROLE_STATUS[source]?.label ?? source}${source === 'generated' ? `（生成于 ${role.generatedAt ?? '—'}）` : ''}`,
  ]
  if (source === 'generated' && (role.basedOn ?? []).length > 0) lines.push(`- 依据的用户背景：${role.basedOn.join('；')}`)
  lines.push('', '| 组 | 组权重 | 能力项 | 组内权重 | 1 分锚点 | 3 分锚点 | 5 分锚点 |', '|---|---|---|---|---|---|---|')
  for (const group of role.groups) {
    for (const item of role.items.filter((entry) => entry.group === group.key)) {
      lines.push(`| ${group.key} ${group.name} | ${String(group.weight)}% | ${item.id} ${item.name} | ${item.level} | ${item.anchors[0]} | ${item.anchors[1]} | ${item.anchors[2]} |`)
    }
  }
  const high = highWeightItems(role)
  lines.push('', `- 高权重项（深度自评用，${String(high.length)} 项）：${high.map((item) => item.id).join('、')}`)
  return lines
}

/** The assessment history block, plus the curve's eligibility caveats. */
function historyBlock(state) {
  const { assessments, profile } = state
  const history = assessments.history ?? []
  const role = resolveRole(profile)
  if (history.length === 0) return '## 考核与自评历史\n\n（还没有记录）'
  const lines = ['## 考核与自评历史', '']
  for (const entry of history) {
    const label = entry.kind === 'review' ? '考核' : '自评'
    lines.push(`- ${entry.date}（第 ${String(entry.day)} 天，${label}，覆盖项集 ${entry.coverage ?? '—'}，置信度 ${entry.confidence}）`
      + (entry.scores === null || entry.scores === undefined
        ? `，gap ${entry.gap === null || entry.gap === undefined ? '—' : Number(entry.gap).toFixed(2)}`
        : `，四维 ${Object.entries(entry.scores).map(([key, value]) => `${key} ${String(value)}`).join(' / ')}，总分 ${String(entry.total)}（${entry.grade ?? gradeOf(entry.total).grade}）`))
  }
  const points = curvePoints(history)
  lines.push('', `能力曲线：${String(points.length)} 个点（只有 \`覆盖项集 = 全量\` 的轮次进曲线）`)
  // 模型换了，历史曲线点属于旧项集 —— 跨模型比较是拿两把尺子量同一件事。
  if (role !== undefined && points.length > 0) {
    const known = new Set(role.items.map((item) => item.id))
    const foreign = [...new Set(points.map((point) => point.能力项))].filter((id) => !known.has(id))
    if (foreign.length > 0) {
      lines.push(`- ⚠️ 历史里有 ${String(foreign.length)} 个能力项不在当前模型里（${foreign.slice(0, 8).join('、')}${foreign.length > 8 ? '…' : ''}）—— 本轮模型是更换过的，**这些点不能与当前模型的点画在同一条线上**`)
    }
  }
  if (role !== undefined) {
    const items = highWeightItems(role)
    lines.push(`高权重项（深度自评用，${String(items.length)} 项）：${items.map((item) => item.id).join('、')}`)
  }
  return lines.join('\n')
}

/**
 * Build the briefing for one scope.
 *
 * `scope` exists so the agent can ask for exactly what it needs: a review run
 * wants the metrics plus the task rows, while a chat aside ("我还有什么没做")
 * wants today's tasks alone. `model` returns the capability model in force —
 * which is also the structural template a generated one has to match.
 */
export function briefing(scope = 'brief') {
  const state = readAll()
  switch (scope) {
    case 'plan':
      return [metricsBlock(state), '', planBlock(state)].join('\n')
    case 'progress':
      return [metricsBlock(state), '', progressBlock(state)].join('\n')
    case 'profile':
      return [metricsBlock(state), '', profileBlock(state)].join('\n')
    case 'model':
      return [metricsBlock(state), '', modelBlock(state)].join('\n')
    case 'history':
      return [metricsBlock(state), '', historyBlock(state)].join('\n')
    case 'today':
      return todayBlock(state)
    case 'all':
      return [metricsBlock(state), '', todayBlock(state), '', planBlock(state), '', progressBlock(state), '', profileBlock(state), '', modelBlock(state), '', historyBlock(state)].join('\n')
    case 'brief':
      return [metricsBlock(state), '', todayBlock(state)].join('\n')
    default:
      throw new Error(`growth_context: 未知的 scope ${JSON.stringify(scope)}，可用：brief / today / plan / progress / profile / model / history / all`)
  }
}

/** A compact summary of what a plan write produced. */
function summarisePlan(plan, previous) {
  const tasks = planTasks(plan)
  const before = planTasks(previous).length
  const ids = tasks.map((task) => task.id)
  const lowest = ids.length === 0 ? 0 : Number(ids[0].slice(1))
  const highest = ids.length === 0 ? 0 : Math.max(...ids.map((id) => Number(id.slice(1))))
  return [
    `计划已写入。`,
    `- 起始日：${plan.planStart}（第 1 天）→ 第 ${String(Math.max(...plan.phases.map((phase) => phase.days[1])))} 天`,
    `- 阶段：${String(plan.phases.length)} 个　任务：${String(tasks.length)} 个${before === 0 ? '' : `（原 ${String(before)} 个）`}`,
    `- 任务标识：${ids.length === 0 ? '—' : `T${String(lowest)} 起的 ${String(tasks.length)} 个，最大 T${String(highest)}`}（下一个新任务将是 T${String(plan.nextTaskNumber)}）`,
    `- 阶段区间：${plan.phases.map((phase) => `${phase.name}[${String(phase.days[0])}-${String(phase.days[1])}]`).join(' ')}`,
    `- 考核自查：${String(plan.selfCheck.length)} 题`,
    ``,
    `面板刷新即可看到。任务标识一经分配便不再改变；删除过的编号作废不复用。`,
  ].join('\n')
}

// ------------------------------------------------------------------ 工具定义

/**
 * `growth_context` — read the whole picture.
 *
 * The single read: metrics, today's tasks, the plan, the per-task progress rows,
 * the 画像, the capability model in force and the history come back together,
 * because the data never left the disk.
 */
export const growthContext = {
  name: 'growth_context',
  description: '读取成长工作台的现状：目标方向、路线、第几天与当前阶段、当前状态的追问答案（专业/岗位/技能）、完成率、连续打卡、证据档位分布、加权缺口与补强优先级、最近一次考核、今日任务。scope 可选 brief（默认）/ today / plan / progress / profile / model / history / all。用户问「我还有什么没做」「帮我考核我」「看看进度」「我离目标还差多少」时先调它，不要凭印象报数。',
  parameters: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['brief', 'today', 'plan', 'progress', 'profile', 'model', 'history', 'all'],
        description: 'brief=指标+今日任务；progress=每个任务一行（考核必用）；plan=计划全文（含 8 字段）；profile=画像（含追问答案与底盘）；model=当前能力模型全文（生成新模型时照它的结构）；history=考核与自评历史；all=全部。',
      },
    },
  },
  output: { schema: { type: 'string' }, render: asText },
  async execute(args) {
    return (briefing(typeof args?.scope === 'string' ? args.scope : 'brief'))
  },
  presentCall: card('Read growth workbench'),
}

/**
 * `growth_save_plan` — write the plan.
 *
 * The write path owns the rules: stable `任务标识` that are never reused, phase
 * day intervals that tile without gaps, and the 8-field task contract. A plan
 * that violates them is refused with the specific reasons, instead of being
 * written and quietly producing wrong numbers everywhere downstream.
 */
export const growthSavePlan = {
  name: 'growth_save_plan',
  description: '写入 90 天成长计划。每个任务必须给全 8 个字段：action 一句话动作 / capability 能力项（必须是能力模型里的编号，评估类任务写全角 —）/ reason 任务理由 / minutes 预计分钟（15-60）/ minimumVersion 最低完成版本 / doneCriteria 完成标准 / acceptableEvidence 可接受证据 / dependsOn 前置依赖（写「阶段.序号」这个引用，如 1.3；没有依赖写「无」—— 它既不是天号也不是任务序号本身）。另外每个任务可以带 `learn`（学习资料：method 怎么上手 / digest 汇总 / links 来源）—— **第一段（排到天的那一段）的每道题都要带**，只给要求不给方法，做题的人第一步就卡住；后面的段留到用到时用 growth_save_learning 补。**阶段1（第一段）必须排到天** —— 它的 tasks 不能是空数组，否则「今日」页一条能执行的任务都没有；后面的阶段可以只排到周（用 weeks 写主题与验收标准）。阶段必须给 days:[起,止] 天区间且不重叠不留缝；planStart 必填。任务标识由系统分配或沿用（永不变、删除的编号不复用）。selfCheck 每题必须挂 1 个能力项编号且不得含答案。',
  parameters: {
    type: 'object',
    properties: {
      planStart: { type: 'string', description: '第 1 天的日期，YYYY-MM-DD。用户开始执行的那天，不是今天。' },
      goal: { type: 'string', description: '90 天总目标，一句话。' },
      role: { type: 'string', description: '目标岗位；留空则沿用画像里的。' },
      route: { type: 'string', description: '路线名；留空则沿用画像里的。' },
      phases: {
        type: 'array',
        description: '阶段数组，按天区间依次排列。',
        items: {
          type: 'object',
          additionalProperties: true,
          properties: {
            name: { type: 'string', description: '阶段名。' },
            days: { type: 'array', items: { type: 'integer' }, description: '[起, 止] 天区间，闭区间。' },
            goal: { type: 'string', description: '阶段目标。' },
            project: { type: 'string', description: '实战项目。' },
            criteria: { type: 'string', description: '考核标准（作品达标度维对照它逐条核）。' },
            tasks: {
              type: 'array',
              description: '排到天的任务（第一段必须有），每项 8 个字段缺一不可；只排到周的阶段留空数组。',
              // 字段**写进 schema**，而不是只写在工具说明那段散文里：说明里列了 8 个名字，
              // 但模型对其中写法最不明显的那个（dependsOn）真的会写错 —— 用户撞上过一次，
              // 13 个任务的前置依赖全填成了天号（"1"、"2"…）。名字写在散文里，写法得写在结构里。
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  day: { type: 'integer', description: '第几天，必须落在本阶段的 days 区间内。' },
                  action: { type: 'string', description: '一句话动作：做什么，不是学什么。' },
                  capability: { type: 'string', description: '挂的能力项编号，必须是当前方向能力模型里的编号；纯评估类任务写全角「—」。' },
                  reason: { type: 'string', description: '为什么是这个任务 —— 对着差距说。' },
                  minutes: { type: 'integer', description: '预计分钟，15-60；超过 60 就拆。' },
                  minimumVersion: { type: 'string', description: '最低完成版本：做不到全量时先交什么。' },
                  doneCriteria: { type: 'string', description: '完成标准：怎么算做完，可被他人核对。' },
                  acceptableEvidence: { type: 'string', description: '可接受证据：完整版交什么、最低版交什么。**写成产品收得下的形态** —— 一段文字 / 一张图（截图、白板照）/ 一个文件（csv、json、txt、md、zip、pdf，单个 ≤8MB）。别写"交一份 xlsx""交一份 PPT"这种收不到的形态；要交表格就写"导出 CSV"或"截图"。' },
                  dependsOn: { type: 'string', description: '前置依赖，写「阶段.序号」这个引用 —— 例如本阶段第 3 个任务写 1.3；没有依赖写「无」。**不是天号，也不是任务序号本身**。' },
                  id: { type: 'string', description: '已存在的任务标识（T 开头）。改已有任务时原样带上（措辞可以改，标识永不变）；新任务留空，由系统分配。' },
                  learn: {
                    type: 'object',
                    additionalProperties: true,
                    description: '这道题的学习资料（可选）{ method 怎么上手 / digest AI 汇总 / links [{title,url,source}] 最多 4 条 }。**第一段（排到天的那一段）每道题都要带上** —— 只给要求不给方法，做题的人第一步就卡住。没有可引用的来源就只写 method，不许编链接、不许写「待补」。',
                  },
                },
              },
            },
            weeks: { type: 'array', items: { type: 'object', additionalProperties: true }, description: '只排到周时的主题与验收标准。' },
          },
        },
      },
      selfCheck: {
        type: 'array',
        description: '考核自查题，每题挂一个能力项编号；**不得含答案**。',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', description: '题号，如 Q1。' },
            phase: { type: 'string', description: '属于哪个阶段。' },
            question: { type: 'string', description: '题目原文。' },
            capability: { type: 'string', description: '挂的能力项编号。' },
          },
        },
      },
      portfolio: { type: 'array', items: { type: 'object', additionalProperties: true }, description: '作品集清单。' },
      resources: { type: 'array', items: { type: 'object', additionalProperties: true }, description: '学习资源。' },
    },
  },
  output: { schema: { type: 'string' }, render: asText },
  async execute(args) {
    const state = readAll()
    if (state.profile.targetRole === '') throw new Error('画像里还没有目标方向：先在页面上选定方向与路线，再生成计划')
    const plan = canonicalPlan(
      {
        ...args,
        role: args?.role ?? state.profile.targetRole,
        route: args?.route ?? state.profile.route,
      },
      state.plan.phases.length === 0 ? undefined : state.plan,
      // 能力模型本身，不是 slug：自定义方向用的是 Agent 生成的那份。
      resolveRole(state.profile),
    )
    const written = updatePlan(plan)
    return (summarisePlan(written, state.plan))
  },
  presentCall: card('Write growth plan'),
}

/**
 * `growth_save_profile` — update the 画像.
 *
 * Confirmed facts are append-only, and a model inference belongs in `pending`
 * until the user confirms it. That separation is enforced here rather than
 * trusted, because an unconfirmed guess written as fact is indistinguishable
 * from a real one on the next read.
 */
export const growthSaveProfile = {
  name: 'growth_save_profile',
  description: '更新成长画像（目标方向、路线、时间投入、截止、约束、当前状态的追问答案、底盘、推测）。background 是 ② 的追问问答（专业/年级/当前岗位/行业/收入来源/已经在交付的东西/技能），**原样保留用户的措辞**，不要概括。verifiedFacts 只追加不覆盖：写进去的必须是用户在对话里明确确认过的。模型对用户的推测（性格、能力、偏好）一律写进 pending，**不得写进 verifiedFacts 或正文结论**；用户确认后才由下一次调用移过去。',
  parameters: {
    type: 'object',
    properties: {
      currentRole: { type: 'string', description: '当前身份（在职同方向 / 在职想转行 / 在校应届 / 自由副业）。' },
      targetRole: { type: 'string', description: '目标方向名。' },
      targetRoleSlug: { type: 'string', description: '方向 slug：必须是页面目录里的一个，或 custom。' },
      targetRoleStatus: { type: 'string', enum: ['preset', 'generated', 'building'], description: '方向的质量档。' },
      positioning: { type: 'string', description: '方向的一句话定位。' },
      route: { type: 'string', description: '路线名。' },
      timePerDay: { type: 'string', description: '每天可投入时长。' },
      deadline: { type: 'string', description: '截止日期 YYYY-MM-DD。' },
      constraints: { type: 'array', items: { type: 'string' }, description: '约束清单（覆盖写）。' },
      background: {
        type: 'object',
        additionalProperties: true,
        description: '② 的追问问答，键名按当前状态取：在校→major/grade；在职同方向→currentJob/years/scope；在职想转行→currentJob/industry/years/scope；自由→income/dollars/strengths。只提交要改的键，其余保留。',
      },
      verifiedFacts: { type: 'array', items: { type: 'string' }, description: '**用户确认过**的底盘/事实，只追加。' },
      pending: { type: 'array', items: { type: 'string' }, description: '模型推测，待用户确认，只追加。' },
    },
  },
  output: { schema: { type: 'string' }, render: asText },
  async execute(args) {
    const allowed = ['currentRole', 'targetRole', 'targetRoleSlug', 'targetRoleStatus', 'positioning', 'route', 'timePerDay', 'deadline', 'constraints', 'background', 'verifiedFacts', 'pending']
    const patch = {}
    for (const key of allowed) {
      if (args?.[key] !== undefined) patch[key] = args[key]
    }
    if (Object.keys(patch).length === 0) throw new Error(`growth_save_profile: 至少要给一个字段（可用：${allowed.join(' / ')}）`)
    const profile = updateProfile(patch)
    const background = backgroundLines(profile)
    return ([
      '画像已更新。',
      `- 目标方向：${profile.targetRole || '—'}（${profile.targetRoleStatus || '—'}）　路线：${profile.route || '—'}`,
      background.length > 0 ? `- 当前状态的追问：${background.join('；')}` : '- ⚠️ 当前状态的追问还没答 —— 底盘与能力模型都要从它推',
      `- 已确认的底盘：${(profile.verifiedFacts ?? []).length} 条　待确认的推测：${(profile.pending ?? []).length} 条`,
      (profile.pending ?? []).length > 0 ? '（推测还留在 pending；用户确认后才能移进 verifiedFacts）' : '',
    ].filter(Boolean).join('\n'))
  },
  presentCall: card('Update growth profile'),
}

/**
 * `growth_propose_transferable` — propose the 可迁移底盘 from the user's own background.
 *
 * The proposal is derived from what the user typed and lands as a **pending list
 * the user checks off**, one item at a time. That is deliberate: a fixed table of
 * translations cannot cover a direction it has never seen, and letting the model
 * write straight into the user's own profile would put an inference where a
 * confirmed fact belongs. Neither is acceptable, so the user decides each line.
 *
 * The same call also carries the **other** half of the honest answer: what this
 * direction needs that the user's experience does *not* substitute for. That list
 * used to be hardcoded, which made it wrong for everyone it was not written for —
 * 在校生 and 自由职业者 do not recognise a QA engineer's lessons. Deriving it from
 * the follow-ups is the same move the 底盘 table already went through.
 */
export const growthProposeTransferable = {
  name: 'growth_propose_transferable',
  description: '基于用户当前状态的追问答案（岗位 / 专业 / 年级 / 在交付的东西 / 技能），给出**他本人确实做过**的可迁移底子候选，落成待确认清单；用户在页面上逐条勾选后才进 verifiedFacts。先调 growth_context scope=profile 拿背景。三条硬要求：①**不许复述用户自己说过的话** —— 「你做过与产品沟通需求」只是把用户的原话改写了一遍，用户自己早就说过了；要把动作**抽象一层**，说出它体现的判断力或方法，例如用户说「与产品沟通需求、与UI沟通页面设计」，候选应当是「能把模糊需求问成可开发的条件」。②**必须能对上目标岗位的工作** —— 迁移不到目标岗位的，只是旧岗位的任务清单，不是底子。③**每条都要能被回答"我做过/没做过"** —— 禁止"学习能力强""沟通能力强"这类无法确认的概括；抽象一层但仍是可确认的动作才对。名字守同一条线：名字是**能力的名字**，不是**任务的缩写** —— 任务是「做页面 / 聊需求 / 排线上」，能力是「拆需求 / 定归属 / 复现」。不要提 user 已经否掉过的（scope=profile 里有）。**同时**给 notTransferable：这个方向要、但他的经历替代不了的部分（3-6 条，一句话一条）—— 只讲"你的经验都能用"是骗人的。',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: '3-8 条候选，每条一个具体动作。',
        notTransferable: {
          type: 'array',
          description: '3-6 条「这个方向要、但他的经历替代不了」的部分，每条一句话。',
          items: { type: 'string' },
        },
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', description: '一个字到四个字的名字，做成一列的标题（例：怀疑 / 复现 / 谈客户 / 拆需求）。' },
            text: { type: 'string', description: '一句话说清这个底子是什么，用户读它能判断"我确实做过"。' },
          },
        },
      },
    },
  },
  output: { schema: { type: 'string' }, render: asText },
  async execute(args) {
    const state = readAll()
    const questions = backgroundQuestionsFor(state.profile.intake)
    if (questions === undefined) throw new Error('用户还没答 ② 的第一题（当前状态），追问定不下来 —— 先让用户答完')
    const lines = backgroundLines(state.profile)
    const items = canonicalTransferable(args?.items, lines)
    const stored = setTransferableSuggestions(items)
    // 两半一起落：可迁移的候选 + 经历替代不了的部分。后者只用于如实说明，不进任何打分。
    const gaps = canonicalNotTransferable(args?.notTransferable)
    if (args?.notTransferable !== undefined) updateProfile({ notTransferable: gaps })
    return ([
      `已生成 ${String(stored.length)} 条待确认的底子：`,
      ...stored.map((item, index) => `${String(index + 1)}. ${item.name} —— ${item.text}`),
      '',
      `依据的用户背景：${lines.join('；')}`,
      '',
      `经历替代不了的部分（${String(gaps.length)} 条，页面会单独列出来）：`,
      ...(gaps.length > 0 ? gaps.map((text) => `- ${text}`) : ['—']),
      '',
      '页面「画像 → ④ 可迁移底盘」会显示成勾选框。用户勾中的进 verifiedFacts（此后可以在计划与考核里当"我本来就会的"用），否掉的不再被提议。',
      '⚠️ 这一步只说明"你有可迁移的底子"，不是"你已经会了"的证据 —— 具体掌握程度由自评决定。',
      '自查一遍：哪一条的正文用用户自己的原话就能表达？那一条只是复述，应当重写成体现判断力的说法。',
    ].join('\n'))
  },
  presentCall: card('Propose transferable base'),
}

/**
 * `growth_propose_capability_model` — build a capability model for a direction
 * that has none, so the self-assessment and the gap can land item by item.
 *
 * The user asked for this: use the shipped 数据运营 model as the structural
 * template and fill it in for another direction. What that buys is real — without
 * a model there are no per-item anchors, so no weighted gap, no per-question
 * anchoring in a review, and no comparable curve.
 *
 * What it does **not** buy is calibration. The model is stamped
 * `provenance: 'generated'` and the page says the anchors were not
 * industry-checked. That distinction has to survive, because the alternative —
 * letting a generated model pass for a preset one — would make every score
 * derived from it look authoritative when it is not.
 */
export const growthProposeCapabilityModel = {
  name: 'growth_propose_capability_model',
  description: `为一个**还没有能力模型**的方向生成能力模型，让自评与加权缺口能逐项落点。先调 growth_context scope=model 拿结构模板（预置的数据运营模型），照它的结构填新方向的内容。${MODEL_TEMPLATE_NOTE}。锚点必须是 1/3/5 三个真实刻度：3 分是"岗位达标线：能照现成规范独立做出合格产出"，5 分是"没有现成可照，自己定标准、自己下判断"。**不得写"待补""…"这类占位** —— 写不出 5 分锚点说明这一项还没定义，那就别放进来。生成结果会标记为 generated（未经行业校准），页面上会如实说明。用户已有的方向如果已经有模型，不要覆盖。`,
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '方向名，与画像里的目标方向一致。' },
      positioning: { type: 'string', description: '这个方向的一句话定位：它交付什么、与相邻岗位的区别。' },
      groups: {
        type: 'array',
        description: '2-5 个能力组，权重合计必须 100%、每组 > 0%。',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            key: { type: 'string', description: '组编号，如 A / B / C。' },
            name: { type: 'string', description: '组名，如「指标与口径」。' },
            weight: { type: 'integer', description: '组权重百分比。' },
          },
        },
      },
      items: {
        type: 'array',
        description: '8-40 个能力项。',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', description: '能力项编号，如 A1。' },
            group: { type: 'string', description: '所属组的 key。' },
            name: { type: 'string', description: '能力项名。' },
            level: { type: 'string', enum: ['高', '中', '低'], description: '组内权重。' },
            anchors: { type: 'array', items: { type: 'string' }, description: '正好 3 条：1 分 / 3 分 / 5 分锚点原文。' },
          },
        },
      },
    },
  },
  output: { schema: { type: 'string' }, render: asText },
  async execute(args) {
    const state = readAll()
    if (state.profile.targetRole === '') throw new Error('画像里还没有目标方向 —— 先让用户在页面上选定，再生成模型')
    const current = resolveRole(state.profile)
    if (current !== undefined && resolveRoleStatus(state.profile) === 'preset') {
      throw new Error(`${state.profile.targetRole} 已经有随版本发布的预置能力模型（${String(current.items.length)} 项）—— 不要用生成的模型覆盖它`)
    }
    const lines = backgroundLines(state.profile)
    const model = canonicalCapabilityModel(args, {
      forSlug: state.profile.targetRoleSlug,
      forName: state.profile.targetRole,
      basedOn: lines,
    })
    updateProfile({ capabilityModel: model })
    const high = highWeightItems(model)
    return ([
      `能力模型已生成并写入画像：${model.name}（${String(model.groups.length)} 组 / ${String(model.items.length)} 项）。`,
      `- 组权重：${model.groups.map((group) => `${group.key} ${group.name} ${String(group.weight)}%`).join('　')}`,
      `- 高权重项（${String(high.length)} 项）：${high.map((item) => item.id).join('、')}`,
      `- 依据的用户背景：${lines.join('；') || '未记录'}`,
      '',
      `页面「画像 → ⑤ 能力自评」现在可以逐项打分了，每项会带上你写的 1/3/5 锚点。`,
      `⚠️ 这份模型标记为 **generated**：结构按预置模板校验过，但锚点**未经行业校准**，页面上会如实说明。`,
      `若用户换方向，它会自动失效（不会拿旧方向的模型给新方向打分）。`,
    ].join('\n'))
  },
  presentCall: card('Propose capability model'),
}

/**
 * `growth_save_assessment` — append one review round.
 *
 * This is the write that closes the loop: the round lands in the append-only
 * history, its curve points become the trend, and the report tells the panel what
 * changed. It is the write that makes the trend real: without a round landing
 * here, the curve has nothing to plot and the review has no history.
 */
export const growthSaveAssessment = {
  name: 'growth_save_assessment',
  description: '**考核的收尾动作**：问完 2-3 道自查题、拿到用户回答之后必须调用本工具落盘 —— 考核内容只有在写进这一轮之后才会出现在页面上；只在对话里问完不算考过，页面会一直是空的。逐题记录、四维依据、下一场考核日期都写进 report。**考核分两档，coverage 必须跟本次相符**：节点小考只重测当前节点相关的几项 → `定向`（它的曲线点不画线，部分重测不能和全量比）；阶段大考评到完整的高权重项集 → `全量`。页面交卷时会说明本次是哪一档，照它填。写入一次考核结果（四维各 0-25：完成率 / 证据质量 / 作品达标度 / 知识考核）。写之前先用 growth_context 读 scope=progress 与 scope=plan，按 rubric 逐维给依据。数据缺失的维度必须放进 unsubmitted 标「未提交」按 0 计，**不要把 0 分和真的得 0 分混为一谈**；完成率与证据质量必须分开报，不得合成一个「真实完成率」。调整建议必须动到任务（换最低完成版本 / 改预计分钟 / 明确可接受证据），只给鼓励不算调整；并把下一场考核日期写进调整项。',
  parameters: {
    type: 'object',
    properties: {
      scores: {
        type: 'object',
        description: '四维得分，键名固定为这四个，各 0-25 的整数。',
        additionalProperties: true,
        properties: {
          完成率: { type: 'integer', description: '按整个计划口径的完成率打分。' },
          证据质量: { type: 'integer', description: '按证据档位分布打分：自述 < 过程 < 成果。' },
          作品达标度: { type: 'integer', description: '对照该阶段「实战项目 + 考核标准」逐条核。' },
          知识考核: { type: 'integer', description: '按抽到的 2-3 题逐题落点。' },
        },
      },
      day: { type: 'integer', description: '计划内第几天。' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'], description: '这次读数有多硬。' },
      coverage: { type: 'string', enum: ['全量', '定向'], description: '全量=评到的项包含完整高权重项集（快速自评算全量）；定向=只重测部分项，其曲线点不画线。' },
      unsubmitted: { type: 'array', items: { type: 'string' }, description: '因缺数据按 0 计的维度名。' },
      attribution: { type: 'string', description: '任务粒度适配度归因：计划问题 / 能力问题 / 动力问题 / 方向问题。' },
      adjustments: { type: 'array', items: { type: 'object', additionalProperties: true }, description: '接下来 7 天的调整版任务，每条含 任务标识 / 一句话动作 / 最低完成版本 / 改了什么为什么。' },
      report: { type: 'string', description: '考核报告正文（可含四维依据、逐题记录、下一场考核日期）。' },
      curvePoints: { type: 'array', items: { type: 'object', additionalProperties: true }, description: '本轮逐项曲线点：{能力项, 分, 置信度, 证据档位, 来源}。' },
    },
  },
  output: { schema: { type: 'string' }, render: asText },
  async execute(args) {
    const state = readAll()
    if (state.plan.phases.length === 0) throw new Error('还没有计划，无法考核：先生成计划')
    const round = canonicalReview(args)
    const date = today()
    const entry = {
      date,
      day: round.day,
      kind: 'review',
      ...round,
      grade: gradeOf(round.total).grade,
      gradeAction: gradeOf(round.total).action,
      sources: ['页面'],
    }
    appendAssessment(entry)
    const low = Object.entries(round.scores).sort((left, right) => left[1] - right[1])[0]
    const rule = round.scores.完成率 < 15 ? IRON_RULES[0] : ''
    const row = FEEDBACK_ROWS.find((item) => item.dimension === low[0])
    return ([
      `考核已记入历史：${date}（第 ${String(round.day)} 天）`,
      `- 四维：${Object.entries(round.scores).map(([key, value]) => `${key} ${String(value)}`).join(' / ')}　总分 ${String(round.total)}（${gradeOf(round.total).grade}）`,
      `- 定级动作：${gradeOf(round.total).action}`,
      `- 最低的一维：${low[0]}（${String(low[1])}）→ 下一轮重点看：${row === undefined ? '—' : `${row.says} → ${row.mechanism}`}`,
      rule.length > 0 ? `- 触发铁律：${rule}` : '',
      round.unsubmitted.length > 0 ? `- 未提交（按 0 计）：${round.unsubmitted.join('、')} —— 补上对应数据可重评这几维` : '',
      round.attribution.length > 0 ? `- 归因：${round.attribution}（只有「计划问题」允许改任务定义）` : '',
      `- 覆盖项集：${round.coverage}${round.coverage === '定向' ? '（本轮曲线点不画线）' : ''}`,
      round.adjustments.length > 0 ? `- 调整版任务：${String(round.adjustments.length)} 条` : '- ⚠️ 没有给调整版任务 —— 只给鼓励不算调整',
      `- 可用的归因：${ATTRIBUTIONS.map((item) => item.name).join(' / ')}`,
      '',
      '面板刷新即可看到趋势与这次的四维得分。',
    ].filter(Boolean).join('\n'))
  },
  presentCall: card('Record growth review'),
}

/** Every tool this plugin registers, in registration order. */
/**
 * `growth_save_learning` — 给**一道**任务补学习资料。
 *
 * 这是个写入工具，所以它走同一道门禁：链接必须是真地址、不许占位、最多 4 条。它只改一道题
 * （`store.updateTask`），不要求调用方重发整份计划 —— 那样才不会顺手把别的任务改坏。
 *
 * 最要紧的一条写进了说明里：**只写你真的检索到并读过的东西**。模型编出来的链接比没有更糟，
 * 所以宁可只给一句方法，也不许凑数。
 */
export const growthSaveLearning = {
  name: 'growth_save_learning',
  description: `给**一道**任务补学习资料：怎么上手（method）、资料汇总（digest）、来源链接（links，最多 4 条）。用户会在任务卡上看到它，所以三样都写人话。**只写你真的检索到并读过的东西** —— 链接打不开比没有更糟：没搜到就如实说没有可引用的来源，不许写「待补」这类占位，也不许凭记忆编 URL。**检索不可用时别就此收工**：先试 web_search，如果它报错（密钥无效、超时）或没有结果，改成**直接抓你确知的官方文档**（如 platform.openai.com/docs、docs.anthropic.com、huggingface.co/docs），抓到什么写什么。写回时说清这份汇总的来源形态：有链接就给链接；一条来源都没抓到，就只写 method/digest 并在 digest 里点明「这是通识，不是查到的」。digest 是给做题的人看的**汇总**（这道题要掌握的要点、常见的坑），不是资料清单的复述。只改这一道题，计划的其他部分一个字不动。`,
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: '任务标识，如 T5（任务卡上那枚签）。' },
      method: { type: 'string', description: '怎么上手：一句话，具体到"先做什么、再做什么"。' },
      digest: { type: 'string', description: 'AI 汇总：要掌握的要点与常见坑，来自这次读到的来源。' },
      links: {
        type: 'array',
        description: '来源链接，最多 4 条。每条 { title, url, source }；url 必须是 http(s):// 开头的真实地址。',
        items: { type: 'object', additionalProperties: true },
      },
    },
    required: ['taskId'],
  },
  output: { schema: { type: 'string' }, render: asText },
  async execute(args) {
    const state = readAll()
    const task = planTasks(state.plan).find((entry) => entry.id === args?.taskId)
    if (task === undefined) {
      throw new Error(`计划里没有 ${String(args?.taskId ?? '')} 这个任务 —— 先调 growth_context scope=plan 看一遍任务标识`)
    }
    // 什么都没给的时候，先说清"要给哪几样"，而不是让门禁去说一句更抽象的话。
    const hasMethod = String(args?.method ?? '').trim().length > 0
    const hasDigest = String(args?.digest ?? '').trim().length > 0
    const hasLinks = Array.isArray(args?.links) && args.links.length > 0
    if (!hasMethod && !hasDigest && !hasLinks) {
      throw new Error('至少要给一样：method（怎么上手）或 digest（汇总）或 links（来源）')
    }
    const learn = canonicalLearning(
      { method: args?.method, digest: args?.digest, links: args?.links },
      `任务 ${task.id}`,
    )
    if (learn === undefined) throw new Error('至少要给一样：method（怎么上手）或 digest（汇总）或 links（来源）')
    updateTask(task.id, { learn })
    return ([
      `${task.id} 的学习资料已写入。`,
      `- 怎么上手：${learn.method || '（没给）'}`,
      `- 汇总：${learn.digest.length > 0 ? `${String(learn.digest.length)} 字` : '（没给）'}`,
      `- 来源：${learn.links.length === 0 ? '（没有可引用的来源 —— 这没关系，别编）' : learn.links.map((link) => link.url).join('　')}`,
      `用户现在能在「今日」页那道题下面看到它。`,
    ].join('\n'))
  },
  presentCall: card('Write task learning'),
}

export const TOOLS = [
  growthContext,
  growthSavePlan,
  growthSaveProfile,
  growthSaveAssessment,
  growthProposeTransferable,
  growthProposeCapabilityModel,
  growthSaveLearning,
]

/** Re-exported so the page's own self-assessment route shares one code path. */
export { dateOfDay }
