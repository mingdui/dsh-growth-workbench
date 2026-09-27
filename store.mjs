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
import { join, resolve, sep } from 'node:path'

/**
 * Document shape version, so a future migration has something to read.
 *
 * 3 加了 `profile.agentSession`（固定对话）。4 加了 `progress.tasks[].checkInDays`
 * （进度天）。5 加了 `assessments.drafts`（没交卷的考卷答案）。三个都是**向后兼容**的新字段：
 * `read()` 会把磁盘上的文档盖在 {@link empty} 上，旧文档取到 `null` / 空列表 / 空对象；
 * 进度条目缺 `checkInDays` 时由 `model.planDaysOf` 拿 `checkInDates` 按 `planStart` 当场推回来 ——
 * 所以都不需要手工迁移（见 CLAUDE.md 的两条安全路径）。
 */
export const DATA_VERSION = 5

/** The DSH home this plugin stores under. A launcher always exports `DSH_HOME`. */
export function dshHome() {
  const configured = process.env.DSH_HOME?.trim()
  return configured && configured.length > 0 ? configured : join(homedir(), '.dsh')
}

/**
 * The plugin's own directory inside the DSH home.
 *
 * 除了四份文档与 `evidence/`，这里还有一个 `workspace/` —— **给 Agent 用的空工作区**（见
 * {@link workspaceDir}），它不属于用户数据，但放在同一个目录下：备份 = 拷这一处。
 */
export function dataDir() {
  return join(dshHome(), 'growth-workbench')
}

/**
 * The empty directory the workbench's own conversation uses as its **workspace**.
 *
 * 为什么单开一个、而不是直接把数据目录当工作区：会话的 `cwd` 就是 Agent 的默认工作目录 ——
 * 指向数据目录等于把 `plan.json` / `progress.json` 摆在它手边，随手一次直接编辑就**绕过了
 * 那 7 个工具的门禁**（8 字段合同、天区间、能力项校验、标识永不复用……），而那套门禁是整个
 * 产品读数可信的依据。指向一个空目录：侧栏分组干净，数据仍只在工具那边。
 *
 * 建目录这件事由宿主做（`index.mjs` 挂载时），页面只拿到路径 —— 页面不碰磁盘。
 */
export function workspaceDir() {
  return join(dataDir(), 'workspace')
}

/** 幂等：目录在就返回，不在就建（含父目录）。宿主挂载时叫一次。 */
export function ensureWorkspaceDir() {
  mkdirSync(workspaceDir(), { recursive: true })
  return workspaceDir()
}

/**
 * 「今天」—— 页面与 Agent 都认的那一个。
 *
 * `profile.aheadDays` 是**提前**：今天有空多做了一天、或某道题本来就会直接过了，用户的
 * 节奏就比日历快。它只拨动"我在做第几天"（第几天、当前阶段、今日任务、本周完成率、该不该
 * 考核，全都跟着走），**不改打卡日期** —— 打卡记的是真发生的事；也不动 `planStart`：
 * 起始日是"计划从哪天开始"这个事实，不该因为节奏快慢被改写。
 */
export function effectiveToday(profile) {
  const offset = Number.isInteger(profile?.aheadDays) ? profile.aheadDays : 0
  if (offset === 0) return today()
  const [year, month, day] = today().split('-').map(Number)
  // 用本地日期做加法：跨月、跨年由 Date 自己进位，不做手写的天数表。
  const shifted = new Date(year, month - 1, day + offset)
  return [
    String(shifted.getFullYear()),
    String(shifted.getMonth() + 1).padStart(2, '0'),
    String(shifted.getDate()).padStart(2, '0'),
  ].join('-')
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
        /**
         * 「成长工作台」固定的那个对话 `{ id, title, boundAt }`。
         *
         * 从 ③ 可迁移能力起，每一次 Agent 运行都发进它 —— 不再跟着"你此刻打开的是哪个
         * 对话"跑。页面只走 `/gw/api`、不能写盘，所以这个 id 存在宿主侧。`null` = 还没
         * 固定（第一次需要 Agent 时会新建一个专用对话并固定）。它**不是画像内容**：
         * 清空画像不会把它一起清掉。
         */
        agentSession: null,
        /**
         * 提前：节奏比日历快几天（0 = 跟日历走）。今天有空多做了一天、或某道题本来就会
         * 直接过了，就在这里记一笔 —— 它只影响"我在做第几天"，不影响打卡日期，也不动
         * `planStart`。见 {@link effectiveToday}。
         */
        aheadDays: 0,
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
      return {
        version: DATA_VERSION,
        history: [],
        /**
         * **没交卷的答案**（考卷草稿）：`{ [paperKey]: { answers: { [题号]: 文本 }, updated } }`。
         *
         * 为什么放这儿：一轮考卷是「已交 / 未交」两半，它属于同一件事；也省掉第五份文档
         * （KINDS、导出、清空分区都得跟着改）。
         */
        drafts: {},
        updated: '',
      }
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
  // `images` 是后加的字段：旧文档里没有它，`{ ...empty, ...parsed }` 那一套不管这个（进度
  // 条目不是整份文档），所以读取处一律写 `entry.images ?? []` —— 见 addEvidenceImage / 页面。
  return { done: false, evidence: '', tier: null, checkInDates: [], checkInDays: [], lastDate: '', images: [] }
}

/**
 * Record one check-in against a task.
 *
 * 记两样东西，各管各的：
 *
 *   - `checkInDates` —— **真实日期**（"我什么时候做的"）。它只追加、不覆盖，
 *     连续打卡与任何审计都从这里读得懂。
 *   - `checkInDays` —— **进度天**（"这一笔算计划里的第几天"）。连续打卡按它算：
 *     用户今天有空一口气推进三天，那是连续三天的进展，按日历只会读成 1 天。
 *
 * @param taskId - 任务标识（`T<n>`）—— the only identity allowed to key storage.
 * @param patch - `{ done?, evidence?, tier? }`; omitted fields keep their value.
 * @param date - the real check-in date; defaults to today.
 * @param planDay - the progress day this check-in belongs to (page passes the pointer).
 * @returns the updated entry.
 */
export function checkIn(taskId, patch = {}, date = today(), planDay = null) {
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
  if (Number.isInteger(planDay)) {
    entry.checkInDays = [...new Set([...(entry.checkInDays ?? []), planDay])].sort((left, right) => left - right)
  }
  entry.lastDate = entry.checkInDates[entry.checkInDates.length - 1] ?? ''
  progress.tasks = { ...progress.tasks, [taskId]: entry }
  progress.updated = new Date().toISOString()
  write('progress', progress)
  return entry
}

/**
 * Remove one task's progress (used when a task is deleted from the plan).
 *
 * 它只解除引用：这个任务挂过的**图片文件留在磁盘上**。证据是用户的东西，不是缓存 ——
 * 宁可留一个孤儿文件，也不替他删掉一张他可能唯一的截图。
 */
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
 * Patch **one** task in the plan, leaving everything else alone.
 *
 * 为什么需要它：给一道题补学习资料，不该要求调用方把整份计划重发一遍 —— 那既容易丢东西
 * （漏一个字段就是一处拒绝），也会顺带把别的任务一起改写。一个标识、一个补丁，只动一行。
 *
 * @returns the updated task, or `undefined` when the id is not in the plan.
 */
export function updateTask(taskId, patch = {}) {
  const plan = read('plan')
  let updated
  plan.phases = (plan.phases ?? []).map((phase) => ({
    ...phase,
    tasks: (phase.tasks ?? []).map((task) => {
      if (task.id !== taskId) return task
      updated = { ...task, ...patch }
      return updated
    }),
  }))
  if (updated === undefined) return undefined
  plan.updated = new Date().toISOString()
  write('plan', plan)
  return updated
}

// ---------------------------------------------------------------- 证据图片
/** 证据图片的目录：`$DSH_HOME/growth-workbench/evidence/`。 */
export function evidenceDir() {
  return join(dataDir(), 'evidence')
}

/** 收哪些图片，各用什么扩展名落盘 —— 只收浏览器能直接显示的这四种。 */
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

/** 文件名只能是本插件自己生成的那种形状 —— 它同时就是路径穿越的闸门。 */
const IMAGE_FILE = /^T\d+-\d{14}-[a-z0-9]{4}\.(png|jpg|webp|gif)$/

/**
 * 一张证据图片的绝对路径。
 *
 * 名字必须是我们生成的形状，而且解析出来仍在 `evidence/` 里：这个值是从 query string
 * 进来的（`GET /gw/api/evidence-image?file=…`），不校验就是路径穿越 ——
 * `?file=../profile.json` 能把用户画像当图片吐出去。
 */
export function evidenceImagePath(file) {
  const name = typeof file === 'string' ? file : ''
  if (!IMAGE_FILE.test(name)) throw new Error(`不是本插件生成的证据图片名：${JSON.stringify(name)}`)
  const directory = evidenceDir()
  const full = resolve(directory, name)
  if (!full.startsWith(`${directory}${sep}`)) throw new Error('证据图片路径越界')
  return full
}

/** 读一张证据图片的字节，原路交回给页面显示。 */
export function readEvidenceImage(file) {
  return readFileSync(evidenceImagePath(file))
}

/**
 * 把一张图片挂到某个任务的证据上。
 *
 * 文件名由**这里**生成（任务标识 + 本地时间 + 四个随机字符），永不使用上传方给的文件名：
 * 那是路径穿越的入口，而"两张截图叫同一个名字"本来就是常态。
 *
 * 先落盘、再写记录：反过来的话，记录会指向一个不存在的文件。
 */
export function addEvidenceImage(taskId, bytes, mime) {
  if (typeof taskId !== 'string' || !/^T\d+$/.test(taskId)) {
    throw new Error(`growth-workbench: task id must look like T<n>, got ${JSON.stringify(taskId)}`)
  }
  const type = String(mime ?? '').split(';')[0].trim().toLowerCase()
  const ext = IMAGE_TYPES[type]
  if (ext === undefined) throw new Error('只收 png / jpeg / webp / gif 四种图片')
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new Error('这张图是空的')

  const now = new Date()
  const stamp = [
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
  const file = `${taskId}-${stamp}-${Math.random().toString(36).slice(2, 6)}.${ext}`
  mkdirSync(evidenceDir(), { recursive: true })
  writeFileSync(evidenceImagePath(file), bytes, { flag: 'wx' })

  const progress = read('progress')
  const entry = { ...progressEntry(progress, taskId) }
  entry.images = [...(entry.images ?? []), { file, mime: type, bytes: bytes.length, at: now.toISOString() }]
  progress.tasks = { ...progress.tasks, [taskId]: entry }
  progress.updated = new Date().toISOString()
  write('progress', progress)
  return entry
}

/**
 * 摘掉一张证据图片 —— **只有用户点缩略图上那个 × 才会走到这里**。
 * 计划重写、任务被删都不会动它（见 {@link clearCheckIn}）。
 */
export function removeEvidenceImage(taskId, file) {
  const path = evidenceImagePath(file)
  const progress = read('progress')
  const existing = progress.tasks?.[taskId]
  if (existing === undefined) return false
  const images = (existing.images ?? []).filter((image) => image.file !== file)
  if (images.length === (existing.images ?? []).length) return false
  progress.tasks = { ...progress.tasks, [taskId]: { ...existing, images } }
  progress.updated = new Date().toISOString()
  write('progress', progress)
  try {
    unlinkSync(path)
  } catch {
    // 文件已经不在了：记录清掉就够了（用户要的是"这张图别再跟着这个任务"）。
  }
  return true
}

/**
 * Save the answers typed into one exam paper (**not submitted**).
 *
 * 一次一题地合并不是省事：考卷是"失焦即存"的，整份覆盖会让并发的那两次写互相吃掉。
 * 调用方不必先读后写，也不会把别的题的草稿抹掉。
 *
 * @param key - the paper's identity (`节点-2` / `阶段-1`）。
 * @param answers - `{ [题号]: 文本 }`；空字符串 = 清掉那一题。
 */
export function saveDraft(key, answers) {
  if (typeof key !== 'string' || key.length === 0) throw new Error('growth-workbench: draft needs a paper key')
  const store = read('assessments')
  const drafts = { ...(store.drafts ?? {}) }
  const current = drafts[key] ?? { answers: {}, updated: '' }
  const merged = { ...(current.answers ?? {}) }
  for (const [id, text] of Object.entries(answers ?? {})) {
    const value = String(text ?? '')
    if (value.trim().length === 0) delete merged[id]
    else merged[id] = value
  }
  // 一题都不剩就把这条草稿删掉 —— 空草稿会让目录上多出一个"继续作答"的假入口。
  if (Object.keys(merged).length === 0) delete drafts[key]
  else drafts[key] = { answers: merged, updated: new Date().toISOString() }
  store.drafts = drafts
  store.updated = new Date().toISOString()
  write('assessments', store)
  return drafts[key] ?? null
}

/** 交卷之后清掉这张卷子的草稿 —— 答案已经作为一整轮交出去了，留着只会在目录上多出一个假入口。 */
export function clearDraft(key) {
  const store = read('assessments')
  const drafts = { ...(store.drafts ?? {}) }
  delete drafts[key]
  store.drafts = drafts
  store.updated = new Date().toISOString()
  write('assessments', store)
  return null
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
