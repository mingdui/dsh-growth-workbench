/**
 * `dsh-growth-workbench` — durable storage.
 *
 * Four JSON documents under `$DSH_HOME/growth-workbench/`:
 *
 *     profile.json      画像 —— 目标方向、路线、自评、底盘、考核历史
 *     plan.json         计划 —— 起始日、阶段（含天区间）、任务、作品集
 *     progress.json     打卡 —— 每个任务的完成状态、证据、打卡日集合
 *     assessments.json  考核报告与趋势
 *
 * Separate files on purpose: the page writes `progress.json` many times a day while
 * the agent writes `plan.json` rarely, so one file would make every check-in a
 * potential conflict with a plan edit.
 *
 * Every write is atomic — a sibling temporary file, then `rename` over the
 * target — so a reader never observes a half-written document.
 *
 * The documents are also the **whole** interface between the page and the agent:
 * the page reaches them over `/gw/api`, the agent over its tools, and neither
 * can see the other's in-flight state. There is no second copy to keep in sync,
 * because there is no second copy.
 *
 * @module dsh-growth-workbench/store
 */
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Document shape version, so a future migration has something to read. */
export const DATA_VERSION = 2

/** The DSH home this plugin stores under. A launcher always exports `DSH_HOME`. */
export function dshHome() {
  const configured = process.env.DSH_HOME?.trim()
  return configured && configured.length > 0 ? configured : join(homedir(), '.dsh')
}

/** The plugin's own directory inside the DSH home. */
export function dataDir() {
  return join(dshHome(), 'growth-workbench')
}

/** Absolute path of one document. */
export function dataPath(kind) {
  return join(dataDir(), `${kind}.json`)
}

/** The four document kinds, in the order a full read returns them. */
export const KINDS = ['profile', 'plan', 'progress', 'assessments']

/**
 * Today, in the ISO form every date field uses.
 *
 * **Local**, not UTC. `toISOString()` returns the UTC date, so for anyone east of
 * Greenwich the plugin spent the first hours of every day believing it was still
 * yesterday — a check-in at 00:30 was recorded on the previous day and the streak
 * followed it. Dates the user reads and writes are local dates; only the wire format
 * is fixed.
 */
export function today() {
  const now = new Date()
  return [
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * Read one document, or its empty shape when the file does not exist yet.
 * @param kind - one of {@link KINDS}.
 */
export function read(kind) {
  let source
  try {
    source = readFileSync(dataPath(kind), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return empty(kind)
    throw new Error(`growth-workbench: cannot read ${dataPath(kind)}: ${error instanceof Error ? error.message : String(error)}`)
  }
  let parsed
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new Error(`growth-workbench: ${dataPath(kind)} is not valid JSON`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`growth-workbench: ${dataPath(kind)} must be a JSON object`)
  }
  return { ...empty(kind), ...parsed }
}

/**
 * Replace one document atomically.
 * @param kind - one of {@link KINDS}.
 * @param value - the complete document.
 * @returns the value that was written.
 */
export function write(kind, value) {
  const directory = dataDir()
  mkdirSync(directory, { recursive: true })
  const target = dataPath(kind)
  const temporary = `${target}.${String(process.pid)}.${String(Date.now())}.tmp`
  const body = `${JSON.stringify({ ...value, version: DATA_VERSION }, null, 2)}\n`
  try {
    writeFileSync(temporary, body, { encoding: 'utf8', flag: 'wx' })
    renameSync(temporary, target)
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch {
      // best effort: the temporary may never have been created
    }
    throw new Error(`growth-workbench: cannot write ${target}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return value
}

/** The empty shape of one document. A blank instance is a valid instance. */
export function empty(kind) {
  switch (kind) {
    case 'profile':
      return {
        version: DATA_VERSION,
        currentRole: '',
        targetRole: '',
        targetRoleSlug: '',
        targetRoleStatus: '',
        positioning: '',
        route: '',
        timePerDay: '',
        deadline: '',
        constraints: [],
        /**
         * 当前状态的追问答案（`BACKGROUND_QUESTIONS` 的 fields）。
         * 专业 / 年级 / 当前岗位 / 行业 / 收入来源 / 已经在交付的东西 / 技能 —— 底盘与
         * 能力模型都是从这些推出来的，所以要原样留着，不能被概括成一句话。
         */
        background: {},
        /**
         * AI 提议的可迁移底盘，**待确认**。用户勾中的进 `verifiedFacts`；
         * 用户否掉的进 `dismissedTransferable`，不再重复提议。
         */
        transferableSuggestions: [],
        dismissedTransferable: [],
        /**
         * 「这个方向要、但用户的经历替代不了」的部分 —— 由 Agent 从追问答案推，
         * 不是写死的清单。只用于如实说明，不参与打分。
         */
        notTransferable: [],
        /** 用户确认过的底盘 —— 只追加，不覆盖。 */
        verifiedFacts: [],
        /** 模型对用户的推测，**待确认**；用户确认后才移进 verifiedFacts。 */
        pending: [],
        /** 四个选择题的答案（question-bank Q1-Q4）。 */
        intake: {},
        /**
         * 为本方向生成的能力模型（`ROLES` 同形状 + `forSlug` / `provenance`）。
         * 只对 `forSlug` 等于当前目标方向时生效 —— 换方向后自动失效，不需要清。
         */
        capabilityModel: null,
        /** 最近一次自评：`{ [能力项]: 1-5 }`。 */
        selfAssessment: null,
        updated: '',
      }
    case 'plan':
      return {
        version: DATA_VERSION,
        planStart: '',
        role: '',
        route: '',
        goal: '',
        /** 阶段：`{ name, days: [起, 止], goal, project, criteria, tasks: [], weeks: [] }`。 */
        phases: [],
        portfolio: [],
        /** 考核自查题：每题挂 1 个能力项编号，**不含答案**（答案在考核时现场给）。 */
        selfCheck: [],
        resources: [],
        updated: '',
      }
    case 'progress':
      return { version: DATA_VERSION, tasks: {}, updated: '' }
    case 'assessments':
      return { version: DATA_VERSION, history: [], updated: '' }
    default:
      throw new Error(`growth-workbench: unknown document ${kind}`)
  }
}

/** Read every document at once — the agent's whole picture in one call. */
export function readAll() {
  return {
    profile: read('profile'),
    plan: read('plan'),
    progress: read('progress'),
    assessments: read('assessments'),
  }
}

/** One task's progress entry, created on first touch. */
export function progressEntry(progress, taskId) {
  const existing = progress.tasks?.[taskId]
  if (existing !== undefined) return existing
  return { done: false, evidence: '', tier: null, checkInDates: [], lastDate: '' }
}

/**
 * Record one check-in against a task.
 *
 * `打卡日期` **accumulates** and never overwrites: the streak is counted from the
 * union of every task's dates, so overwriting would make "three days on one task"
 * read as one day — exactly the state the减量 rule puts people in.
 *
 * @param taskId - 任务标识（`T<n>`）—— the only identity allowed to key storage.
 * @param patch - `{ done?, evidence?, tier? }`; omitted fields keep their value.
 * @param date - the check-in date; defaults to today.
 * @returns the updated entry.
 */
export function checkIn(taskId, patch = {}, date = today()) {
  if (typeof taskId !== 'string' || !/^T\d+$/.test(taskId)) {
    throw new Error(`growth-workbench: task id must look like T<n>, got ${JSON.stringify(taskId)}`)
  }
  const progress = read('progress')
  const entry = { ...progressEntry(progress, taskId) }
  if (patch.done !== undefined) entry.done = patch.done === true
  if (patch.evidence !== undefined) entry.evidence = String(patch.evidence).replace(/\s+/g, ' ').trim()
  if (patch.tier !== undefined) {
    entry.tier = patch.tier === null || patch.tier === '' ? null : String(patch.tier)
    if (entry.tier !== null && !['自述', '过程', '成果'].includes(entry.tier)) {
      throw new Error(`growth-workbench: 证据档位 must be 自述/过程/成果 or null, got ${entry.tier}`)
    }
  }
  // 证据为空 → 档位必须是 null，不要默认成「自述」。
  if (entry.evidence === '') entry.tier = null
  entry.checkInDates = [...new Set([...(entry.checkInDates ?? []), date])].sort()
  entry.lastDate = entry.checkInDates[entry.checkInDates.length - 1] ?? ''
  progress.tasks = { ...progress.tasks, [taskId]: entry }
  progress.updated = new Date().toISOString()
  write('progress', progress)
  return entry
}

/** Remove one task's progress (used when a task is deleted from the plan). */
export function clearCheckIn(taskId) {
  const progress = read('progress')
  if (progress.tasks?.[taskId] === undefined) return false
  const tasks = { ...progress.tasks }
  delete tasks[taskId]
  progress.tasks = tasks
  progress.updated = new Date().toISOString()
  write('progress', progress)
  return true
}

/**
 * Append one assessment round.
 *
 * History is **append-only**: overwriting a round throws away the trend, and the
 * trend is the half of this data that only exists because history is kept.
 * @param entry - one round; `date` and `day` are required.
 */
export function appendAssessment(entry) {
  if (typeof entry?.date !== 'string' || entry.date.length === 0) throw new Error('growth-workbench: assessment needs a date')
  if (!Number.isInteger(entry.day) || entry.day < 1) throw new Error('growth-workbench: assessment needs a positive integer day')
  const store = read('assessments')
  const history = [...(store.history ?? []), entry].sort((left, right) => left.date.localeCompare(right.date))
  store.history = history
  store.updated = new Date().toISOString()
  write('assessments', store)
  return entry
}

/** 只追加的清单字段：合并时按文本去重，绝不覆盖已有条目。 */
const APPEND_ONLY = new Set(['verifiedFacts', 'pending', 'dismissedTransferable'])

/**
 * Merge a patch into the profile.
 *
 * `verifiedFacts` / `pending` / `dismissedTransferable` are **append-only**: an
 * unconfirmed inference must never silently replace a confirmed fact, confirming
 * one must not erase the record that it was once an inference, and a rejected
 * suggestion must stay rejected instead of coming back on the next proposal.
 *
 * `background` is merged **per field**, not replaced: the conditional follow-ups
 * change with 当前状态, and answering the new set must not wipe the answers to
 * the old one — switching back would otherwise ask again for what was typed.
 */
export function updateProfile(patch = {}) {
  const profile = read('profile')
  for (const [key, value] of Object.entries(patch)) {
    if (APPEND_ONLY.has(key)) {
      const merged = [...(profile[key] ?? [])]
      for (const item of Array.isArray(value) ? value : [value]) {
        const text = typeof item === 'string' ? item : item?.text
        if (typeof text === 'string' && text.trim().length > 0 && !merged.includes(text.trim())) merged.push(text.trim())
      }
      profile[key] = merged
      continue
    }
    if (key === 'background') {
      const merged = { ...(profile.background ?? {}) }
      for (const [field, answer] of Object.entries(value ?? {})) {
        if (answer === null || answer === undefined || String(answer).trim().length === 0) delete merged[field]
        else merged[field] = String(answer).trim()
      }
      profile.background = merged
      continue
    }
    profile[key] = value
  }
  profile.updated = new Date().toISOString()
  write('profile', profile)
  return profile
}

/**
 * Replace the pending 可迁移底盘 proposal.
 *
 * A proposal **replaces** the previous one (it is a fresh reading of the same
 * background), but it never re-offers something the user already rejected or
 * already confirmed: a suggestion list that keeps coming back with the items you
 * just said no to is a list you stop reading.
 *
 * @param items - `[{ id, name, text }]` as the agent proposed them.
 * @returns the suggestions actually stored.
 */
export function setTransferableSuggestions(items) {
  const profile = read('profile')
  const dismissed = new Set(profile.dismissedTransferable ?? [])
  const confirmed = new Set(profile.verifiedFacts ?? [])
  const seen = new Set()
  const suggestions = []
  for (const item of Array.isArray(items) ? items : []) {
    const text = typeof item?.text === 'string' ? item.text.trim() : ''
    const name = typeof item?.name === 'string' ? item.name.trim() : ''
    if (text.length === 0) continue
    const line = name.length > 0 ? `${name}：${text}` : text
    if (seen.has(line) || dismissed.has(line) || confirmed.has(line)) continue
    seen.add(line)
    suggestions.push({ id: typeof item?.id === 'string' && item.id.length > 0 ? item.id : `tf-${String(suggestions.length + 1)}`, name, text })
  }
  profile.transferableSuggestions = suggestions
  profile.updated = new Date().toISOString()
  write('profile', profile)
  return suggestions
}

/**
 * Record that a proposed 底子 is not the user's, so it is not proposed again.
 *
 * The **no** is recorded whether or not the line is still pending: the user said
 * they had not done it, and that answer has to survive a later re-proposal (the
 * agent may propose it again from the same background). Removing it from the
 * pending list is a side effect, not the point.
 *
 * @param text - the suggestion's text, in the `名字：说明` form the page shows.
 * @returns whether it was still in the pending list.
 */
export function dismissTransferable(text) {
  const profile = read('profile')
  const line = String(text ?? '').trim()
  if (line.length === 0) return false
  const before = profile.transferableSuggestions ?? []
  const after = before.filter((item) => (item.name.length > 0 ? `${item.name}：${item.text}` : item.text) !== line)
  profile.transferableSuggestions = after
  profile.dismissedTransferable = [...new Set([...(profile.dismissedTransferable ?? []), line])]
  profile.updated = new Date().toISOString()
  write('profile', profile)
  return after.length !== before.length
}

/** Write the plan, stamping the update time. */
export function updatePlan(plan) {
  const current = read('plan')
  const next = { ...current, ...plan, updated: new Date().toISOString() }
  write('plan', next)
  return next
}
