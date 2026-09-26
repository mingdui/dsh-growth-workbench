/**
 * `dsh-growth-workbench` — validation for the plan write path.
 *
 * The original skills state these rules in prose and rely on the generator to
 * follow them. Here they are executable, because every one of them has a failure
 * mode that is impossible to see from the outside:
 *
 *  - a missing `任务标识` degrades the panel's storage key to a *position*, and the
 *    user's check-ins silently re-map onto other tasks;
 *  - a missing `planStart` makes "第 N 天" fall back to "the day the page first
 *    opened", so a plan generated on the 25th and opened on the 28th is off by
 *    three days everywhere — day number, week, and current phase;
 *  - a missing phase `days` interval makes the current phase stick on phase 1 from
 *    day 31 onward;
 *  - a task with a missing 任务合同 field is a task that was never broken down.
 *
 * None of those throw on their own; they just produce wrong numbers. So the write
 * path refuses them instead.
 *
 * @module dsh-growth-workbench/validate
 */
import { LEVEL_COEF, capabilityModelProblems, planTasks } from './model.mjs'

/** 任务合同 8 字段—— 缺任何一个，任务就是"没拆够"。 */
export const TASK_FIELDS = [
  { key: 'action', label: '一句话动作' },
  { key: 'capability', label: '能力项' },
  { key: 'reason', label: '任务理由' },
  { key: 'minutes', label: '预计分钟' },
  { key: 'minimumVersion', label: '最低完成版本' },
  { key: 'doneCriteria', label: '完成标准' },
  { key: 'acceptableEvidence', label: '可接受证据' },
  { key: 'dependsOn', label: '前置依赖' },
]

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const TASK_ID = /^T\d+$/
/** 任务引用格式 `<阶段>.<序号>`，给人读、会移位。 */
const TASK_REF = /^\d+\.\d+$/

/** Turn one complaint into a refusal the caller can act on. */
function fail(problems) {
  if (problems.length === 0) return
  throw new Error(`计划未通过校验，共 ${String(problems.length)} 处：\n- ${problems.join('\n- ')}`)
}

/**
 * Validate a plan and assign the stable identifiers.
 *
 * Identifiers are **never reused**: a new task takes `max(seen) + 1`, not the
 * number of its position, so删掉的任务的标识作废（否则会连旧记录一起继承过来）。
 * An identifier the caller supplies is kept only when it is well-formed, unique,
 * and not already owned by a task that is still present.
 *
 * @param input - the plan the agent produced.
 * @param existing - the plan currently on disk, if any (its ids are reserved).
 * @param role - the capability model in force, for 能力项 validation. **The model
 *   itself, not a slug**: a direction may be scored against a model the agent
 *   generated for it, and looking the slug up in the shipped table would silently
 *   accept a plan whose 能力项 do not exist.
 * @returns the canonical plan, ready to write.
 */
export function canonicalPlan(input, existing = undefined, role = undefined) {
  const problems = []
  const value = input ?? {}

  // ---- 计划级字段 ----
  if (typeof value.planStart !== 'string' || !ISO_DATE.test(value.planStart)) {
    problems.push('planStart 必填，且必须是 YYYY-MM-DD —— 它是「第 1 天」的主路径，漏了面板只能拿"首次打开日"当第 1 天')
  }
  if (typeof value.goal !== 'string' || value.goal.trim().length === 0) problems.push('goal（总目标）不得为空')

  const phases = Array.isArray(value.phases) ? value.phases : []
  if (phases.length === 0) problems.push('phases 至少要有一个阶段')
  if (phases.length > 8) problems.push(`阶段最多 8 个，收到 ${String(phases.length)} 个`)

  // ---- 阶段天区间：不重叠、不留缝（§7.3.2）----
  let expectedStart = 1
  const seenDays = []
  phases.forEach((phase, index) => {
    const label = `阶段${String(index + 1)}${typeof phase?.name === 'string' ? `（${phase.name}）` : ''}`
    if (typeof phase?.name !== 'string' || phase.name.trim().length === 0) problems.push(`${label}: name 不得为空`)
    const [from, to] = Array.isArray(phase?.days) ? phase.days : []
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
      problems.push(`${label}: days 必须是 [起, 止] 两个正整数（收到 ${JSON.stringify(phase?.days)}）—— 少了它，「当前阶段」从第 31 天起会永久报成阶段 1`)
      return
    }
    if (from !== expectedStart) {
      problems.push(`${label}: 天区间必须从第 ${String(expectedStart)} 天接上（收到 ${String(from)}）—— 阶段区间要不重叠、不留缝`)
    }
    expectedStart = to + 1
    seenDays.push([from, to])
    if (typeof phase.goal !== 'string' || phase.goal.trim().length === 0) problems.push(`${label}: 阶段目标（goal）不得为空`)
    if (phase.tasks !== undefined && !Array.isArray(phase.tasks)) problems.push(`${label}: tasks 必须是数组（只排到周的阶段可以是空数组）`)
  })

  // ---- 能力项归属 ----
  const validCapabilities = role === undefined || role === null ? null : new Set(role.items.map((item) => item.id))
  // 没有模型时不能只跳过校验：那样计划可以挂任意编号，而面板与考核都按编号落点。
  if (validCapabilities === null) {
    problems.push('当前方向还没有能力模型，任务的 `能力项` 无法校验 —— 先让 AI 建这个方向的能力模型，再生成计划')
  }

  // ---- 任务标识分配 ----
  const reserved = new Set(planTasks(existing ?? { phases: [] }).map((task) => task.id))
  const highestOnDisk = [...reserved].reduce((max, id) => Math.max(max, Number(id.slice(1))), 0)
  // 「下一个可用编号」：磁盘上记过的，否则磁盘最大值 + 1。低于它的号段已经退休。
  const previousNext = Number.isInteger(existing?.nextTaskNumber) && existing.nextTaskNumber > 0
    ? existing.nextTaskNumber
    : highestOnDisk + 1
  let nextNumber = Math.max(highestOnDisk + 1, previousNext)
  const used = new Set()
  const refs = new Set()

  const canonicalPhases = phases.map((phase, phaseIndex) => {
    const [from, to] = Array.isArray(phase?.days) ? phase.days : [0, 0]
    const tasks = Array.isArray(phase?.tasks) ? phase.tasks : []
    const tasksOut = tasks.map((task, taskIndex) => {
      const label = `阶段${String(phaseIndex + 1)} 第 ${String(taskIndex + 1)} 个任务`
      const ref = `${String(phaseIndex + 1)}.${String(taskIndex + 1)}`
      refs.add(ref)

      for (const field of TASK_FIELDS) {
        const raw = task?.[field.key]
        if (field.key === 'minutes') continue
        if (raw === undefined || raw === null || String(raw).trim().length === 0) {
          problems.push(`${label}: ${field.label} 缺失 —— 8 个字段缺任何一个，这个任务就是「没拆够」`)
        }
      }

      const minutes = Number(task?.minutes)
      if (!Number.isInteger(minutes)) problems.push(`${label}: 预计分钟必须是整数`)
      else if (minutes > 60) problems.push(`${label}: 预计分钟 ${String(minutes)} > 60 —— 超过 60 分钟必须拆任务`)
      else if (minutes < 15) problems.push(`${label}: 预计分钟 ${String(minutes)} < 15 —— 低于 15 分钟必须与相邻任务合并，或说明为什么值得单列`)

      const capability = String(task?.capability ?? '').trim()
      if (capability !== '—' && validCapabilities !== null && !validCapabilities.has(capability)) {
        problems.push(`${label}: 能力项 ${JSON.stringify(capability)} 不在当前方向的能力模型里（评估类任务写全角破折号 —）`)
      }
      if (capability === '—' && String(task?.action ?? '').length > 0) {
        // ⚠️ 不是错误：评估类任务本来就该写 —。这里只做复核提示，不拦。
      }

      const day = task?.day
      if (day !== undefined && day !== null) {
        if (!Number.isInteger(day)) problems.push(`${label}: 天 必须是整数`)
        else if (day < from || day > to) problems.push(`${label}: 天 ${String(day)} 不在本阶段区间 [${String(from)}, ${String(to)}] 内`)
      }

      const dependsOn = String(task?.dependsOn ?? '').trim()
      if (dependsOn !== '无' && !TASK_REF.test(dependsOn)) {
        problems.push(`${label}: 前置依赖必须是任务引用（如 2.3）或字面量「无」，收到 ${JSON.stringify(dependsOn)}`)
      }

      // 标识：调用方给的就留（前提是合法、本次未占用，且磁盘上确实还有这个任务 ——
      // 改措辞不算换任务）；否则现分配。落在「已退休」号段上的编号说明它是被删过的，
      // 复用会把旧记录一起继承过来，所以直接拒绝。
      let id = typeof task?.id === 'string' && TASK_ID.test(task.id) ? task.id : ''
      if (id.length > 0 && used.has(id)) {
        problems.push(`${label}: 任务标识 ${id} 在本次写入里出现了两次 —— 标识必须全计划唯一`)
        id = ''
      }
      if (id.length > 0 && !reserved.has(id)) {
        if (Number(id.slice(1)) < previousNext) {
          problems.push(`${label}: 任务标识 ${id} 已被删除并作废 —— 新任务必须取当前最大编号 + 1（下一个是 T${String(nextNumber)}）`)
          id = ''
        }
      }
      if (id.length === 0) {
        id = `T${String(nextNumber)}`
        nextNumber += 1
      }
      used.add(id)

      return {
        id,
        ref,
        day: day ?? null,
        action: String(task?.action ?? '').trim(),
        capability,
        reason: String(task?.reason ?? '').trim(),
        minutes,
        minimumVersion: String(task?.minimumVersion ?? '').trim(),
        doneCriteria: String(task?.doneCriteria ?? '').trim(),
        acceptableEvidence: String(task?.acceptableEvidence ?? '').trim(),
        dependsOn,
        phase: String(phase?.name ?? '').trim(),
      }
    })

    return {
      name: String(phase?.name ?? '').trim(),
      days: [from, to],
      goal: String(phase?.goal ?? '').trim(),
      project: String(phase?.project ?? '').trim(),
      criteria: String(phase?.criteria ?? '').trim(),
      tasks: tasksOut,
      weeks: Array.isArray(phase?.weeks) ? phase.weeks : [],
    }
  })

  // ---- 前置依赖必须指到真实任务（引用在本次写入后才会固定）----
  for (const task of canonicalPhases.flatMap((phase) => phase.tasks)) {
    if (task.dependsOn !== '无' && !refs.has(task.dependsOn)) {
      problems.push(`任务 ${task.id}: 前置依赖 ${task.dependsOn} 指向了不存在的任务引用`)
    }
  }

  // ---- 考核自查：每题挂 1 个能力项编号，删掉答案（§4.1）----
  const selfCheck = (Array.isArray(value.selfCheck) ? value.selfCheck : []).map((item, index) => {
    const label = `考核自查第 ${String(index + 1)} 题`
    if (typeof item?.question !== 'string' || item.question.trim().length === 0) problems.push(`${label}: question 不得为空`)
    const capability = String(item?.capability ?? '').trim()
    if (validCapabilities !== null && !validCapabilities.has(capability)) {
      problems.push(`${label}: 必须挂一个能力项编号（否则考核时无法逐题落点），收到 ${JSON.stringify(capability)}`)
    }
    if (item?.answer !== undefined) problems.push(`${label}: 计划里不得含答案 —— 题目和答案放一起等于直接剧透`)
    return { id: String(item?.id ?? `Q${String(index + 1)}`), phase: String(item?.phase ?? '').trim(), question: String(item?.question ?? '').trim(), capability }
  })

  fail(problems)

  return {
    planStart: value.planStart,
    role: String(value.role ?? '').trim(),
    route: String(value.route ?? '').trim(),
    goal: value.goal.trim(),
    phases: canonicalPhases,
    portfolio: Array.isArray(value.portfolio) ? value.portfolio : [],
    selfCheck,
    resources: Array.isArray(value.resources) ? value.resources : [],
    nextTaskNumber: nextNumber,
  }
}

/**
 * Validate one review round before it is appended.
 * Mirrors the four-dimension rubric — every dimension 0-25, and a
 * dimension that could not be scored is marked 未提交 rather than silently 0.
 */
export function canonicalReview(input) {
  const problems = []
  const value = input ?? {}
  const dimensions = ['完成率', '证据质量', '作品达标度', '知识考核']
  const scores = {}
  for (const dimension of dimensions) {
    const raw = value.scores?.[dimension]
    if (raw === undefined || raw === null) {
      problems.push(`四维得分缺 ${dimension}`)
      continue
    }
    const number = Number(raw)
    if (!Number.isFinite(number) || number < 0 || number > 25) {
      problems.push(`${dimension} 必须是 0-25 的整数，收到 ${JSON.stringify(raw)}`)
      continue
    }
    scores[dimension] = Math.round(number)
  }
  if (typeof value.day !== 'number' || !Number.isInteger(value.day) || value.day < 1) {
    problems.push('day 必须是 ≥ 1 的整数')
  }
  fail(problems)

  const total = Object.values(scores).reduce((sum, value) => sum + value, 0)
  const unsubmitted = Array.isArray(value.unsubmitted) ? value.unsubmitted.filter((name) => dimensions.includes(name)) : []
  return {
    scores,
    total,
    day: value.day,
    confidence: ['low', 'medium', 'high'].includes(value.confidence) ? value.confidence : 'medium',
    coverage: value.coverage === '定向' ? '定向' : '全量',
    unsubmitted,
    attribution: String(value.attribution ?? '').trim(),
    adjustments: Array.isArray(value.adjustments) ? value.adjustments : [],
    report: String(value.report ?? '').trim(),
    curvePoints: Array.isArray(value.curvePoints) ? value.curvePoints : [],
  }
}

// ---------------------------------------------------------------- 能力模型与底盘

/** 一条底子的两个部分都必须有内容：只有名字没有说明，用户没法判断"我到底做没做过"。 */
function canonicalSuggestion(item, index) {
  const problems = []
  const name = typeof item?.name === 'string' ? item.name.trim() : ''
  const text = typeof item?.text === 'string' ? item.text.trim() : ''
  if (name.length === 0) problems.push(`第 ${String(index + 1)} 条：name 不得为空（一个字的名字，例：怀疑 / 复现 / 谈客户）`)
  if (name.length > 12) problems.push(`第 ${String(index + 1)} 条：name 太长（${String(name.length)} 字），它是一列的标题，控制在 12 字内`)
  if (text.length === 0) problems.push(`第 ${String(index + 1)} 条：text 不得为空 —— 用户要靠这句话判断"我确实做过这个"`)
  if (text.length > 80) problems.push(`第 ${String(index + 1)} 条：text 太长（${String(text.length)} 字），控制在 80 字内`)
  return { problems, value: { id: typeof item?.id === 'string' && item.id.trim().length > 0 ? item.id.trim() : `tf-${String(index + 1)}`, name, text } }
}

/**
 * Validate a 可迁移底盘 proposal.
 *
 * The bar is that every line must be **checkable by the user from their own
 * memory**: something they either did or did not do. A line like "学习能力强"
 * cannot be confirmed or denied, so it produces a `verifiedFact` that says
 * nothing — and `verifiedFacts` is what the plan is later justified against.
 *
 * @param input - `[{ name, text }]` as proposed.
 * @param backgroundLines - the user's own background answers, for the check that
 *   the proposal is actually derived from them.
 * @returns the canonical suggestion list.
 */
export function canonicalTransferable(input, backgroundLines = []) {
  const problems = []
  const items = Array.isArray(input) ? input : []
  if (items.length < 3) problems.push(`至少要提 3 条（收到 ${String(items.length)} 条）—— 少于 3 条说明背景信息不够，先回去补 ② 的追问`)
  if (items.length > 8) problems.push(`最多提 8 条（收到 ${String(items.length)} 条）—— 一次给太多，用户会失去逐条判断的耐心`)

  const values = items.map((item, index) => {
    const { problems: itemProblems, value } = canonicalSuggestion(item, index)
    problems.push(...itemProblems)
    return value
  })

  const seen = new Set()
  for (const item of values) {
    const key = `${item.name}：${item.text}`
    if (seen.has(key)) problems.push(`重复的底子：${key}`)
    seen.add(key)
    if (/^(学习能力强|沟通能力强|执行力强|有责任心|抗压能力强|擅长团队合作)$/.test(item.text)) {
      problems.push(`「${item.text}」不是一条可确认的底子 —— 用户没法回答"我做过没做过"，写进 verifiedFacts 等于什么都没说`)
    }
  }

  if (backgroundLines.length === 0) {
    problems.push('用户还没有答 ② 的追问（岗位 / 专业 / 技能），底盘必须从那里推，不能在空白上编')
  }

  fail(problems)
  return values
}

/**
 * Validate a generated capability model.
 *
 * The same structural rules as the shipped one — run in the offline checks
 * against `ROLES['data-ops']` too, so the two can never drift apart. A model
 * that violates them does not fail loudly later; it just makes every gap,
 * priority and curve point derived from it wrong.
 *
 * @param input - a model in the `ROLES` shape.
 * @param scope - `{ forSlug, forName, basedOn }` recorded alongside it.
 * @returns the canonical model, ready to store on the profile.
 */
/**
 * Validate the「经历替代不了」清单 before it replaces the stored one.
 *
 * Display-only honesty text: it never enters scoring, so the gate is only about
 * shape — trimmed, non-empty, deduped, capped. A blank line here would render as
 * an empty bullet, which reads as a bug rather than as a statement.
 */
export function canonicalNotTransferable(input) {
  const seen = new Set()
  const out = []
  for (const item of Array.isArray(input) ? input : []) {
    const text = typeof item === 'string' ? item.trim() : ''
    if (text.length === 0 || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out.slice(0, 8)
}

export function canonicalCapabilityModel(input, scope = {}) {
  const problems = capabilityModelProblems(input)
  if (typeof scope.forSlug !== 'string' || scope.forSlug.trim().length === 0) {
    problems.push('必须指名它为哪个方向生成（forSlug）—— 换了方向它就该失效，不能继续拿它给你打分')
  }
  fail(problems)

  const groups = input.groups.map((group) => ({ key: String(group.key).trim(), name: String(group.name).trim(), weight: group.weight }))
  const items = input.items.map((item) => ({
    id: String(item.id).trim(),
    group: String(item.group).trim(),
    name: String(item.name).trim(),
    level: item.level,
    anchors: item.anchors.map((anchor) => String(anchor).trim()),
  }))

  return {
    slug: String(scope.forSlug).trim(),
    forSlug: String(scope.forSlug).trim(),
    forName: String(scope.forName ?? input.name ?? '').trim(),
    name: String(input.name).trim(),
    positioning: String(input.positioning).trim(),
    status: 'draft',
    provenance: 'generated',
    basedOn: Array.isArray(scope.basedOn) ? scope.basedOn.map((line) => String(line).trim()).filter(Boolean) : [],
    generatedAt: new Date().toISOString(),
    groups,
    items,
  }
}

/**
 * The extension each generated group must carry a share of, expressed as the
 * same weight table the preset model uses — exported so the tool description and
 * the docs quote one source.
 */
export const MODEL_TEMPLATE_NOTE = '结构必须与预置模型同形：2-5 个组、权重合计 100%、每组 > 0%、8-40 个能力项、每项 3 条非占位锚点（1 / 3 / 5 三个真实刻度）；组内权重只取 高 / 中 / 低，系数是 ' + String(LEVEL_COEF.高) + ' / ' + String(LEVEL_COEF.中) + ' / ' + String(LEVEL_COEF.低)
