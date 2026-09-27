/**
 * `dsh-growth-workbench` — the JSON endpoint the page talks to.
 *
 * Kept apart from `./index.mjs` so the whole page contract can be exercised
 * without a Harness process: this module imports only the store and the model,
 * and exports one plain `(req, res)` handler.
 *
 * Routes, all under {@link API_PREFIX}:
 *
 *     GET  /state                       everything the page renders, computed once
 *     GET  /export                      四份文档合一份，供用户自己留存
 *     POST /intake                      方向（预置或自定义）+ 四个选择题 → 路线
 *     POST /background                  ② 的追问答案（专业 / 年级 / 岗位 / 行业 / 技能）
 *     POST /plan-start                  显式保存第 1 天
 *     POST /checkin                     { taskId, done?, evidence?, tier? }
 *     POST /transferable                { facts, dismissed }  底盘确认与否决
 *     POST /self-assessment             { scores: { A1: 3, … } }
 *     POST /assessment                  登记一次考核成绩（四维）
 *     POST /plan                        replace the plan document (used by the agent's write path)
 *     POST /capability-model            { discard: true }  丢弃 AI 生成的能力模型
 *     POST /reset                       { kind }  清空一份文档
 *
 * @module dsh-growth-workbench/api
 */
import {
  ATTRIBUTIONS,
  CUSTOM_SLUG,
  EVIDENCE_TIERS,
  FEEDBACK_ROWS,
  GRADE_BANDS,
  INTAKE_DEFAULTS,
  INTAKE_QUESTIONS,
  IRON_RULES,
  ROLE_CHOICES,
  ROLE_STATUS,
  ROUTES,
  RUBRIC,
  TRANSFERABLE_NOTE,
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
  selfPointConfidence,
  streakDays,
  windowTier,
  reviewWindow,
  weekRate,
} from './model.mjs'
import {
  KINDS,
  addEvidenceImage,
  appendAssessment,
  checkIn,
  clearDraft,
  dismissTransferable,
  effectiveToday,
  empty,
  read,
  readAll,
  readEvidenceImage,
  removeEvidenceImage,
  saveDraft,
  today,
  updatePlan,
  updateProfile,
  write,
} from './store.mjs'

/** Path prefix this plugin owns on the Harness web server. */
export const API_PREFIX = '/gw/api'

/** Largest accepted request body, so one caller cannot exhaust the process. */
const MAX_BODY_BYTES = 256 * 1024

/**
 * 图片单独一个上限：截图动辄几百 KB，而手机照片能到好几 MB。
 *
 * 只有 `POST /evidence-image` 用这个数，JSON 路由仍然是 256 KB —— 放宽的只是"字节流"
 * 这一条路，不是全部。
 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** 证据图片按扩展名回给浏览器的类型。扩展名是宿主生成的，白名单只有这四个。 */
const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

/** Write one binary response (evidence images, read straight back off disk). */
function sendBytes(res, status, type, bytes) {
  res.writeHead(status, {
    'content-type': type,
    'content-length': String(bytes.length),
    // 文件名里带时间戳、内容不会变，所以让浏览器缓存一天 —— 缩略图不必每次重新下载。
    'cache-control': 'private, max-age=86400',
  })
  res.end(bytes)
}

/**
 * Read a raw (non-JSON) body, refusing an oversized one before buffering it.
 *
 * 图片不走 JSON：浏览器把 `File` 直接当 body 发过来（`content-type: image/png`）。走
 * multipart 就得引一个解析器，而这个仓库没有 dependencies —— 所以这条路收的是裸字节。
 */
async function readRawBody(req, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) {
      throw new Error(`图片超过 ${String(Math.round(limit / 1024 / 1024))} MB —— 截图一般几百 KB，先压一下再传`)
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** Write one JSON response. */
function sendJson(res, status, payload) {
  const body = `${JSON.stringify(payload)}\n`
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/** Read and parse a JSON request body; refuses an oversized one before buffering it. */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('request body is not valid JSON')
  }
}

/** Narrow a parsed body to a plain object, so field reads never throw. */
function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/**
 * Everything the page renders, computed in one pass.
 *
 * One call instead of a dozen: the page's reads are all derived from the same
 * documents, and splitting them would let the panel render two halves of two
 * different moments.
 */
export function buildState() {
  const { profile, plan, progress, assessments } = readAll()
  // **两个时钟，分开**：
  //   · 进度天（`day`）—— "我在做第几天"。日历 + 提前的天数，见 effectiveToday。
  //     第几天、当前阶段、今日任务、周次、考核节奏、连续打卡，全都用它。
  //   · 日历（`today` / 计划日期）—— 真实的那一天。打卡日期记它，页面要显示日期时，
  //     显示的是**计划第 N 天对应的日期**（`planDate`，动态算、不落盘）。
  // 缝在一起的时候，提前模式下考卷刊头会印出一个还没到的日期 —— 那是同一件事两处口径。
  const date = effectiveToday(profile)
  const history = assessments.history ?? []
  const tasks = planTasks(plan)
  const day = dayNumber(plan.planStart, date)
  const phase = currentPhase(plan, day)
  const completion = completionRate(plan, progress)
  const evidence = evidenceDistribution(plan, progress)
  // 能力模型有两个来源，但下游只认这一个：自评、加权缺口、考核逐题落点全都用它。
  const role = resolveRole(profile)
  const scores = profile.selfAssessment?.scores ?? {}
  const analysis = role === undefined ? null : gapAnalysis(role, scores)
  const followUps = backgroundQuestionsFor(profile.intake)
  const missing = missingBackground(profile)
  const nextAction = nextActionFor({ profile, plan, role, followUps, missing, progress, history, day })
  const revision = [profile.updated, plan.updated, progress.updated, assessments.updated].filter(Boolean).sort().at(-1) ?? ''

  // 今日任务：排到今天的；今天没有排到时，退回到「接下来 3 个未完成」。
  const scheduled = tasks.filter((task) => task.day === day)
  const focus = scheduled.length > 0
    ? scheduled
    : tasks.filter((task) => progress.tasks?.[task.id]?.done !== true).slice(0, 3)

  return {
    ok: true,
    // `today` 是**真实**的那一天（打卡、审计、记录用它）。
    today: today(),
    // `planDate` 是"进度天对应的计划日期"，动态算、不落盘：页面要显示日期时用它 ——
    // 提前模式下它与 `today` 不同，而这两个数本来就回答不同的问题。
    planDate: day === null ? '' : dateOfDay(plan.planStart, day),
    revision,
    nextAction,
    profile,
    plan: { ...plan, tasks },
    progress,
    history,
    /** 考卷草稿（没交卷的答案）—— 页面按 `drafts[key]` 接着答。 */
    drafts: assessments.drafts ?? {},
    curve: curvePoints(history),
    metrics: {
      day,
      // 提前了几天（0 = 跟日历走）。页面靠它决定要不要在页头如实说两边：
      // 「你已经在做第 8 天（按日历今天是第 5 天）」。
      aheadDays: Number.isInteger(profile.aheadDays) ? profile.aheadDays : 0,
      phaseName: phase?.name ?? '',
      phaseIndex: phase === undefined ? -1 : plan.phases.indexOf(phase),
      phaseDays: phase?.days ?? [],
      completion,
      streak: streakDays(progress, day, plan.planStart),
      weekRate: weekRate(plan, progress, day),
      // 每周完成率，供「计划」页画执行趋势。只到本周为止 —— 未来周还没到，
      // 画上去就是一排 0%，那不是「执行得差」，是「还没到」。那一周没排到天的
      // 任务时是 null（不是 0），页面据此不画那根柱子。
      weekRates: Array.from(
        // Math.max 不是装饰：计划开始前 day 是负数（第 1 天还没到），那时一周都还没有。
        // 不夹住的话长度会是负数，碰巧也得到空数组 —— 但那是碰巧，不是意图。
        { length: day === null ? 0 : Math.max(0, Math.floor((day - 1) / 7) + 1) },
        (_, index) => ({ week: index + 1, rate: weekRate(plan, progress, index * 7 + 1) }),
      ),
      evidence,
      gap: analysis?.gap ?? null,
      gapWeight: analysis?.W ?? 0,
      priorities: analysis?.priorities ?? [],
      unansweredGroups: analysis?.unansweredGroups ?? [],
      // 定级只在四维都齐时给；只有完成率时不给总分，避免报一个假的体检结果。
      lastReview: history.filter((entry) => entry.kind === 'review').at(-1) ?? null,
    },
    /** 今日视图：排到今天的任务；今天没排到时退回「接下来的未完成」。 */
    focus: {
      day,
      scheduled: scheduled.length > 0,
      reason: scheduled.length > 0 ? 'scheduled' : (focus.length > 0 ? 'next-incomplete' : 'empty'),
      phase: phase?.name ?? '',
      tasks: focus,
    },
    catalog: {
      roles: ROLE_CHOICES,
      customSlug: CUSTOM_SLUG,
      activeRole: role ?? null,
      roleStatus: ROLE_STATUS,
      /**
       * 能力模型从哪来：`preset` 是随版本发布、自带模型的；`generated` 是 Agent 为本方向
       * 生成的。页面按这个标签决定说不说"锚点未经行业校准"。
       */
      activeRoleSource: resolveRoleStatus(profile),
      /** 当前状态对应的追问字段；没答 ② 时是 undefined。 */
      followUps: followUps ?? null,
      background: profile.background ?? {},
      missingBackground: missingBackground(profile),
      transferableNote: TRANSFERABLE_NOTE,
      questions: INTAKE_QUESTIONS,
      defaults: INTAKE_DEFAULTS,
      routes: ROUTES,
      tiers: EVIDENCE_TIERS,
      transferableGaps: profile.notTransferable ?? [],
      rubric: RUBRIC,
      gradeBands: GRADE_BANDS,
      attributions: ATTRIBUTIONS,
      feedbackRows: FEEDBACK_ROWS,
      ironRules: IRON_RULES,
      highWeightIds: role === undefined ? [] : highWeightItems(role).map((item) => item.id),
    },
  }
}

function nextActionFor({ profile, plan, role, followUps, missing, progress, history, day }) {
  if (!profile.targetRole) return { id: 'direction', label: '先定一个目标方向', reason: '没有目标方向，后面的计划无法个性化。', targetTab: 'profile', targetAnchor: 'direction', blockedBy: [] }
  if (profile.intake?.q1 === undefined || profile.intake?.q2 === undefined || profile.intake?.q3 === undefined || profile.intake?.q4 === undefined) return { id: 'intake', label: '完成 4 个快速选择题', reason: '用不到 1 分钟补齐当前状态与时间约束。', targetTab: 'profile', targetAnchor: 'intake', blockedBy: ['direction'] }
  if (followUps !== undefined && missing.length > 0) return { id: 'background', label: '补完你的当前状态', reason: `还差：${missing.join('、')}。AI 需要这些信息，才能给出靠谱的底盘与能力模型。`, targetTab: 'profile', targetAnchor: 'background', blockedBy: ['intake'] }
  if (!profile.route) return { id: 'route', label: '选一条成长路线', reason: '先决定节奏，计划才不会脱离你的现实。', targetTab: 'profile', targetAnchor: 'route', blockedBy: ['background'] }
  if ((profile.transferableSuggestions ?? []).length > 0 && (profile.verifiedFacts ?? []).length === 0) return { id: 'transferable', label: '确认你已经有的底子', reason: '先确认已有经验，避免把会的东西重新学一遍。', targetTab: 'profile', targetAnchor: 'transferable', blockedBy: ['route'] }
  if (role === undefined) return { id: 'capability-model', label: '让 AI 定制你的能力模型', reason: '有了能力模型，差距与计划才有统一的标尺。', targetTab: 'profile', targetAnchor: 'self', blockedBy: ['transferable'] }
  if (Object.keys(profile.selfAssessment?.scores ?? {}).length === 0) return { id: 'self-assessment', label: '做一次能力自评', reason: '用 1 / 3 / 5 锚点标出当前起点。', targetTab: 'profile', targetAnchor: 'self', blockedBy: ['capability-model'] }
  if (plan.phases.length === 0) return { id: 'plan', label: '定制我的 90 天计划', reason: '画像已经准备好，现在把它变成每天能执行的动作。', targetTab: 'plan', targetAnchor: 'plan-empty', blockedBy: ['self-assessment'] }
  const tasks = planTasks(plan)
  const incomplete = tasks.find((task) => progress.tasks?.[task.id]?.done !== true)
  const rounds = (history ?? []).filter((entry) => entry.kind === 'review')

  // 阶段大考：某个阶段已经走完（第几天超过它的最后一天），而那一阶段里没有一次全量考核。
  // 阶段走完却没考是有欠账的 —— 阶段的交割物换了，四维的口径要重算。
  const owedPhase = plan.phases.find((entry) => typeof day === 'number' && day > entry.days[1]
    && !rounds.some((round) => round.coverage === '全量' && round.day >= entry.days[0] && round.day <= entry.days[1]))
  if (owedPhase !== undefined) {
    return {
      id: 'review-phase',
      label: `阶段「${owedPhase.name}」该做一次大考`,
      reason: '这个阶段已经走完，但还没有一次全量考核 —— 交割物换了，四维口径要重算。',
      // 考卷的信息栏要显示「这次考的是哪个阶段」—— 而它往往**不是**当前阶段（大考针对的是
      // 已走完的那个）。规则只在这里判一次，页面直接用，别再自己算一遍。
      scope: `阶段${String(plan.phases.indexOf(owedPhase) + 1)}「${owedPhase.name}」`,
      targetTab: 'review',
      targetAnchor: 'review',
      blockedBy: [],
    }
  }

  if (incomplete) return { id: 'check-in', label: '完成今天的最小动作', reason: `先做 ${incomplete.id}：${incomplete.minimumVersion}`, targetTab: 'today', targetAnchor: `task-${incomplete.id}`, blockedBy: [] }

  // 节点小考：本周还没有任何一轮。排在「做任务」之后 —— 先干活，再交节点。
  if (typeof day === 'number' && day >= 1) {
    const week = Math.floor((day - 1) / 7) + 1
    const weekStart = (week - 1) * 7 + 1
    const examined = rounds.some((round) => typeof round.day === 'number' && round.day >= weekStart && round.day <= weekStart + 6)
    if (!examined) {
      return {
        id: 'review-node',
        label: `第 ${week} 周这个节点该考一次`,
        reason: '节点小考只重测这一周相关的几项，答 2-3 道就够。',
        scope: `节点 第 ${String(week)} 周`,
        targetTab: 'review',
        targetAnchor: 'review',
        blockedBy: [],
      }
    }
  }

  // 计划还没开始（第几天为负），或本周已考、任务也做完了 —— 没有下一步动作就不编一个出来。
  // 原先这里是无条件返回「发起一次阶段复盘」，而判据是「找不到未完成的任务」：一道任务都没有时
  // 同样找不到，于是空计划也会被告知「当前计划任务已完成」。
  return null
}

/**
 * Failures carry the operation's own message, so a blank task or an unknown id
 * reads as itself in the panel instead of as a generic failure.
 */
async function serve(res, operation) {
  try {
    sendJson(res, 200, { ok: true, ...(await operation()) })
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}

/** Save the intake answers plus the chosen direction — step ①②⑤ in one write. */
function saveIntake(body) {
  const roleSlug = typeof body.roleSlug === 'string' ? body.roleSlug : ''
  const choice = ROLE_CHOICES.find((entry) => entry.slug === roleSlug)
  const customName = typeof body.roleName === 'string' ? body.roleName.trim() : ''
  if (choice === undefined && customName.length === 0) throw new Error('请先选择一个目标方向，或自己填一个')
  if (customName.length > 40) throw new Error('自定义方向名不超过 40 个字')

  const intake = {}
  for (const question of INTAKE_QUESTIONS) {
    const answer = body.intake?.[question.key]
    intake[question.key] = question.options.some((option) => option.value === answer)
      ? answer
      : (INTAKE_DEFAULTS[question.key] ?? '')
  }
  const route = ROUTES.some((entry) => entry.name === body.route) ? body.route : ROUTES[0].name
  const targetRole = choice?.name ?? customName
  // 自己填的方向没有模型可依：按现在的档位词汇是 building（旧数据里可能存着 beta，
  // ROLE_STATUS 里留着那一档就是为了读得懂它们）。
  const status = choice?.status ?? 'building'
  const positioning = choice?.positioning ?? `你自定义的方向`

  // 当前状态换了，追问就换了一整套 —— 旧答案留着（切回去不用重填），但已生成的
  // 能力模型与底盘提议都属于上一个状态，留着只会误导：模型自带 forSlug 保证它
  // 对不上就失效，底盘提议则直接作废。
  const previous = read('profile')
  const stateChanged = previous.intake?.q1 !== undefined && previous.intake.q1 !== intake.q1
  const directionChanged = previous.targetRoleSlug !== '' && previous.targetRoleSlug !== (choice?.slug ?? CUSTOM_SLUG)

  const patch = {
    targetRole,
    targetRoleSlug: choice?.slug ?? CUSTOM_SLUG,
    currentRole: INTAKE_QUESTIONS[0].options.find((option) => option.value === intake.q1)?.label ?? '',
    targetRoleStatus: status,
    positioning,
    route,
    // Q1 的选项直接决定「在职 / 离职 / 在读」这类约束文案，所以两者一起落。
    intake,
    timePerDay: (INTAKE_QUESTIONS[1].options.find((option) => option.value === intake.q2)?.label ?? ''),
    deadline: deadlineFrom(intake.q4),
    constraints: constraintsFrom(intake),
  }
  if (body.background !== undefined) patch.background = body.background

  const profile = updateProfile(patch)
  if (stateChanged || directionChanged) {
    updateProfile({ transferableSuggestions: [] })
    return { ...read('profile'), resetProposals: stateChanged ? '当前状态变了，追问与底盘提议已作废' : '方向变了，底盘提议已作废' }
  }
  return profile
}

/** 保存 ② 的追问答案（专业 / 年级 / 岗位 / 行业 / 收入来源 / 技能）。 */
function saveBackground(body) {
  const profile = read('profile')
  if (profile.intake?.q1 === undefined) throw new Error('先答 ② 的第一题（当前状态），追问才定得下来')
  const questions = backgroundQuestionsFor(profile.intake)
  if (questions === undefined) throw new Error(`当前状态 ${JSON.stringify(profile.intake.q1)} 没有对应的追问`)
  const fields = new Map(questions.fields.map((field) => [field.key, field]))
  const patch = {}
  for (const [key, value] of Object.entries(record(body.background))) {
    const field = fields.get(key)
    if (field === undefined) continue
    patch[key] = value === null || value === undefined ? '' : String(value)
  }
  // 必填判定看**合并之后**的值：字段既不在本次提交里、也没存过，就是真的缺。
  // 写成 `undefined === 0` 会静默放过 —— 那是把"没填"读成了"填了空的但不算空"。
  for (const field of questions.fields) {
    if (field.required !== true) continue
    const effective = patch[field.key] === undefined ? (profile.background?.[field.key] ?? '') : patch[field.key]
    if (String(effective).trim().length === 0) {
      throw new Error(`「${field.label}」是必填 —— 底盘与能力模型都要从它推`)
    }
  }
  return updateProfile({ background: patch })
}

/** 期限选项 → 截止日期（从今天起算；90 天就是 90 天）。 */
function deadlineFrom(answer) {
  const days = { A: 30, B: 90, C: 183, D: 365 }[answer]
  if (days === undefined) return ''
  const date = new Date(`${today()}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Q1 + Q3 → 约束清单，写成用户能读懂的话。 */
function constraintsFrom(intake) {
  const constraints = []
  const state = INTAKE_QUESTIONS[0].options.find((option) => option.value === intake.q1)?.label
  const goal = INTAKE_QUESTIONS[2].options.find((option) => option.value === intake.q3)?.label
  if (state !== undefined) constraints.push(state)
  if (goal !== undefined) constraints.push(goal)
  return constraints
}

/**
 * Record one self-assessment round.
 *
 * The round carries a curve point per answered item with `来源: 自评`, and each
 * point's confidence is lifted when the current window holds a check-in at that
 * tier — that lift is the only route task evidence has into the curve.
 */
function saveSelfAssessment(body) {
  const scores = {}
  for (const [id, value] of Object.entries(record(body.scores))) {
    if (value === null || value === undefined || value === '') continue
    const number = Number(value)
    if (!Number.isInteger(number) || number < 1 || number > 5) throw new Error(`${id}: 自评分数必须是 1-5 的整数，或留空表示未确认`)
    scores[id] = number
  }
  if (Object.keys(scores).length === 0) throw new Error('至少要确认一项能力，否则这一轮没有读数')

  const { profile, plan, progress, assessments } = readAll()
  const role = resolveRole(profile)
  if (role === undefined) {
    throw new Error('当前方向还没有能力模型，无法逐项自评 —— 回对话里说一句「帮我建这个方向的能力模型」，AI 会基于预置模板生成一份')
  }
  const unknown = Object.keys(scores).filter((id) => role.items.every((item) => item.id !== id))
  if (unknown.length > 0) {
    throw new Error(`这些能力项不在当前模型里：${unknown.join('、')} —— 模型可能刚换过，刷新页面重打一次`)
  }

  const analysis = gapAnalysis(role, scores)
  // 记录里的 `date` 是**真实日期**（什么时候打的这一轮），`day` 是**进度天**（打的是哪一段）。
  // 手动自评与 Agent 写的那条必须同一个口径 —— 两边各算一遍就会差一个提前的天数。
  const date = today()
  const day = dayNumber(plan.planStart, effectiveToday(profile))
  const history = assessments.history ?? []
  const window = reviewWindow(history, date, day, plan.planStart)

  const points = []
  for (const item of role.items) {
    const score = scores[item.id]
    if (score === undefined) continue
    const tier = windowTier(plan, progress, window, item.id)
    points.push({
      能力项: item.id,
      分: score,
      置信度: selfPointConfidence(tier),
      证据档位: tier,
      来源: '自评',
    })
  }

  const entry = {
    date,
    day: day ?? 1,
    kind: 'self',
    coverage: '全量',
    scores: null,
    unsubmitted: [],
    gap: analysis.gap,
    gapWeight: analysis.W,
    confidence: points.some((point) => point.置信度 === 'high') ? 'high' : points.some((point) => point.置信度 === 'medium') ? 'medium' : 'low',
    sources: ['页面'],
    curvePoints: points,
    answered: Object.keys(scores).length,
    skipped: analysis.skippedCount,
  }

  updateProfile({ selfAssessment: { date, scores, gap: analysis.gap, weight: analysis.W } })
  appendAssessment(entry)
  return { entry, analysis }
}

/**
 * Register one review round's four scores.
 *
 * The page registers a score the agent produced; the agent itself writes through
 * its own tool. Both land in the same append-only history.
 */
function saveReview(body) {
  const scores = {}
  for (const dimension of ['完成率', '证据质量', '作品达标度', '知识考核']) {
    const value = Number(body.scores?.[dimension] ?? 0)
    if (!Number.isFinite(value) || value < 0 || value > 25) throw new Error(`${dimension} 必须是 0-25`)
    scores[dimension] = Math.round(value)
  }
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0)
  const { plan } = readAll()
  const date = today()
  const day = dayNumber(plan.planStart, date) ?? Number(body.day ?? 1)
  const grade = gradeOf(total)
  const entry = {
    date,
    day,
    kind: 'review',
    scores,
    total,
    grade: grade.grade,
    gradeAction: grade.action,
    confidence: typeof body.confidence === 'string' ? body.confidence : 'medium',
    sources: Array.isArray(body.sources) ? body.sources : ['页面'],
    coverage: body.coverage === '定向' ? '定向' : '全量',
    unsubmitted: Array.isArray(body.unsubmitted) ? body.unsubmitted : [],
    attribution: typeof body.attribution === 'string' ? body.attribution : '',
    adjustments: Array.isArray(body.adjustments) ? body.adjustments : [],
    report: typeof body.report === 'string' ? body.report : '',
    curvePoints: Array.isArray(body.curvePoints) ? body.curvePoints : [],
  }
  appendAssessment(entry)
  return { entry }
}

/** The routes that mutate one document, kept in one switch. */
async function mutate(route, body) {
  switch (route) {
    case '/intake':
      return { profile: saveIntake(body) }
    case '/background':
      return { profile: saveBackground(body) }
    case '/plan-start': {
      const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : ''
      if (date.length === 0) throw new Error('第 1 天必须是 YYYY-MM-DD')
      return { plan: updatePlan({ planStart: date }) }
    }
    case '/checkin': {
      const taskId = String(body.taskId ?? '')
      const { profile, plan } = readAll()
      if (planTasks(plan).every((task) => task.id !== taskId)) {
        throw new Error(`计划里没有 ${taskId} 这个任务（任务可能已被删除）`)
      }
      // 打卡同时记下**进度天**：连续打卡按它算（见 model.streakDays）；真实日期照旧记着，
      // 它回答的是另一个问题（"我什么时候做的"）。
      const planDay = dayNumber(plan.planStart, effectiveToday(profile))
      return {
        entry: checkIn(
          taskId,
          { done: body.done, evidence: body.evidence, tier: body.tier },
          typeof body.date === 'string' && body.date.length === 10 ? body.date : undefined,
          planDay,
        ),
      }
    }
    case '/transferable': {
      // 一次提交可以同时做两件事：确认几条（进 verifiedFacts）、否掉几条（进
      // dismissedTransferable，不再被提议）。只确认不否掉，会让列表越滚越长。
      const facts = (Array.isArray(body.facts) ? body.facts : []).filter((item) => typeof item === 'string' && item.trim().length > 0)
      const dismissed = (Array.isArray(body.dismissed) ? body.dismissed : []).filter((item) => typeof item === 'string' && item.trim().length > 0)
      if (facts.length === 0 && dismissed.length === 0) throw new Error('至少勾选或否掉一条')
      if (facts.length > 0) updateProfile({ verifiedFacts: facts })
      for (const line of dismissed) dismissTransferable(line)
      return { profile: read('profile') }
    }
    case '/self-assessment':
      return saveSelfAssessment(body)
    case '/assessment':
      return saveReview(body)
    case '/plan': {
      const phases = Array.isArray(body.phases) ? body.phases : null
      if (phases === null) throw new Error('计划必须带 phases 数组')
      return { plan: updatePlan({ ...body, phases }) }
    }
    case '/capability-model': {
      // 只有 Agent 生成模型；页面用它来「丢弃这份模型」（回到让 AI 重生成）。
      if (body.discard !== true) throw new Error('能力模型只能由 Agent 生成（用 growth_propose_capability_model）；这个接口只接受 { discard: true }')
      updateProfile({ capabilityModel: null, selfAssessment: null })
      return { profile: read('profile') }
    }
    case '/draft': {
      // 考卷草稿：失焦存一题、定时再存一遍、交卷后清掉。按题合并不是省事 —— 整份覆盖会让
      // 两次并发写（失焦那次 + 定时那次）互相吃掉。
      const key = String(body.key ?? '')
      if (key.length === 0) throw new Error('草稿要知道是哪一张卷子（key 不能为空）')
      if (body.clear === true) return { draft: clearDraft(key) }
      return { draft: saveDraft(key, record(body.answers)) }
    }
    case '/ahead': {
      // 提前：节奏比日历快几天。今天有空多做了一天、或某道题本来就会直接过了 ——
      // 用户的节奏是他自己的事，产品只负责如实记下来（见 store.effectiveToday）。
      const days = Number(body.days)
      if (!Number.isInteger(days) || days < 0 || days > 365) throw new Error('提前的天数必须是 0-365 的整数（0 = 回到日历节奏）')
      updateProfile({ aheadDays: days })
      return { profile: read('profile') }
    }
    case '/agent-session': {
      // 「成长工作台」固定的那个对话。页面只交 id 与标题，宿主不校验会话是否存在 ——
      // 会话是浏览器侧的东西（宿主看不见 UI 的会话列表）。真相在页面的 sessions 服务里：
      // 它每次发送前都自己 bind 一次，bind 不到就**明说**，不静默改投别的对话。
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
      if (sessionId.length === 0) {
        updateProfile({ agentSession: null })
        return { profile: read('profile') }
      }
      if (sessionId.length > 120) throw new Error('会话 id 过长 —— 这看起来不是 DSH 的会话 id')
      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 60) : ''
      updateProfile({ agentSession: { id: sessionId, title, boundAt: new Date().toISOString() } })
      return { profile: read('profile') }
    }
    case '/evidence-image-remove': {
      // 只有用户点缩略图上那个 × 会走到这里 —— 而它也是唯一会删图片文件的入口。
      const removed = removeEvidenceImage(String(body.taskId ?? ''), String(body.file ?? ''))
      if (!removed) throw new Error('这张图不在这个任务的证据里（可能已经删过了）')
      return { progress: read('progress') }
    }
    case '/reset': {
      const kind = String(body.kind ?? '')
      if (!KINDS.includes(kind)) throw new Error(`未知的数据分区：${kind}`)
      const blank = empty(kind)
      // 清空画像 ≠ 解除会话绑定：固定的对话是「运行发到哪儿」，不是画像内容。
      if (kind === 'profile') blank.agentSession = read('profile').agentSession ?? null
      write(kind, blank)
      return { reset: kind }
    }
    default:
      throw new Error(`unknown growth-workbench route: POST ${route}`)
  }
}

/**
 * Dispatch one request.
 * @param req - the incoming request; only `method` and `url` are read.
 * @param res - the response this handler owns.
 */
export async function handleApi(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const route = url.pathname.slice(API_PREFIX.length).replace(/\/+$/, '') || '/'
  const method = req.method ?? 'GET'

  if (method === 'GET' && (route === '/' || route === '/state')) {
    return serve(res, () => buildState())
  }
  if (method === 'GET' && route === '/export') {
    // One file with every document, so a user can keep their own backup —
    // the data moved out of the browser, so it owes them a way to hold it.
    return serve(res, () => ({ exported: today(), data: readAll() }))
  }
  if (method === 'GET' && route === '/evidence-image') {
    // 原路把图片吐回去给页面显示。文件名过 store 的校验（形状 + 不越界）—— 路径穿越的
    // 那道闸门就在那里，不在这一层。
    const file = url.searchParams.get('file') ?? ''
    try {
      const bytes = readEvidenceImage(file)
      const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase()
      return sendBytes(res, 200, IMAGE_MIME[ext] ?? 'application/octet-stream', bytes)
    } catch (error) {
      return sendJson(res, 404, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
  if (method === 'POST' && route === '/evidence-image') {
    // 收的是**裸字节**（不是 JSON、也不是 multipart），所以它不走下面那条通用写入路径。
    const taskId = url.searchParams.get('task') ?? ''
    return serve(res, async () => {
      const bytes = await readRawBody(req, MAX_IMAGE_BYTES)
      const { plan } = readAll()
      if (planTasks(plan).every((task) => task.id !== taskId)) {
        throw new Error(`计划里没有 ${taskId} 这个任务（任务可能已被删除）`)
      }
      return { entry: addEvidenceImage(taskId, bytes, req.headers?.['content-type'] ?? '') }
    })
  }
  if (method === 'POST') {
    return serve(res, async () => mutate(route, record(await readJsonBody(req))))
  }

  sendJson(res, 404, { ok: false, error: `unknown growth-workbench route: ${method} ${route}` })
}

/** Re-exported for the agent's tools, which write through the same validations. */
export { saveIntake, saveBackground, saveReview, saveSelfAssessment, deadlineFrom, constraintsFrom }
