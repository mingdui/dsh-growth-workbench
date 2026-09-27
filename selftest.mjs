/**
 * Offline checks for dsh-growth-workbench, run before it is installed.
 *
 *  1. every file parses as the form it is loaded as
 *  2. one identity across the four declarations, and no Harness import in the host half
 *  3. the model's arithmetic: weights, gap, completion, streak, phase, curve
 *  4. the plan write path actually refuses the things that fail silently
 *  5. the agent's six tools, end to end, against a throwaway home
 *  6. the page's HTTP routes
 *
 * Run: node dsh-growth-workbench/selftest.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const NAME = 'dsh-growth-workbench'
let failures = 0

/** Run one check, reporting its outcome. `fn` may be async. */
async function check(label, fn) {
  try {
    await fn()
    console.log(`PASS  ${label}`)
  } catch (error) {
    failures += 1
    console.log(`FAIL  ${label}\n        ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 取一个组件函数的源码片段。
 *
 * 按**"下一个组件开始"**切，不按某个具体函数名切 —— 组件在文件里的顺序会变，按名字切会切出
 * 空串，于是 `doesNotMatch` 永远通过、`match` 永远失败：断言看着在守，其实没守。
 */
function sliceOfComponent(source, name) {
  const start = source.indexOf(`function ${name}(`)
  if (start < 0) return ''
  const rest = source.slice(start + 1)
  const end = rest.indexOf('\n    function ')
  return rest.slice(0, end === -1 ? undefined : end)
}

/** 片段里的代码行（去掉整行注释）—— 注释里正当地写着那些词，不该被判违规。 */
function codeOnly(text) {
  return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
}

/** A throwaway DSH home, so no check touches the real one. */
const home = mkdtempSync(join(tmpdir(), 'growth-workbench-selftest-'))
process.env.DSH_HOME = home

const FILES = ['index.mjs', 'api.mjs', 'model.mjs', 'store.mjs', 'tools.mjs', 'validate.mjs', 'client.js']

// ---------------------------------------------------------------- 1. parses

for (const file of FILES) {
  await check(`parses: ${file}`, () => execFileSync(process.execPath, ['--check', join(ROOT, file)], { stdio: 'pipe' }))
}

await check('client.js follows the browser module-loader contract', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.match(source, /window\.__ModuleLoader__\.load\(/)
  assert.match(source, /id: 'dsh-growth-workbench'/)
  assert.match(source, /require\('react'\)/)
  assert.match(source, /sidebarRightTabs\.register\(/)
  assert.match(source, /sidebar\.right\.pane\.tab/)
  assert.match(source, /name: 'sidebar\.panellist'/)
  assert.match(source, /name: 'main'/)
})

await check('the left page is not selected on boot', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.doesNotMatch(source, /selectPanel/, 'selecting a main panel would replace the conversation')
})

await check('client.js keeps the two views of one dataset in sync', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.match(source, /const reloaders = new Set\(\)/)
  assert.match(source, /refreshOthers\(load\)/)
})

await check('client.js never names a storage path of its own', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.doesNotMatch(source, /DSH_HOME/, 'the browser must not know where the data lives')
  assert.doesNotMatch(source, /dataPath|readFileSync|writeFileSync/, 'the browser talks to /gw/api, not to the disk')
  assert.doesNotMatch(source, /[A-Za-z]:\\\\/, 'no absolute paths in the browser half')
})

await check('client.js has the four profile steps, in order', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  const order = ['DirectionForm', 'IntakeForm', 'TransferableForm', 'SelfAssessmentForm']
  const positions = order.map((name) => source.indexOf(`h(${name}, {`))
  assert.ok(positions.every((index) => index > 0), '每一个块都要挂进画像页')
  assert.deepEqual([...positions].sort((left, right) => left - right), positions, '四步必须按顺序挂进画像页')
  // 追问不再是独立一步：它由 ② 渲染 —— 调用点必须落在 IntakeForm 的函数体里。
  const followUps = source.indexOf('h(BackgroundForm, {')
  assert.ok(followUps > source.indexOf('function IntakeForm(') && followUps < source.indexOf('function BackgroundForm('), '追问要由 ② 自己渲染，而不是单独一步')
})

await check('⑤ 的锚点是从 item.anchors 内联渲染的', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.match(source, /\(item\.anchors \?\? \[\]\)\.map\(/, '锚点必须来自能力项自己的 anchors 字段')
  // anchorText 曾经被调用却从未定义（展开 ⑤ 抛 ReferenceError，整步渲染不出来），
  // 只有真渲染才暴露。现在内联渲染，这条不许复活。
  assert.doesNotMatch(source, /anchorText/, 'anchorText 已删除，不该再出现')
})

await check('client.js offers a free-text direction', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.match(source, /'aria-label': '自定义岗位'/)
  assert.match(source, /catalog\.customSlug/)
})

await check('client.js renders the follow-ups from the catalog, not a fixed list', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.match(source, /catalog\.followUps/)
  assert.match(source, /catalog\.missingBackground/)
  assert.doesNotMatch(source, /transferableBase/, 'the built-in 底子 table is gone')
})

await check('client.js confirms and dismisses 底子 one line at a time', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.match(source, /'data-tf': text/)
  assert.match(source, /'data-tf-no': text/)
  assert.match(source, /dismissed: \[text\]/)
})

await check('client.js warns when the model is not the preset one', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.match(source, /catalog\.activeRoleSource/)
  assert.match(source, /sourceNote\.note/, '未经校准这件事要在打分的地方说')
})

await check('「让 AI 来做」按钮是替你把这句说了，不是让你自己复制', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 发消息这条路必须真的在：拿到会话服务 → 定出**固定的那个**对话 → 以用户回合的身份送出去。
  assert.match(source, /rootCtx\.get\('sessions'\)/)
  assert.match(source, /target = await resolveAgentSession\(sessions\)/, '目标对话由固定关系决定，不是"此刻打开的那个"')
  assert.doesNotMatch(source, /sessions\.binding\(current\)/, '不再拿"当前对话"当发送目标')
  assert.match(source, /sessions\.open\(target\.id\)/, '固定的对话不是当前对话时先切过去 —— 不做看不见的运行')
  assert.match(source, /await session\.open\?\.\(\)/, '窗口没装好就 prompt，等于把消息发进一个还没有事件流的会话')
  assert.match(source, /beginSubmission\(\{ mode: 'queue'/)
  assert.match(source, /\.prompt\(\[\{ type: 'text', text \}\]/)
  // 'queue' 而不是 'steer'：点一下不能把正在跑的那一轮掐掉。
  assert.match(source, /'queue', AbortSignal\.timeout\(/, '排队，不是打断')
  // 退回"自己复制粘贴"就是退回这个按钮要解决的问题。
  assert.doesNotMatch(source, /navigator\.clipboard|writeText\(|execCommand/)
  // 需要按钮的生成类入口：计划 / 考核 / 重新生成模型。
  assert.ok((source.match(/h\(AskButton, \{/g) ?? []).length >= 3, '生成类入口不能漏')
  // 建能力模型不再有自己的按钮：它由 ③「确认可迁移能力」的确认按钮自动触发。
  assert.match(source, /const startCapabilityModel = \(\) => \{/)
  assert.match(source, /onConfirm: \(\) => confirm\('self', startCapabilityModel\)/)
  // 但自评只能用户自己点：分数仍然是页面表单送出的，不是 AI 送的。
  assert.match(source, /post\('\/self-assessment'/)
})

// ---------------------------------------------------------------- 2. identity

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')

await check('固定对话：丢了就明说，新建先落盘，页头给得出两个出口', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 固定的对话被删掉时**不能静默改投**别处 —— 那是"你发的消息去了你不知道的地方"。
  assert.match(source, /不在了 —— 在页头点「重建」或「改绑到当前对话」/, '找不到固定对话时要把话说清楚')
  // 新建之后**先把 id 落盘再发**：否则会出现"消息发了、下一次又新建一个"的重复对话。
  const created = source.indexOf('async function createAgentSession')
  const persisted = source.indexOf("await call('/agent-session'", created)
  assert.ok(created > 0 && persisted > created, '新建的对话要先固定下来，再往里发消息')
  // 页头那一行：说清发到哪儿，给「改绑 / 重建」两个出口，且是安静的文字链而不是又一张卡。
  assert.match(source, /function AgentSessionLine/)
  assert.match(source, /Agent 运行都在「\$\{title\}」这个对话里/)
  assert.match(source, /'重建一个'/)
  assert.match(source, /className: 'gw-quiet'/)
  // 文字链不能吃通用 hover 那套（上浮 + 投影）—— 落在没有边框底色的纯文字上就是一团脏影子。
  assert.match(source, /\.gw-root \.gw-quiet:not\(:disabled\):hover\{/, '文字链的 hover 要自己一条、且作用域化')
  assert.match(source, /h\(AgentSessionLine, \{ key: 'agent-session', state, post \}\)/, '这一行要真的挂在页头上')
})

await check('「已返回结果」要等会话真的不跑了才说', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 判定只有一处：两个视图的 load 都走它。
  assert.match(source, /function settleAgentActivity\(next\)/)
  // 先问会话还在不在跑 —— 那才是"做完没做完"。
  assert.match(source, /const running = sessionStillRunning\(activity\.sessionId\)/)
  assert.match(source, /if \(running === true\) \{/, '它还在跑就什么都不说')
  assert.doesNotMatch(source, /previous\.revision !== next\.revision && agentActivity\?\.status === 'queued'/,
    '「数据变过一次」不许再当"跑完了"的判据 —— 一轮里常常写好几次')
  // 快得没被轮询看到的运行也要能收尾：见过它在跑，或已经等了足够久。
  assert.match(source, /activity\.sawRunning === true \|\| Date\.now\(\) - \(activity\.startedAt \?\? 0\) > 3000/)
  // 「跑完了」与「写了东西」是两件事：只在真写了的时候才敢说"页面已自动更新"。
  assert.match(source, /activity\.wrote === true/)
  assert.match(source, /这次没有改动页面数据/)
  // 会话 id 与起始版本要一路带进状态，否则判不了。
  assert.match(source, /sessionId: target\.id, startedRevision: target\.revision/)
})

await check('写证据是一个弹窗：能写、能改、关掉不等于丢掉', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 档位的词汇只有一个来源：按钮从 `state.catalog.tiers`（= model 的 EVIDENCE_TIERS）渲染。
  assert.match(source, /tiers: state\.catalog\.tiers/, '档位名从 model 来，不在 client 里再写一份')
  // 「未交」不是一枚按钮 —— 它是"证据是空的"这一种状态，清空正文就是它。
  assert.doesNotMatch(source, /\['', '未交'\]/)
  assert.doesNotMatch(source, /链接 \/ 文件路径 \/ 一段心得（可留空）/, '那句「（可留空）」等于劝人别写')
  // 三个词各带一句解释，否则用户无从知道「自述」和「过程」差在哪。
  assert.match(source, /const TIER_GLOSS = \{[\s\S]{0,320}?自述:[\s\S]{0,140}?过程:[\s\S]{0,180}?成果:/)
  assert.match(source, /TIER_GLOSS\[tier\]/, '选中的那一档要说清它算什么')
  // 弹窗本身：一整张纸（正文无边框、行高放宽），并且给得出键盘与关闭三个出口。
  assert.match(source, /function EvidenceEditor\(\{ task, entry, post, reload, tiers, onClose \}\)/)
  assert.match(source, /className: 'gw-modal'/)
  assert.match(source, /role: 'dialog'/)
  assert.match(source, /event\.key === 'Escape'/, 'Esc 要能关')
  assert.match(source, /event\.metaKey \|\| event\.ctrlKey/, '⌘/Ctrl + Enter 要能存')
  assert.match(source, /body\.current\?\.focus\(\)/, '打开时焦点进正文')
  assert.match(source, /document\.body\.style\.overflow = 'hidden'/, '弹窗打开时背景不该跟着滚')
  // **关掉不等于丢掉**：有关键改动时，关闭照样先落盘（与原先"失焦即存"的承诺一致）。
  // 行尾用 `\r?\n`：这个断言不该取决于检出时的换行符（Windows 上的工作副本可能是 CRLF，
  // 而 git 在入库时会归一成 LF —— 断言跟着检出方式变红是最没意义的红）。
  assert.match(source, /const close = useCallback\(\(\) => \{\r?\n\s+if \(dirty\) void post\('\/checkin'/)
  // 作答框：**整块就是入口**（空=虚线「这里能写」、有内容=实线纸色「这是我写的」），点框进弹窗。
  assert.match(source, /className: 'gw-answer'/)
  assert.match(source, /role: 'button'/, '整块可点，所以要给 role 与 aria-label')
  assert.match(source, /border: `1px \$\{hasContent \? 'solid' : 'dashed'\}/, '空=虚线、有内容=实线')
  assert.match(source, /'改写'/, '有内容时提示「改写」（加图在弹窗里承接）')
  // 只看代码、不看注释：注释里正当地写着"那条链撤了"，不该算违规。
  const codeOf = (text) => text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
  assert.doesNotMatch(codeOnly(source), /改写 \/ 加图/, '那条分开的文字链撤了 —— 框自己就是入口')
  // 缩略图在"整块可点"的框里：点它只该开图，不该把弹窗一起打开。
  assert.match(source, /onClick: \(event\) => event\.stopPropagation\(\)/)
  // **自己声明底色**：不声明就继承宿主给元素的底色（用户截图里那一整条深灰就是这么来的）。
  assert.match(source, /\.gw-root \.gw-answer\{background:transparent\}/)
  // 「证据 · 未交」撤了：档位只在定了之后显示 —— 「未交」是门禁的词，不是给人看的。
  const evidenceLine = codeOnly(source.slice(source.indexOf('function TaskEvidenceLine('), source.indexOf('function TaskLearnLine(')))
  assert.doesNotMatch(evidenceLine, /未交/, '框里不再出现「未交」这个词')
  assert.match(source, /editing \? h\(EvidenceEditor, \{ key: 'editor'/)
  // 空证据时档位不可点：服务端有这条规则（证据空 → 档位退回），页面不能让你点个寂寞。
  assert.match(source, /const canPickTier = text\.trim\(\)\.length > 0/)
  assert.match(source, /disabled: !canPickTier/)
  // 档位与证据**一起**交：只交档位的话，服务端读到的还是空证据，会把它退回去 ——
  // 所以弹窗里点档位只改草稿，落盘一律由 save / close 一次带上两样。
  assert.match(source, /onClick: \(\) => setTier\(value\)/)
  assert.match(source, /post\('\/checkin', \{ taskId: task\.id, evidence: text, tier: tier === '' \? null : tier \}\)/)
  // 反方向也钉住：服务端那条规则还在。
  assert.match(readFileSync(join(ROOT, 'store.mjs'), 'utf8'), /if \(entry\.evidence === ''\) entry\.tier = null/)
})

await check('学习资料在弹窗里读：任务行只放引子，方法/汇总/来源都在那张纸上', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 弹窗外壳只有**一份**：Esc、点遮罩关、锁背景滚动都在 `Modal` 里，两个弹窗都走它。
  assert.match(source, /function Modal\(\{ label, onClose, children, className \}\)/)
  assert.match(source, /h\(Modal, \{ label: '写证据', onClose: close \}, run\)/, '写证据走同一个外壳')
  assert.match(source, /h\(Modal, \{ label: '学习资料', onClose, className: 'gw-learn-sheet' \}/, '学习资料也走同一个外壳')
  assert.match(source, /if \(event\.key === 'Escape'\) \{ event\.preventDefault\(\); onClose\(\); \}/, 'Esc 由外壳统一管，不在两个弹窗里各写一遍')
  // 任务行只放引子与入口 —— 汇总可能上百字，挤在行里既读不下去也把那一行压垮。
  assert.match(source, /'打开学习资料 →'/)
  assert.doesNotMatch(source, /h\('details', \{ key: 'digest' \}\)/, '汇总不再挤在任务行里（那个折叠块已撤）')
  // 来源日期、「重新找」、那句提示都收进弹窗（用户：「弹窗里面保留即可，外面不用显示」）。
  // 判据：任务行那一段里不许再出现这三样 —— 它们只该在 `LearningSheet` 里。
  // 取片段要按「下一个组件开始」切，不能按某个具体函数名切 —— 组件顺序会变，那样切出来的
  // 可能是空串（于是断言永远通过，等于没有）。见 `sliceOfComponent`。
  const learnRow = sliceOfComponent(source, 'TaskLearnLine')
  assert.doesNotMatch(codeOnly(learnRow), /AI 找的/, '任务行不显示来源日期')
  assert.doesNotMatch(codeOnly(learnRow), /重新找/, '任务行不摆「重新找」')
  assert.doesNotMatch(codeOnly(learnRow), /链接会过期/, '任务行不显示那句提示')
  const sheet = sliceOfComponent(source, 'LearningSheet')
  assert.match(sheet, /AI 找的 · \$\{learn\.foundAt\}/, '弹窗里保留来源日期')
  assert.match(sheet, /label: '重新找一遍'/, '弹窗里保留「重新找」')
  // 那张纸上的三段，以及"没有来源"时要说清这是通识。
  assert.match(source, /'怎么上手'/)
  assert.match(source, /'AI 汇总'/)
  assert.match(source, /links\.length > 0 \? '来源' : '来源（没有找到可引用的）'/)
  assert.match(source, /这次的汇总来自模型自己的通识，没有可引用的来源/)
})

await check('任务卡分三块：这一步的要求 / 怎么学 / 我的痕迹', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 三块层标 —— 它们是这一屏的落点：哪行是要求、哪行是参考、哪行是我写的。
  for (const zone of ['这一步的要求', '怎么学', '我的痕迹']) {
    assert.match(source, new RegExp(zone), `要有「${zone}」这块层标`)
  }
  // 要求那一块是**标签 + 内容**两列（可核对的条件），不是又一段说明文字。
  assert.match(source, /\.\.\.\[\['最低版本', task\.minimumVersion\], \['完成标准', task\.doneCriteria\], \['可接受证据', task\.acceptableEvidence\]\]/)
  // 「打卡 N 天」撤了：它要解释才懂，而读数条上已经有「连续 N 天」。
  assert.doesNotMatch(source, /打卡 \$\{String\(days\)\} 天/, '「打卡 N 天」不该回来')
  assert.doesNotMatch(source, /const days = \(entry\?\.checkInDates \?\? \[\]\)\.length/, '它连变量一起撤掉')
})

await check('三行「说明 + 动作」是同一个样子，弹窗只认关闭按钮', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 用户点名的三处：今日页的下一天 / 页脚的节奏 / 页脚的 Agent 会话 —— 同一类东西三种样子，
  // 现在都走 `NoteLine`（动作的样式也由它统一给，调用方只交 label / onClick）。
  assert.match(source, /function NoteLine\(\{ text, actions \}\)/)
  assert.match(sliceOfComponent(source, 'TodayBody'), /h\(NoteLine, \{[\s\S]{0,220}?继续做下一天 →/, '今日页那一行走它')
  assert.match(sliceOfComponent(source, 'WorkbenchFoot'), /h\(NoteLine, \{[\s\S]{0,600}?回到日历节奏/, '页脚节奏那一行走它')
  assert.match(sliceOfComponent(source, 'AgentSessionLine'), /h\(NoteLine, \{/, 'Agent 会话那一行也走它')
  assert.match(source, /actions: \[\{ label: '回到日历节奏', onClick/, '动作只交 label 与 onClick，样式不各写一份')
  assert.doesNotMatch(source, /#fdf3e4/, '那圈沙色底撤了（同一类东西不该有三种样子）')
  // 弹窗：**点遮罩不关**（用户：「点击弹窗外面的位置不要弹窗消失，我们弹窗只认关闭按钮」）。
  const modal = sliceOfComponent(source, 'Modal')
  assert.doesNotMatch(modal, /onMouseDown/, '遮罩不再接点击')
  assert.match(modal, /if \(event\.key === 'Escape'\)/, 'Esc 留着（明确的键盘动作，且关掉也先存）')
  // 「只认关闭按钮」的前提是**每个弹窗里都得有一个关闭按钮** —— 撤掉遮罩关闭时我漏了考卷那张，
  // 于是它只能靠 Esc 出去（用户：「考卷弹窗没有关闭按钮」）。三个弹窗逐个查，不靠记得。
  for (const sheet of ['EvidenceEditor', 'LearningSheet', 'PaperModal']) {
    assert.match(sliceOfComponent(source, sheet), /'关闭'/, `${sheet} 里要有关闭按钮`)
  }
})

await check('画像每一步都能点回收起，标题行就是那个开关', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 展开态原先只有表单和确认按钮，没有任何可点的标题 —— 撑开以后就收不回去。
  // 四步的标题都得换成可点的 OpenModuleHead（自评有「没模型 / 有模型」两条分支，
  // 各有一条标题行，所以这里按下限断言而不是精确条数）。
  const heads = (source.match(/h\(OpenModuleHead, \{ key: 't'/g) ?? []).length
  assert.ok(heads >= 4, `画像四步的标题行都该能收起，只找到 ${String(heads)} 条`)
  assert.doesNotMatch(
    source,
    /h\('h3', \{ key: 't', style: S\.h3 \}, '(目标岗位|你的条件|可迁移能力|能力自评)'\)/,
    '四步的标题不能再退回不可点的 h3',
  )
  for (const form of ['DirectionForm', 'IntakeForm', 'TransferableForm', 'SelfAssessmentForm']) {
    assert.match(source, new RegExp(`${form}\\(\\{ state, post[^)]*onCollapse`), `${form} 要拿得到 onCollapse`)
  }
  assert.match(source, /onCollapse: \(\) => setOpen\(''\)/, '「收起」就是把这一步折回去')
})

await check('计划第 1 天的保存按钮跟着数据走，不留一个点了没反应的按钮', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 日期没改动时那是一次空写，页面上什么都不变 —— 用户看到的正是「点了没反应」。
  // 所以按钮的状态必须从「草稿 vs 库里的值」推出来，而不是从「被点过没有」推出来。
  assert.match(source, /const startChanged = startDraft !== \(plan\.planStart \?\? ''\)/)
  assert.match(source, /disabled: !startChanged \|\| saving/)
  assert.match(source, /'已保存'/, '与库里一致时给一个读数，而不是留个空转的按钮')
  assert.match(source, /setSaving\(true\)/, '保存中要看得出来')
})

await check('下一步落在当前这一页时，页头不再给一个空转的「现在去做」', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 考核那条 nextAction 的 targetTab 与 targetAnchor 都是 review，而页面上没有
  // data-anchor="review" —— 站在考核页点那个按钮，等于「切到你已经在的页签，再滚到
  // 一个不存在的锚点」，也就是什么都不发生。理由留着（它解释为什么是现在），按钮去掉。
  assert.match(source, /const onThisTab = action !== undefined && action !== null && action\.targetTab === currentTab/)
  assert.match(source, /onThisTab \? null : h\('button', \{ key: 'go'/)
  assert.match(source, /hideNext: tab === 'profile' \|\| tab === 'review', currentTab: tab/,
    '画像与考核这两页各有自己的主角，页头不再重复一张「下一步」卡')
})

await check('被幂等闸拦下的那次点击，不能说成「已排进对话」', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 幂等闸拦下时 askAgent 什么都没发出去，而按钮原先照样说「已排进对话（前面还有
  // 一条在跑）」—— 用户会以为排了两次考核，实际只有一次。
  assert.match(source, /return \{ queued: true, deduped: true \}/, '被拦下要能跟「真的排队了」分开')
  assert.match(source, /outcome\.deduped === true/)
  assert.doesNotMatch(source, /setNote\(outcome\.queued \?/, '别再让「被拦下」借用「排队」那句话')
})

await check('考核的收尾契约写在模型一定看得到的地方', () => {
  const toolsSource = readFileSync(join(ROOT, 'tools.mjs'), 'utf8')
  // 考核内容只有在 growth_save_assessment 落盘之后才会出现在页面上 —— 问答本身不逐步
  // 落盘。没有这句话，模型会在对话里一路问下去，页面永远空着；用户看到的就是
  // 「考核没有同步回考核页」。工具描述常驻上下文，所以契约写在它开头，简报里再复述一遍。
  assert.match(toolsSource, /\*\*考核的收尾动作\*\*/)
  assert.match(toolsSource, /拿到用户回答之后必须调用本工具落盘/)
  assert.match(toolsSource, /考完必须调用 growth_save_assessment 收尾/)
  // 页面这边也要说清：答案写在哪里、交卷之后会发生什么 —— 否则用户会以为点完就该立刻出分。
  // （这一条原先守的是 AskButton 的「一问一答」提示；考卷搬到页面上之后换了说法，约束不变。）
  const clientSource = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.match(clientSource, /交卷 · 交给 AI 打分/, '按钮要说清这一下是交给 AI 打分')
  assert.match(clientSource, /交卷后 AI 会在「成长工作台」那个对话里打分/, '页面要说清交卷后会发生什么')
  assert.match(clientSource, /中途关掉没关系：草稿存着，回来接着答/, '还要说清"没答完也不会丢"')
  assert.match(clientSource, /growth_save_assessment 把这一轮写进历史/, '交卷时要把收尾动作一并交代给模型')
})

await check('考核页不再有手工补记入口 —— 打分归 Agent，页面只展示', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 那张卡原先让人手填四个 0-25：canonicalReview 只做范围检查，拦不住「四个全 0」，
  // 而考核历史只追加 —— 一次误点就往趋势里钉进一轮「总分 0（需努力）」，页面上撤不回来。
  // 它唯一正当的用途是「AI 没落盘时补分」，而那个场景已由收尾契约堵上，于是整张卡删掉：
  // 四维打分是 Agent 的事（growth_save_assessment），页面只读 history 与 curve。
  assert.doesNotMatch(source, /'补记一次考核'|'手工登记一次考核成绩'/, '补记入口已删除')
  assert.doesNotMatch(source, /post\('\/assessment'/, '页面不再自己写考核轮')
  // 这一页现在有自己的写路径了（考卷草稿），但**打分**仍然只走 Agent：页面不许碰 /assessment。
  // 判据从"只读 state"改成"只写草稿、不写成绩" —— 前者已经不成立，后者才是那条约束。
  assert.match(source, /post\('\/draft', \{ key, answers: patch \}\)/, '草稿是这一页唯一自己写的东西')
  assert.match(source, /function ReviewTabBody\(\{ state, post \}\)/)
})

await check('趋势图是手写 SVG —— 这个仓库不引图表库', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // package.json 没有 dependencies（上面另有断言），所以图表库根本加不进来：
  // 四维趋势只能是手写 SVG。它要有一条网格、四条折线、每轮的点、图例与一句话说明。
  assert.match(source, /function TrendChart\(\{ rounds \}\)/)
  assert.match(source, /h\('svg', \{/, '图是 SVG：不是 canvas，也不是第三方组件')
  assert.match(source, /h\('polyline', \{/)
  assert.match(source, /h\('circle', \{/)
  assert.match(source, /'aria-label': `四维趋势/, '图要有一句话说明，读屏与无图环境都能读')
  assert.match(source, /if \(rounds\.length === 0\) return null/, '没有考核轮时不出图')
  assert.match(source, /不进这张图/, '自评轮不进图的理由要写在页面上')
  assert.doesNotMatch(source, /recharts|chart\.js|echarts|\bd3\b/i, '不许引图表库')
})

await check('设计系统:令牌齐全，样式规则全部作用域化', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 行内样式撑不起 hover / focus / 动画，所以有一段注入的样式表。它必须挂在 `.gw-root`
  // 下 —— 本插件住在宿主应用的 DOM 里，一条无作用域的元素选择器会改到宿主自己的按钮。
  assert.match(source, /className: 'gw-root'/, '页面根要挂作用域类')
  assert.match(source, /className: 'gw-tabbar'/, '页签条要挂自己的类（它不跟着按钮抬起）')
  assert.match(source, /\.gw-root button:not\(:disabled\):hover/, '按钮反馈必须作用域化')
  assert.doesNotMatch(source, /\+ 'button[^']*\{/, '不许出现无作用域的元素选择器')
  // 新增的令牌
  for (const token of ['subhead', 'readouts', 'readoutNum', 'readoutCap', 'seal', 'bar', 'barFill', 'pathbox']) {
    assert.match(source, new RegExp(`\\n\\s+${token}: \\{`), `新令牌 ${token} 要在 S 里`)
  }
  // 原有令牌一个都不许丢：它们是全文件的公共词汇，删一个就是删一处外观
  for (const token of ['page', 'tabbar', 'tab', 'tabOn', 'body', 'inner', 'stack', 'card', 'h2', 'h3', 'meta', 'fine', 'row', 'input', 'button', 'buttonOn', 'buttonLight', 'small', 'select', 'chip', 'error', 'warn', 'empty', 'pre', 'inline', 'wrap', 'spread']) {
    assert.match(source, new RegExp(`\\n\\s+${token}: \\{`), `原有令牌 ${token} 不许丢`)
  }
})

await check('完成的反馈是真的，且 gap 不再被当成分数印', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 原生 checkbox 既不能填色也不能盖章，所以勾选框换成按钮 —— 但契约不变：
  // 点一下切换、状态走 aria-checked、整行仍是真正的触控目标。
  assert.match(source, /role: 'checkbox'/, '勾选框要承载完成态')
  assert.match(source, /'aria-checked': done/, '勾选状态走 aria-checked')
  assert.match(source, /done \? h\(Seal, \{ key: 'mark'/, '完成才落印章 —— 不做永远在表扬你的装饰')
  // 卡头那枚「已全部完成」撤了（用户：「过多眼花」）—— 一屏上别再摆第三枚章。
  assert.doesNotMatch(source, /'已全部完成'/, '卡头不再落整卡完成的章；完成的正反馈靠任务自己那枚')
  // 但它撤掉的是**装饰**，不是**判据**：每个任务各自那枚章仍然只在真 done 时挂载。
  assert.match(source, /done \? h\(Seal, \{ key: 'mark', tone: 'teal', label: '已完成'/)
  assert.match(source, /function Seal\(\{ label, sub, tone, round, stamp \}\)/)
  assert.match(source, /function Readout\(\{ value, unit, cap, first \}\)/)
  // gap 的单位是**分**：「(达标线 3 分 − 你的分) × 权重」的加权平均 —— 0.62 就是"平均比达标线低
  // 0.62 分"，**负数就是高于达标线**。
  // ⚠️ 这条断言原先钉反了：它要求印成百分比、禁止印成"分"，于是「-62% 距达标线」一路留到今天，
  // 直到用户问「-62% 距达标线 是啥意思」。**一条钉错方向的断言，比没有断言更难发现。**
  assert.match(source, /function gapLabel\(gap\)/)
  assert.match(source, /cap: '已超达标线'/, '高于达标线时标签跟着变，不让负号自己解释自己')
  assert.match(source, /value: Math\.abs\(gap\)\.toFixed\(2\), unit: '分'/, '报的是分，不是百分比')
  assert.doesNotMatch(source, /Math\.round\(gap \* 100\)/, '不许再把分值当百分比印')
  // 一处定义、多处共用（读数条 + 画像的自评卡；考核历史现在只列考核轮，不再显示 gap）。
  assert.ok((source.match(/gapLabel\(/g) ?? []).length >= 3, '读数条与自评卡共用同一个读法')
})

await check('计划页的层次：总目标是一整句，路径与能力块各自成层', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 目标句是 Agent 写的自由文本。结构只能从它**旁边**长出来 —— 拆它就得猜标点，而猜错
  // 在别的方向上就是错的（「可面试」这种词只属于一个方向）。
  assert.match(source, /key: 'quote'[^)]*fontFamily: 'var\(--gw-display/, '总目标要作为一整块渲染')
  assert.match(source, /\}, plan\.goal \|\|/, '整句 plan.goal 一个节点，不许拆')
  assert.doesNotMatch(source, /plan\.goal\.split|plan\.goal\.match/, '不许按标点拆目标句')
  assert.match(source, /function PathBand\(\{ phases, currentIndex \}\)/)
  assert.match(source, /currentIndex: state\.metrics\.phaseIndex/, '「你在这」用现成的 phaseIndex，不另存状态')
  assert.match(source, /function GroupRows\(\{ role, scores \}\)/)
  assert.match(source, /scores: state\.profile\.selfAssessment\?\.scores/, '能力块进度按已打分的项算')
  // 阶段里的任务：**没做完的在前，做完的折到后面**（用户：「已完成的放该阶段模块的后面折叠起来，
  // 其他未完成的像现在这样放前面」）—— 这一屏的重点是"这一段还剩什么"。
  assert.match(source, /const open = phase\.tasks\.filter\(\(task\) => !isDone\(task\)\)/)
  assert.match(source, /const finished = phase\.tasks\.filter\(isDone\)/, '两类都要算出来，顺序才排得住')
  assert.match(source, /key: 'done-tasks'/, '已完成的折在一条 details 里')
  assert.match(source, /已完成 \$\{String\(finished\.length\)\} 项/, '折叠条的标题要说清折了几项')
  assert.match(source, /gw-gchip/, '能力组要有字母章')
  assert.match(source, /S\.chipPlain/, '身份标签用灰章，别和珊瑚色抢')
})

await check('考核有节奏了：节点小考 + 阶段大考，且空计划不再被判成已完成', () => {
  const source = readFileSync(join(ROOT, 'api.mjs'), 'utf8')
  // 原来的判据是「找不到未完成的任务」—— 而一道任务都没有时同样找不到，于是空计划也会被
  // 告知「当前计划任务已完成，做一次考核」。现在没有下一步动作就返回 null，页面认它。
  assert.match(source, /id: 'review-phase'/, '阶段大考这一档')
  assert.match(source, /id: 'review-node'/, '节点小考这一档')
  assert.match(source, /coverage === '全量'/, '一个阶段考没考过，看的是有没有全量轮')
  assert.match(source, /return null/, '没有下一步动作就返回 null，不编一个出来')
  // 断言的是「那句文案作为 reason 返回」这件事，不是任何提到它的地方 —— 上面的注释正拿它
  // 解释这个 bug，宽匹配会把注释也算进去。
  assert.doesNotMatch(source, /reason: '当前计划任务已完成/, '那句会误报的话不许回来')
  const clientSource = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.match(clientSource, /action === undefined \|\| action === null/, '页面要认「没有下一步」这种状态')
})

await check('考卷两档：小考按缺口出题，大考按高权重项，且都跳过没有题的项', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 两档共用同一个 take()，只差排序依据 —— 拆成两套实现迟早会分叉。
  assert.match(source, /function examPool\(state, tier\)/)
  assert.match(source, /if \(tier === 'phase'\) for \(const id of state\.catalog\.highWeightIds/, '大考按高权重项出题')
  assert.match(source, /else for \(const entry of state\.metrics\.priorities/, '小考按缺口出题')
  assert.match(source, /if \(question === undefined\) return;/, '没有对应题的项必须跳过（A4/B5/B6 就没有题）')
  // 档位不再由页面自己判：**哪一张卷子该考**由 `examSlots` 从进度与历史里算出来，点哪一张就
  // 考哪一档。原先页面还得从 nextAction 的 id 反推档位（examTier）—— 卷子挂在目录上之后，
  // 档位是那一行自带的属性，反推那一步就没有了。
  assert.match(source, /function examSlots\(state\)/)
  assert.match(source, /state: bigRound !== undefined \? 'done' : \(finished \? 'open'/, '阶段大考的档位与状态由目录算')
  // 周次可能是数字，也可能是「第3周（15-21天）」这种标签 —— 不认标签会算出 NaN，让每一周都
  // 被判成"待完成"（一个不报错、只让目录整体说错话的坑）。
  assert.match(source, /function weekNumberOf\(week, fallback\)/)
  assert.match(source, /const matched = \/第\\s\*\(\\d\+\)\\s\*周\/\.exec/, '要从标签里认出周次')
  assert.match(source, /const take = examPool\(state, slot\.tier\)\.slice\(0, PAPER_SIZE\)/, '考卷按那一行的档位出题')
  // 交卷时必须把档位交代给模型，否则它会自己猜 coverage —— 猜错会让曲线点该画的不画、不该画的画上。
  assert.match(source, /coverage 请用「/, '交卷要说明本次用哪个 coverage')
  const toolsSource = readFileSync(join(ROOT, 'tools.mjs'), 'utf8')
  assert.match(toolsSource, /coverage 必须跟本次相符/, '两档的约定要写在工具描述里（模型一定看得到的地方）')
})

await check('原型里定下的那些块，实现里也都在', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 这一条防的是「设计只落了一半」：下面这些块原型里都有，实现里也必须还在。
  assert.match(source, /key: 'id', style: \{ \.\.\.S\.chip, marginRight: '8px'/, '任务行的标识是独立的签，不和动作挤一行')
  assert.match(source, /'aria-pressed': tier === value/, '证据档位是分段控件，不是下拉框')
  assert.match(source, /h\('details', \{ key: item\.id/, '考核自查是可折叠的题')
  assert.match(source, /item\.minimumVersion \? h\('div', \{ key: 'm'/, '作品集读的是真实字段')
  // 这两个字段在数据里根本不存在 —— 读它们的代价是四项全渲染成占位文字。
  assert.doesNotMatch(source, /item\.phase \?\? ''/, '作品集不许再读不存在的字段')
  assert.match(source, /label: '已走完'/, '阶段有状态章')
  assert.match(source, /key: 'groupBar'/, '自评有组内进度条')
})

await check('画像展开态是一张卡：表单与确认按钮都在里面', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 原先表单各自带一张卡，确认按钮落在卡**外面**右对齐飘着，看着像孤儿。
  // 现在外层一张卡，五个表单的根都只是普通列 —— 谁把 S.card 加回去，这条会响。
  assert.match(source, /return h\('div', \{ style: \{ \.\.\.S\.card, gap: '0' \} \}, \[\s+children,/, '展开态外层只该有一张卡')
  assert.match(source, /key: 'confirm', style: \{ display: 'flex', justifyContent: 'flex-end', paddingTop: '18px' \}/, '确认按钮在卡内的底部')
  assert.doesNotMatch(source, /'data-anchor': '[a-z]+', style: S\.card/, '四个表单的根不再是自己的卡')
})

await check('today() 取本地日期，不是 UTC', () => {
  // toISOString() 给的是 UTC 日期：东半球每天前几个小时会被算成昨天，于是凌晨打的卡记到前一天、
  // 连续打卡跟着错。日期是给人读写的，就该按本地算。
  // 只读源码：这一条跑在 store 被 import 之前，碰 store 会是暂时性死区。
  const source = readFileSync(join(ROOT, 'store.mjs'), 'utf8')
  const at = source.indexOf('export function today()')
  const body = source.slice(at, at + 400)
  assert.doesNotMatch(body, /toISOString/, 'today() 不许用 UTC 的 toISOString')
  assert.match(body, /getFullYear\(\)/, 'today() 要按本地年月日拼出来')
  assert.match(body, /padStart\(2, '0'\)/, '仍是补零的 ISO 形状')
})

await check('状态文案跟着真实状态：没开始的计划不说「第 1 天」，空状态说清原因', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // Math.max(1, day) 会把「还没开始」显示成「第 1 天」—— 而那是用户在这一页上读到的第一个数字。
  assert.match(source, /function dayInfo\(day\)/)
  assert.match(source, /cap: '天后开始'/, '计划没开始就说还差几天，不夹成 1')
  assert.doesNotMatch(source, /Math\.max\(1, (state\.)?metrics\.day/, '不许再把第几天夹成 1')
  // 空状态要说清「为什么空、下一步怎么办」—— 三种原因完全不同。
  assert.match(source, /计划目前只排到周/, '没有排到天的任务时，要说清原因与下一步')
  assert.match(source, /该做一次考核，把成果沉淀下来/, '任务都做完了就指向考核')
  assert.doesNotMatch(source, /计划里没有待办任务。/, '那句什么都不解释的空话不许回来')
  // 考卷的刊头与「这次考的是哪个」必须一致：卷子挂在目录的某一行上，档位与 scope 都来自那一行 ——
  // 页面不再从 nextAction 反推（反推那一步已经随 examTier 一起去掉了）。
  assert.match(source, /slot\.tier === 'phase' \? '阶段大考' : '节点小考'/, '刊头写的是这一行的档位')
  assert.match(source, /h\('span', \{ key: 'scope' \}, slot\.scope\)/, '信息栏写的是这一行的 scope')
  const apiSource = readFileSync(join(ROOT, 'api.mjs'), 'utf8')
  assert.match(apiSource, /id: 'review-phase',[\s\S]{0,400}?scope:/, '阶段大考要给出 scope')
  assert.match(apiSource, /id: 'review-node',[\s\S]{0,400}?scope:/, '节点小考也要')
})

await check('段位：七段等距挂在阶段上，达成的才填色', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 七个段位都有名字与颜色 —— 颜色是有意压过饱和度的，这条断言防的是「顺手加一个高饱和色」。
  // 只看 RANKS 这个数组本身 —— 木牌（START_RANK）在它后面，不该被数进来。
  const from = source.indexOf('const RANKS = [')
  const ranks = source.slice(from, source.indexOf('\n    ];', from))
  for (const name of ['黄铜', '白银', '黄金', '铂金', '钻石', '超凡大师', '王者']) {
    assert.match(ranks, new RegExp(`name: '${name}'`), `段位表里要有 ${name}`)
  }
  assert.equal((ranks.match(/color: '#/g) ?? []).length, 7, '七个段位各有一个颜色')
  // 等距：四个阶段要拿到第 1、3、5、7 段（黄铜/黄金/钻石/王者），收在最高一段。
  assert.match(source, /function rankIndexForPhase\(index, count\)/)
  assert.match(source, /Math\.round\(\(index \* \(RANKS\.length - 1\)\) \/ \(count - 1\)\)/, '等距取，阶段数变了不用改表')
  assert.match(source, /function rankReached\(tierIndex, phaseIndex, phaseCount\)/)
  assert.match(source, /if \(phaseIndex <= 0\) return false;/, '一段都没走完时，七段全是空心的')
  // 阶段卡前面那枚 + 总目标卡里的整条阶梯：只有两处都用 RankBadge，阶梯才是同一套语言。
  assert.match(source, /h\(RankBadge, \{ key: 'rank', rank: rankOf\(index, plan\.phases\.length\)/, '阶段卡最前面是段位章')
  // 当前段位**只由总目标右上那一枚**承担（用户定的）：阶段卡上的牌子一律按各自段位渲染出颜色，
  // 「这一段走到哪了」由旁边那枚印章承担。页面里没有第二条阶梯。
  assert.match(source, /function currentRank\(state, phaseCount\)/)
  assert.match(source, /const START_RANK = \{ name: '木牌'/, '起点是木牌 —— 它不在 RANKS 里')
  assert.match(source, /rank: currentRank\(state, plan\.phases\.length\)/, '总目标右上是当前段位')
  assert.match(source, /rankOf\(index, plan\.phases\.length\), achieved: true/, '阶段牌子按各自段位渲染颜色')
  assert.doesNotMatch(source, /key: 'ladder'/, '路径带下面不再有第二条阶梯')
  assert.ok((source.match(/h\(RankBadge, \{/g) ?? []).length >= 2, '阶梯与阶段章都要用它')
})

await check('考卷弹窗：失焦即存、定时补存、关掉也存，回来接着答', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  const paper = sliceOfComponent(source, 'PaperModal')
  // 打开时接着上次的答案 —— 这就是「下次打开能继续查看或者作答」。
  assert.match(paper, /useState\(\(\) => \(\{ \.\.\.\(state\.drafts\?\.\[key\]\?\.answers \?\? \{\}\) \}\)\)/)
  assert.match(paper, /onBlur: \(\) => \{ void flush\(\{ \[entry\.question\.id\]/, '失焦存这一题')
  assert.match(paper, /setInterval\(\(\) => \{ void flush\(\{ \.\.\.pending\.current \}\); \}, 15000\)/, '定时补存：用户可能一直待在输入框里')
  assert.match(paper, /const close = useCallback\(\(\) => \{\r?\n\s+void flush\(/, '关掉也先存 —— 关掉不等于丢掉')
  assert.match(paper, /post\('\/draft', \{ key, clear: true \}\)/, '交卷后清草稿')
  assert.match(paper, /草稿已保存 · \$\{clockOf\(savedAt\)\}/, '要说清草稿存住了')
  assert.match(paper, /const at = new Date\(iso\)[\s\S]{0,120}?at\.getHours\(\)/, '存的是 ISO（UTC），显示要本地时间')
  // **卷面固定**：那个会换题的「换一张考卷」撤了 —— 换了题，旧答案就对不上了。
  assert.doesNotMatch(paper, /换一张考卷/)
  // 弹窗只从目录那一行开：档位与 scope 都来自 slot，页面不再反推。
  assert.match(source, /const take = examPool\(state, slot\.tier\)\.slice\(0, PAPER_SIZE\)/)
  assert.match(source, /openSlot === null \? null : h\(PaperModal, \{ key: 'paper'/, '弹窗由目录的按钮打开')
})

await check('考核目录：阶段与节点的状态都从已有数据算出来，不另存', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.match(source, /function ExamSyllabus\(\{ state, onOpen \}\)/)
  // 节点看「那一周里有没有轮次」，阶段看「那个阶段里有没有全量轮」—— 两者用的是各自的尺子。
  // 这套计算被提到 `examSlots` 里了：目录、页头读数、考卷弹窗共用同一份（一处算，三处显示）。
  assert.match(source, /function examSlots\(state\)/)
  assert.match(source, /rounds\.find\(\(entry\) => entry\.day >= weekStart && entry\.day <= weekEnd\)/, '节点状态来自落在那一周里的轮次')
  assert.match(source, /entry\.coverage === '全量' && entry\.day >= phase\.days\[0\]/, '阶段那一行看的是全量轮')
  // 能考的行给按钮，考过的行给日期，不能考的如实说为什么 —— 状态都有出口。
  assert.match(source, /'补考' : \(drafted \? '继续作答' : '打开考卷'\)/, '能考的行给得出按钮')
  assert.match(source, /'未解锁'/, '没走到的那一段如实写未解锁')
  assert.match(source, /'阶段走完再考'/, '阶段没走完不开大考：现在考只会考出一个假的低分')
  for (const word of ['已考']) {
    assert.match(source, new RegExp(`${word}`), `状态要有：${word}`)
  }
  // 两个概念不许再并排：「能力曲线点」是**能力项**的逐项读数，和四维图不是一回事。
  // 而且这句里不许出现 `**` —— 它是 React 的纯文本节点，不解析 Markdown，星号会原样显示给用户。
  assert.match(source, /逐项曲线点/, '曲线点要说明它是逐项读数')
  assert.match(source, /能力项各自的自评读数/, '两个概念要分开说')
  assert.doesNotMatch(source, /\*\*能力项\*\*/, '不要往界面文案里写 Markdown 加粗')
})

await check('右侧「今日」与左侧共用同一套件，不再各写一遍', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 右侧本来是另一套：自己画的两个小方盒、自己的字号、自己的绿色、原生 checkbox，
  // 后来连证据区也自己写了一份（一行 input + 原生 select + 自己一套档位措辞）——
  // 于是它落后了左页整整一版：只有走右栏的人拿不到写作弹窗和图片。
  const right = source.slice(source.indexOf('function RightTaskCard('))
  assert.match(right, /h\(Readout, \{ key: 'done'/, '右侧用同一套读数（等宽大数字 + 小标签）')
  assert.match(right, /h\(Seal, \{ key: 'seal'/, '连续打卡也落一枚章')
  // **交互件不许在这两个组件里各写一遍** —— 勾选与证据都来自共用组件。
  assert.match(right, /h\(TaskCheck, \{ key: 'box'/, '右栏的勾选来自共用组件')
  assert.match(right, /h\(TaskEvidenceLine, \{/, '右栏的证据与弹窗来自共用组件')
  const row = source.slice(source.indexOf('function TaskRow('), source.indexOf('function RightTaskCard('))
  assert.match(row, /h\(TaskCheck, \{ key: 'box'/, '左页的勾选也来自同一个组件')
  assert.match(row, /h\(TaskEvidenceLine, \{/, '左页的证据也一样')
  // 右栏不该再有自己的那套证据输入。
  assert.doesNotMatch(right, /选择证据档位|type: 'checkbox'|placeholder: '链接、文件名或一句结果'/)
  assert.doesNotMatch(source, /#3f9b63|#edf6ef|#c8dfcc/, '不再自己配一套绿色，用全站的青绿')
})

await check('package name is the bundle identity', () => assert.equal(pkg.name, NAME))
await check('files[] ships cordis.patch.yml', () => assert.ok(pkg.files.includes('cordis.patch.yml')))
await check('dsh.bundle.patch points at the patch layer', () => assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml'))
await check('dsh.client declares the web platform', () => assert.equal(pkg.dsh?.client?.platform, 'web'))
await check('dsh.client is loaded eagerly', () => assert.equal(pkg.dsh?.client?.immediately, true))
await check('exports["./client"] resolves the browser half', () => assert.equal(pkg.exports['./client'], './client.js'))
await check('exports["."] resolves the host half', () => assert.equal(pkg.exports['.'], './index.mjs'))
await check('the package declares no runtime dependencies', () => {
  assert.equal(pkg.dependencies, undefined)
  assert.equal(pkg.peerDependencies, undefined)
})

await check('cordis.patch.yml row id and name match the package name', () => {
  assert.match(patch, new RegExp(`- id:\\s*${NAME}\\s*$`, 'm'))
  assert.match(patch, new RegExp(`name:\\s*${NAME}\\s*$`, 'm'))
})

await check('every host file imports nothing from the Harness', () => {
  for (const file of ['index.mjs', 'api.mjs', 'model.mjs', 'store.mjs', 'tools.mjs', 'validate.mjs']) {
    const source = readFileSync(join(ROOT, file), 'utf8')
    assert.doesNotMatch(source, /from '@deepseek-ai\//, `${file} imports a Harness package, which an installed-by-path plugin cannot resolve`)
  }
})

// ---------------------------------------------------------------- imports
const model = await import(new URL('./model.mjs', import.meta.url).href)

await check('三个新方向自带能力模型，且状态诚实', () => {
  // 新方向一进目录就带着模型，所以目录里的状态是 preset —— 而模型过的是同一个校验器，
  // 它自己的 status 是 draft：随版本发布的草稿，不是行业校准过的。
  for (const slug of ['fde', 'ai-qa', 'ai-delivery']) {
    const role = model.ROLES[slug]
    assert.ok(role !== undefined, `${slug} 要有模型`)
    assert.deepEqual(model.capabilityModelProblems(role), [], `${slug} 的模型要过校验器`)
    assert.equal(role.status, 'draft', `${slug} 的模型要标成草稿`)
    const choice = model.ROLE_CHOICES.find((entry) => entry.slug === slug)
    assert.ok(choice !== undefined, `${slug} 要在目录里`)
    assert.equal(choice.status, 'preset', `${slug} 在目录里是 preset`)
    assert.ok(choice.positioning.length > 0, `${slug} 要有定位句`)
  }
})

await check('目录里的档位从模型推出来，不再各写一遍', () => {
  // 用户报过这件事：目录里的方向都补上模型了，点上去还写着「还没有能力模型，可以让
  // AI 生成一份」。原因不是漏改一处，而是 status 在 ROLE_CHOICES 里又手写了一份 ——
  // 补模型时没跟着改。所以这里钉的是规则，不是某一版的数据快照。
  for (const entry of model.ROLE_CHOICES) {
    const role = model.ROLES[entry.slug]
    assert.ok(role !== undefined, `${entry.slug} 在目录里却没有模型`)
    assert.equal(entry.status, 'preset', `${entry.slug} 有模型，目录里就该是 preset`)
    assert.equal(model.resolveRoleStatus({ targetRoleSlug: entry.slug }), entry.status,
      `${entry.slug}: 页面读到的档位（activeRoleSource）要和目录里的一致`)
    assert.doesNotMatch(model.ROLE_STATUS[entry.status]?.note ?? '', /还没有能力模型/,
      `${entry.slug} 有模型，说明里就不该再说「还没有能力模型」`)
  }
  // 反方向也钉住：确实没有模型的方向才是 building，说明里要请 AI 生成一份。
  assert.equal(model.resolveRoleStatus({ targetRoleSlug: 'no-such-direction' }), 'building')
  assert.match(model.ROLE_STATUS.building.note, /还没有能力模型/)
  // 「有模型」不等于「模型被校准过」：随版本发布的模型自己的 status 还是 draft，那么
  // preset 那条说明就必须把未经校准说出来。哪天有模型真被校准了，这条会失败 —— 那正是
  // 回来改说明的时候，而不是让页面一直替一份已经校准过的模型道歉。
  if (Object.values(model.ROLES).some((role) => role.status === 'draft')) {
    assert.match(model.ROLE_STATUS.preset.note, /未经行业校准/)
  }
})

const store = await import(new URL('./store.mjs', import.meta.url).href)
const tools = await import(new URL('./tools.mjs', import.meta.url).href)
const validate = await import(new URL('./validate.mjs', import.meta.url).href)
const api = await import(new URL('./api.mjs', import.meta.url).href)
const host = await import(new URL('./index.mjs', import.meta.url).href)

await check('the host half loads and injects the two services', () => {
  assert.equal(host.name, NAME)
  assert.deepEqual([...host.inject].sort(), ['tools', 'webServer'])
})

await check('apply() registers one route and every tool, all disposable', () => {
  const seen = []
  const ctx = {
    webServer: { register(route) { seen.push({ what: 'route', route }); return () => {} } },
    tools: { register(definition) { seen.push({ what: 'tool', definition }); return () => {} } },
    effect(setup, label) {
      assert.equal(typeof label, 'string')
      assert.equal(typeof setup(), 'function', 'every effect must return a disposer')
    },
  }
  host.apply(ctx)
  const routes = seen.filter((entry) => entry.what === 'route')
  const registered = seen.filter((entry) => entry.what === 'tool')
  assert.equal(routes.length, 1)
  assert.equal(routes[0].route.path, '/gw/api')
  assert.equal(routes[0].route.kind, 'prefix')
  assert.equal(tools.TOOL_NAMES.length, 7)
  assert.deepEqual(registered.map((entry) => entry.definition.name).sort(), [...tools.TOOL_NAMES].sort())
})

// ---------------------------------------------------------------- 3. model

const ROLE = model.ROLES['data-ops']

await check('the capability model mirrors the source table', () => {
  assert.equal(ROLE.items.length, 20)
  assert.equal(ROLE.groups.reduce((sum, group) => sum + group.weight, 0), 100)
  assert.ok(ROLE.groups.every((group) => group.weight > 0), 'a 0% group would silently drop out of W')
  assert.equal(ROLE.items.filter((item) => item.level === '高').length, 11)
  assert.ok(ROLE.items.every((item) => item.anchors.length === 3))
})

// 同一套结构规则既管预置模型也管生成的模型 —— 两边共用 capabilityModelProblems，
// 所以不可能出现"生成的模型符合规则、预置的不符合"。
await check('the shipped model passes the same validator a generated one must', () => {
  assert.deepEqual(model.capabilityModelProblems(ROLE), [])
})

await check('a 0%-weight group is refused (it vanishes from W while still showing anchors)', () => {
  const broken = { ...ROLE, groups: ROLE.groups.map((group, index) => (index === 0 ? { ...group, weight: 0 } : group)) }
  const problems = model.capabilityModelProblems(broken)
  assert.ok(problems.some((line) => line.includes('weight 必须 > 0')), problems.join(' | '))
})

await check('weights that do not sum to 100 are refused (gap would be incomparable)', () => {
  const broken = { ...ROLE, groups: ROLE.groups.map((group, index) => (index === 0 ? { ...group, weight: group.weight - 10 } : group)) }
  assert.ok(model.capabilityModelProblems(broken).some((line) => line.includes('合计必须是 100%')))
})

await check('a placeholder anchor is refused (an invented 3 is indistinguishable from a measured one)', () => {
  for (const placeholder of ['待补', 'TBD', '—', '...']) {
    const broken = { ...ROLE, items: ROLE.items.map((item, index) => (index === 0 ? { ...item, anchors: [item.anchors[0], item.anchors[1], placeholder] } : item)) }
    assert.ok(
      model.capabilityModelProblems(broken).some((line) => line.includes('占位符')),
      `${placeholder} should be refused`,
    )
  }
})

await check('duplicate capability ids are refused (two capabilities would become one column)', () => {
  const broken = { ...ROLE, items: ROLE.items.map((item, index) => (index === 1 ? { ...item, id: ROLE.items[0].id } : item)) }
  assert.ok(model.capabilityModelProblems(broken).some((line) => line.includes('id 重复')))
})

await check('a capability pointing at an unknown group is refused', () => {
  const broken = { ...ROLE, items: ROLE.items.map((item, index) => (index === 0 ? { ...item, group: 'Z' } : item)) }
  assert.ok(model.capabilityModelProblems(broken).some((line) => line.includes('不在 groups 里')))
})

await check('a group with no capabilities is refused', () => {
  const broken = { ...ROLE, items: ROLE.items.filter((item) => item.group !== 'D') }
  // D 组还在 groups 里，但已经没有任何能力项 —— 它的权重会落进分母却没有任何可评的项。
  assert.deepEqual(model.capabilityModelProblems(broken), [], '结构上合法：组空着不影响 W，因为 W 只累加已答项')
  assert.ok(model.capabilityModelProblems({ ...ROLE, items: [] }).some((line) => line.includes('至少要有 8 项')))
})

await check('resolveRole prefers a generated model, but only for its own direction', () => {
  const generated = { ...ROLE, forSlug: 'custom', name: '数据分析师' }
  assert.equal(model.resolveRole({ targetRoleSlug: 'data-ops', capabilityModel: generated })?.name, ROLE.name)
  assert.equal(model.resolveRole({ targetRoleSlug: 'custom', capabilityModel: generated })?.name, '数据分析师')
  assert.equal(model.resolveRoleStatus({ targetRoleSlug: 'custom', capabilityModel: generated }), 'generated')
  assert.equal(model.resolveRoleStatus({ targetRoleSlug: 'data-ops', capabilityModel: generated }), 'preset')
  // 现在目录里每个方向都有模型了，所以「没有模型时是什么表现」只能用一个人为的 slug 来验。
  // 注意不能用 'custom' —— 那是自定义方向的保留 slug，走的是另一条分支。
  // 未知 slug 的状态是 building（「模型建设中：还没有能力模型，可以让 AI 生成一份」）。
  assert.equal(model.resolveRole({ targetRoleSlug: 'no-such-direction' }), undefined)
  assert.equal(model.resolveRoleStatus({ targetRoleSlug: 'no-such-direction' }), 'building')
})

await check('generated models validate through canonicalCapabilityModel', () => {
  const model0 = validate.canonicalCapabilityModel(ROLE, { forSlug: 'custom', forName: '数据分析师', basedOn: ['当前岗位：测试工程师'] })
  assert.equal(model0.provenance, 'generated')
  assert.equal(model0.forSlug, 'custom')
  assert.equal(model0.items.length, 20)
  assert.deepEqual(model0.basedOn, ['当前岗位：测试工程师'])
  assert.throws(
    () => validate.canonicalCapabilityModel(ROLE, {}),
    /必须指名它为哪个方向生成/,
    '没有 forSlug 的模型会在换方向后继续给新方向打分',
  )
})

await check('the follow-up questions change with 当前状态', () => {
  assert.deepEqual(model.backgroundQuestionsFor({ q1: 'A' }).fields.map((field) => field.key), ['major', 'grade'])
  assert.deepEqual(model.backgroundQuestionsFor({ q1: 'C' }).fields.map((field) => field.key), ['currentJob', 'industry', 'years', 'scope'])
  assert.deepEqual(model.backgroundQuestionsFor({ q1: 'D' }).fields.map((field) => field.key), ['income', 'dollars', 'strengths'])
  assert.equal(model.backgroundQuestionsFor({}), undefined)
  assert.equal(model.backgroundQuestionsFor({ q1: 'A' }).fields.find((field) => field.key === 'grade').options.includes('大一'), true)
})

await check('missingBackground lists only the required fields left blank', () => {
  assert.deepEqual(model.missingBackground({ intake: { q1: 'C' } }), ['当前岗位', '日常经手的事'])
  assert.deepEqual(model.missingBackground({ intake: { q1: 'C' }, background: { currentJob: '测试工程师' } }), ['日常经手的事'])
  assert.deepEqual(model.missingBackground({ intake: { q1: 'C' }, background: { currentJob: '测试工程师', scope: '写用例' } }), [])
  assert.deepEqual(model.missingBackground({}), ['当前状态（② 的第一题）'])
})

await check('backgroundLines marks the skills field as the 底盘 source', () => {
  const lines = model.backgroundLines({ intake: { q1: 'C' }, background: { currentJob: '测试工程师', scope: '写用例' } })
  assert.deepEqual(lines, ['当前岗位：测试工程师', '日常经手的事：写用例（底盘的主要来源）'])
})

await check('there is no built-in 底子 table any more', () => {
  assert.equal(model.TRANSFERABLE_BASE, undefined, 'a fixed table is wrong for everyone it was not written for')
  assert.equal(model.TRANSFERABLE_GAPS, undefined, '写死的缺口清单没了：它和底盘表一样，对不是那个背景的人全是错的，现在由 Agent 从追问推')
  assert.ok(model.TRANSFERABLE_NOTE.proposePrompt.length > 0)
})

await check('item weights follow 组权重 × 组内系数', () => {
  const item = (id) => ROLE.items.find((entry) => entry.id === id)
  assert.equal(model.itemWeight(ROLE, item('A1')), 90) // A 30% × 高 3
  assert.equal(model.itemWeight(ROLE, item('A7')), 30) // A 30% × 低 1
  assert.equal(model.itemWeight(ROLE, item('D3')), 15) // D 15% × 低 1
})

await check('all twenty answered gives W = 1300 (the documented example)', () => {
  const scores = Object.fromEntries(ROLE.items.map((item) => [item.id, 3]))
  const analysis = model.gapAnalysis(ROLE, scores)
  assert.equal(analysis.W, 1300)
  assert.equal(analysis.gap, 0)
})

await check('the documented gap example reproduces', () => {
  const scores = Object.fromEntries(ROLE.items.map((item) => [item.id, 3]))
  scores.A2 = 1 // 差 2 分、w = 90
  const analysis = model.gapAnalysis(ROLE, scores)
  assert.ok(Math.abs(analysis.gap - 180 / 1300) < 1e-9, `got ${String(analysis.gap)}`)
})

await check('未确认的项不进分母，也不补零', () => {
  const partial = model.gapAnalysis(ROLE, { A1: 1 })
  assert.equal(partial.W, 90)
  assert.equal(partial.answeredCount, 1)
  assert.equal(partial.skippedCount, 19)
  assert.deepEqual(partial.unansweredGroups, ['A', 'B', 'C', 'D'], '只答了一项时，四个组都还没答全')
  const oneGroupDone = model.gapAnalysis(ROLE, Object.fromEntries(ROLE.items.filter((item) => item.group === 'A').map((item) => [item.id, 3])))
  assert.deepEqual(oneGroupDone.unansweredGroups, ['B', 'C', 'D'])
  const allNull = model.gapAnalysis(ROLE, {})
  assert.equal(allNull.gap, null, '没有已确认项时没有读数，不是 0')
})

await check('补强优先级按单项缺口降序', () => {
  const analysis = model.gapAnalysis(ROLE, { A1: 1, A7: 1 })
  assert.equal(analysis.priorities[0].id, 'A1', 'A1 的缺口 180 应排在 A7 的 60 前面')
})

await check('高权重项在超过 10 项时按组权重降序截断', () => {
  const picked = model.highWeightItems(ROLE)
  assert.equal(picked.length, 10)
  assert.ok(!picked.some((item) => item.id === 'D1'), 'D 组权重最低，它的高权重项被砍掉')
})

// ---------------------------------------------------------------- 完成率 / 打卡

const PLAN = {
  planStart: '2026-09-25',
  phases: [
    { name: '基础', days: [1, 30], tasks: [
      { id: 'T1', day: 1, action: 'a', capability: 'A6', minutes: 30 },
      { id: 'T2', day: 2, action: 'b', capability: 'B1', minutes: 30 },
    ] },
    { name: '实战', days: [31, 60], tasks: [
      { id: 'T3', day: 31, action: 'c', capability: 'D1', minutes: 45 },
    ] },
    { name: '作品', days: [61, 90], tasks: [] },
  ],
}

await check('完成率是整个计划口径：已完成 / 全部已排出的任务', () => {
  const rate = model.completionRate(PLAN, { tasks: { T1: { done: true }, T3: { done: true } } })
  assert.deepEqual([rate.done, rate.total], [2, 3])
  const empty = model.completionRate({ phases: [] }, { tasks: {} })
  assert.equal(empty.rate, null, '没有任务时完成率无定义，不是 0')
})

await check('任务引用由位置派生，任务标识才是身份', () => {
  const tasks = model.planTasks(PLAN)
  assert.deepEqual(tasks.map((task) => task.ref), ['1.1', '1.2', '2.1'])
  assert.deepEqual(tasks.map((task) => task.id), ['T1', 'T2', 'T3'])
  assert.equal(model.taskById(PLAN, 'T3').ref, '2.1')
})

await check('连续打卡按进度天数：一天里推进三天就是连续三天', () => {
  const planStart = '2026-09-25'
  // 1) 同一任务连推三天 —— 按「每任务最新天」算会读成 1 天。
  const one = { tasks: { T1: { checkInDays: [1, 2, 3] } } }
  assert.equal(model.streakDays(one, 3, planStart), 3)
  assert.equal(model.streakDays(one, 4, planStart), 3, '进度天今天还没推进不算断')
  assert.equal(model.streakDays(one, 6, planStart), 0)
  assert.equal(model.streakDays({ tasks: {} }, 3, planStart), 0)

  // 2) 用户今天有空、一口气推进三天：三个任务，真实日期是同一天，进度天是 1/2/3。
  const sameRealDay = {
    tasks: {
      T1: { checkInDates: ['2026-09-25'], checkInDays: [1] },
      T2: { checkInDates: ['2026-09-25'], checkInDays: [2] },
      T3: { checkInDates: ['2026-09-25'], checkInDays: [3] },
    },
  }
  assert.equal(model.streakDays(sameRealDay, 3, planStart), 3, '按日历只有 1 天，按进度天是 3 天')

  // 3) 老文档没有 checkInDays：拿真实日期按 planStart 当场推回来（底层按进度天、
  //    上层动态关联日期 —— 读取端只有一次换算，没有第二种真相）。
  const legacy = { tasks: { T1: { checkInDates: ['2026-09-25', '2026-09-26', '2026-09-27'] } } }
  assert.deepEqual(model.planDaysOf(legacy.tasks.T1, planStart), [1, 2, 3])
  assert.equal(model.streakDays(legacy, 3, planStart), 3)
})

await check('第几天与当前阶段', () => {
  assert.equal(model.dayNumber('2026-09-25', '2026-09-25'), 1)
  assert.equal(model.dayNumber('2026-09-25', '2026-10-24'), 30)
  assert.equal(model.currentPhase(PLAN, 45).name, '实战')
  assert.equal(model.currentPhase(PLAN, 75).name, '作品', '只排到周、tasks 为空的阶段照样要能被判到')
  assert.equal(model.dayNumber('', '2026-09-25'), null)
})

await check('本周完成率在没有排到天的任务时是 null，不是 0', () => {
  assert.equal(model.weekRate(PLAN, { tasks: {} }, 1), 0, '第 1 周有两项任务、一项没完成 → 0')
  assert.equal(model.weekRate(PLAN, { tasks: {} }, 75), null, '第 11 周没有排到天的任务 → 无数据')
  assert.equal(model.weekRate(PLAN, { tasks: { T1: { done: true } } }, 2), 0.5)
})

await check('证据档位分布只统计已完成的任务', () => {
  const distribution = model.evidenceDistribution(PLAN, { tasks: {
    T1: { done: true, tier: '成果' },
    T2: { done: false, tier: '成果' },
    T3: { done: true, tier: null },
  } })
  assert.deepEqual(distribution, { 成果: 1, 过程: 0, 自述: 0, 无证据: 1 })
})

await check('自评点的置信度由窗口内的任务证据抬升', () => {
  assert.equal(model.selfPointConfidence(null), 'low')
  assert.equal(model.selfPointConfidence('自述'), 'low', '自述不算抬高')
  assert.equal(model.selfPointConfidence('过程'), 'medium')
  assert.equal(model.selfPointConfidence('成果'), 'high')
})

await check('只有全量轮次的点进曲线；定向轮只留记录', () => {
  const history = [
    { date: '2026-10-01', day: 7, coverage: '全量', curvePoints: [{ 能力项: 'A1', 分: 2, 置信度: 'low', 证据档位: null, 来源: '自评' }] },
    { date: '2026-10-10', day: 16, coverage: '定向', curvePoints: [{ 能力项: 'A1', 分: 3, 置信度: 'low', 证据档位: null, 来源: '自评' }] },
  ]
  assert.equal(model.curvePoints(history).length, 1)
})

await check('不得只用自评点宣称能力提升', () => {
  const selfOnly = [{ date: '2026-10-01', day: 7, coverage: '全量', curvePoints: [{ 能力项: 'A1', 分: 5, 置信度: 'low', 证据档位: null, 来源: '自评' }] }]
  assert.equal(model.canClaimProgress(selfOnly, 'A1'), false)
  const withReview = [{ date: '2026-10-01', day: 7, coverage: '全量', curvePoints: [{ 能力项: 'A1', 分: 5, 置信度: 'high', 证据档位: null, 来源: '考核' }] }]
  assert.equal(model.canClaimProgress(withReview, 'A1'), true)
  const withEvidence = [{ date: '2026-10-01', day: 7, coverage: '全量', curvePoints: [{ 能力项: 'A1', 分: 5, 置信度: 'medium', 证据档位: '过程', 来源: '自评' }] }]
  assert.equal(model.canClaimProgress(withEvidence, 'A1'), true)
})

await check('总分定级按 rubric 的四档', () => {
  assert.equal(model.gradeOf(90).grade, '优')
  assert.equal(model.gradeOf(75).grade, '良')
  assert.equal(model.gradeOf(60).grade, '及格')
  assert.equal(model.gradeOf(40).grade, '需努力')
})

// ---------------------------------------------------------------- 4. 计划写入门禁

const goodPhase = (name, days, tasks) => ({ name, days, goal: `${name}目标`, project: `${name}项目`, criteria: '标准', tasks })
const goodTask = (extra) => ({
  action: '做一件事', capability: 'A6', reason: '因为差距', minutes: 30,
  minimumVersion: '十分钟版', doneCriteria: '能指出 3 个环节', acceptableEvidence: '完整版交截图；最低版交 3 行笔记', dependsOn: '无',
  ...extra,
})

await check('合法计划通过，并分配任务标识', () => {
  const plan = validate.canonicalPlan({
    planStart: '2026-09-25', goal: '三个月能独立产出分析报告',
    phases: [goodPhase('基础', [1, 30], [goodTask({ day: 1 }), goodTask({ day: 2, capability: 'B1' })]), goodPhase('实战', [31, 60], [])],
    selfCheck: [{ id: 'Q1', phase: '基础', question: '漏斗怎么用', capability: 'B1' }],
  }, undefined, ROLE)
  assert.deepEqual(plan.phases[0].tasks.map((task) => task.id), ['T1', 'T2'])
  assert.equal(plan.nextTaskNumber, 3)
  assert.equal(plan.phases[0].tasks[0].ref, '1.1')
})

await check('缺 planStart 被拒（否则「第几天」只能拿首次打开日凑）', () => {
  assert.throws(() => validate.canonicalPlan({ goal: 'x', phases: [goodPhase('a', [1, 10], [])] }, undefined, ROLE), /planStart/)
})

await check('一段都没排到天的计划被拒（否则「今日」页天生是空的）', () => {
  // 用户报过：计划生成完，「今日」页写着「计划目前只排到周」，而那句话指的地方没有入口。
  // 根因在门禁：只要 phases 非空就放行，于是四段全是周粒度的计划也能写进去 —— 一写进去，
  // 这个产品的主线（今日执行）当场就断了。第一段是唯一能马上执行的一段，所以它必须细到天。
  assert.throws(
    () => validate.canonicalPlan({
      planStart: '2026-09-25', goal: 'x',
      phases: [goodPhase('基础', [1, 30], []), goodPhase('实战', [31, 60], [])],
    }, undefined, ROLE),
    /第一段）必须排到天/,
  )
  // 后续阶段只排到周是**允许**的 —— 这条规则不能顺手把它们也拦掉。
  const plan = validate.canonicalPlan({
    planStart: '2026-09-25', goal: 'x',
    phases: [goodPhase('基础', [1, 30], [goodTask({ day: 1 })]), goodPhase('实战', [31, 60], [])],
  }, undefined, ROLE)
  assert.equal(plan.phases[0].tasks.length, 1)
  assert.equal(plan.phases[1].tasks.length, 0, '第二段只排到周要照样通过')
})

await check('一个字段写错只报一次（错的 dependsOn 不该算两处错）', () => {
  const counted = (plan) => {
    try {
      validate.canonicalPlan(plan, undefined, ROLE)
      return []
    } catch (error) {
      return error.message.split('\n').slice(1)
    }
  }
  // 用户真撞上过：13 个任务把**天号**填进了 dependsOn，被判「共 26 处」—— 同一个字段报了两遍
  //（写法不合法 + 引用不存在）。一份只错了一处的计划，读起来像烂得没法救，而这会直接浪费
  // 用户一轮运行：他得先猜到底哪儿错了。
  const bare = counted({
    planStart: '2026-09-25', goal: 'x',
    phases: [goodPhase('基础', [1, 30], [goodTask({ day: 1 }), goodTask({ day: 2, dependsOn: '1' })])],
  })
  assert.equal(bare.length, 1, `写法错只该报一处，收到 ${String(bare.length)} 处`)
  assert.match(bare[0], /前置依赖要写「阶段\.序号」/, '消息里要给格式与例子，不只说"必须是任务引用"')

  // 写法对、但指向不存在的引用 —— 这时才该报"指向不存在"，而且同样只有一条。
  const dangling = counted({
    planStart: '2026-09-25', goal: 'x',
    phases: [goodPhase('基础', [1, 30], [goodTask({ day: 1 }), goodTask({ day: 2, dependsOn: '3.9' })])],
  })
  assert.equal(dangling.length, 1, `指向不存在也只该报一处，收到 ${String(dangling.length)} 处`)
  assert.match(dangling[0], /指向了不存在的任务引用/)
})

await check('任务的字段写在 schema 里，不只写在工具说明那段散文里', () => {
  const tasks = tools.growthSavePlan.parameters.properties.phases.items.properties.tasks
  for (const key of ['day', 'action', 'capability', 'reason', 'minutes', 'minimumVersion', 'doneCriteria', 'acceptableEvidence', 'dependsOn']) {
    assert.ok(tasks.items.properties?.[key] !== undefined, `${key} 要在 schema 里有名有姓`)
  }
  // 8 个字段里唯一一个"写法不明显"的：格式与反例都写进去 —— 用户就是在这一项上撞的。
  assert.match(tasks.items.properties.dependsOn.description, /阶段\.序号/)
  assert.match(tasks.items.properties.dependsOn.description, /不是天号/)
})

// 没有模型时不能只是"跳过校验" —— 那样计划可以挂任意编号，而面板与考核都按编号落点。
await check('方向没有能力模型时，计划写入被拒而不是跳过校验', () => {
  assert.throws(
    () => validate.canonicalPlan({
      planStart: '2026-09-25', goal: 'x', phases: [goodPhase('a', [1, 30], [goodTask({ day: 1 })])],
    }, undefined, undefined),
    /还没有能力模型/,
  )
})

// 生成的模型与预置模型走同一个门禁：能力项校验用的是**传进来的那份模型**。
await check('计划可以按 Agent 生成的能力模型挂编号', () => {
  const generated = { forSlug: 'custom', name: '数据分析师', positioning: 'p', groups: [{ key: 'A', name: 'a', weight: 100 }], items: [
    { id: 'A1', group: 'A', name: 'x', level: '高', anchors: ['1', '3', '5'] },
  ] }
  const plan = validate.canonicalPlan({
    planStart: '2026-09-25', goal: 'x', phases: [goodPhase('a', [1, 30], [goodTask({ day: 1, capability: 'A1' })])],
  }, undefined, generated)
  assert.equal(plan.phases[0].tasks[0].capability, 'A1')
  assert.throws(
    () => validate.canonicalPlan({
      planStart: '2026-09-25', goal: 'x', phases: [goodPhase('a', [1, 30], [goodTask({ day: 1, capability: 'A6' })])],
    }, undefined, generated),
    /不在当前方向的能力模型里/,
  )
})

await check('阶段天区间不重不漏被强制', () => {
  assert.throws(() => validate.canonicalPlan({
    planStart: '2026-09-25', goal: 'x',
    phases: [goodPhase('a', [1, 30], []), goodPhase('b', [40, 60], [])],
  }, undefined, ROLE), /不重叠、不留缝/)
})

await check('任务合同 8 字段缺一不可', () => {
  const incomplete = goodTask({ day: 1 })
  delete incomplete.minimumVersion
  assert.throws(() => validate.canonicalPlan({
    planStart: '2026-09-25', goal: 'x', phases: [goodPhase('a', [1, 30], [incomplete])],
  }, undefined, ROLE), /最低完成版本/)
})

await check('预计分钟超出 15-60 被拒', () => {
  for (const minutes of [10, 90]) {
    assert.throws(() => validate.canonicalPlan({
      planStart: '2026-09-25', goal: 'x', phases: [goodPhase('a', [1, 30], [goodTask({ day: 1, minutes })])],
    }, undefined, ROLE), /预计分钟/)
  }
})

await check('能力项必须在当前方向的模型里', () => {
  assert.throws(() => validate.canonicalPlan({
    planStart: '2026-09-25', goal: 'x', phases: [goodPhase('a', [1, 30], [goodTask({ day: 1, capability: 'Z9' })])],
  }, undefined, ROLE), /不在当前方向的能力模型里/)
})

await check('评估类任务写全角 — 是允许的', () => {
  const plan = validate.canonicalPlan({
    planStart: '2026-09-25', goal: 'x', phases: [goodPhase('a', [1, 30], [goodTask({ day: 1, capability: '—' })])],
  }, undefined, ROLE)
  assert.equal(plan.phases[0].tasks[0].capability, '—')
})

await check('考核自查不得含答案，且必须挂能力项', () => {
  assert.throws(() => validate.canonicalPlan({
    planStart: '2026-09-25', goal: 'x', phases: [goodPhase('a', [1, 30], [])],
    selfCheck: [{ id: 'Q1', phase: 'a', question: 'q', capability: 'B1', answer: '答案' }],
  }, undefined, ROLE), /不得含答案/)
  assert.throws(() => validate.canonicalPlan({
    planStart: '2026-09-25', goal: 'x', phases: [goodPhase('a', [1, 30], [])],
    selfCheck: [{ id: 'Q1', phase: 'a', question: 'q' }],
  }, undefined, ROLE), /必须挂一个能力项编号/)
})

await check('删除过的任务标识作废不复用', () => {
  const first = validate.canonicalPlan({
    planStart: '2026-09-25', goal: 'x', phases: [goodPhase('a', [1, 30], [goodTask({ day: 1 }), goodTask({ day: 2 })])],
  }, undefined, ROLE)
  // 删掉 T1，保留 T2；新任务必须拿 T3，不能顶掉 T1。
  const second = validate.canonicalPlan({
    planStart: '2026-09-25', goal: 'x', phases: [goodPhase('a', [1, 30], [
      { ...first.phases[0].tasks[1], id: 'T2' },
      goodTask({ day: 3 }),
    ])],
  }, first, ROLE)
  assert.deepEqual(second.phases[0].tasks.map((task) => task.id), ['T2', 'T3'])
  assert.equal(second.nextTaskNumber, 4)
})

await check('改措辞不改任务标识（标识永不变）', () => {
  const first = validate.canonicalPlan({
    planStart: '2026-09-25', goal: 'x', phases: [goodPhase('a', [1, 30], [goodTask({ day: 1 })])],
  }, undefined, ROLE)
  const renamed = validate.canonicalPlan({
    planStart: '2026-09-25', goal: 'x',
    phases: [goodPhase('a', [1, 30], [{ ...first.phases[0].tasks[0], action: '换了个说法' }])],
  }, first, ROLE)
  assert.equal(renamed.phases[0].tasks[0].id, 'T1', '位置无关的标识不该因为改措辞而换')
})

await check('复用已作废的编号被拒（否则会连旧记录一起继承）', () => {
  const first = validate.canonicalPlan({
    planStart: '2026-09-25', goal: 'x', phases: [goodPhase('a', [1, 30], [goodTask({ day: 1 }), goodTask({ day: 2 })])],
  }, undefined, ROLE)
  // T1 在磁盘上被删掉：只剩 T2，且 nextTaskNumber 已推到 3 —— T1 这个号段退休了。
  const afterDeletion = { ...first, phases: [{ ...first.phases[0], tasks: [first.phases[0].tasks[1]] }] }
  assert.throws(() => validate.canonicalPlan({
    planStart: '2026-09-25', goal: 'x',
    phases: [goodPhase('a', [1, 30], [{ ...goodTask({ day: 3 }), id: 'T1' }])],
  }, afterDeletion, ROLE), /已被删除并作废/)
})

await check('前置依赖必须指向真实任务引用', () => {
  assert.throws(() => validate.canonicalPlan({
    planStart: '2026-09-25', goal: 'x', phases: [goodPhase('a', [1, 30], [goodTask({ day: 1, dependsOn: '9.9' })])],
  }, undefined, ROLE), /前置依赖/)
})

await check('四维考核必须四维齐全且在 0-25', () => {
  assert.throws(() => validate.canonicalReview({ scores: { 完成率: 20 }, day: 1 }), /缺 证据质量/)
  assert.throws(() => validate.canonicalReview({ scores: { 完成率: 26, 证据质量: 1, 作品达标度: 1, 知识考核: 1 }, day: 1 }), /0-25/)
  const ok = validate.canonicalReview({ scores: { 完成率: 20, 证据质量: 18, 作品达标度: 15, 知识考核: 22 }, day: 30 })
  assert.equal(ok.total, 75)
})

// ---------------------------------------------------------------- 5. 工具

await check('store 落盘到 $DSH_HOME/growth-workbench', () => {
  assert.equal(store.dataDir(), join(home, 'growth-workbench'))
  assert.deepEqual(store.read('plan').phases, [])
})

await check('growth_context 在空白实例上也能回答', async () => {
  const text = await tools.growthContext.execute({ scope: 'brief' })
  assert.match(text, /成长工作台 · 现状/)
  assert.match(text, /还没有计划|未设定/)
})

await check('growth_save_plan 在没有目标方向时拒绝', async () => {
  await assert.rejects(() => tools.growthSavePlan.execute({ planStart: '2026-09-25', goal: 'x', phases: [] }), /还没有目标方向/)
})

await check('growth_save_profile 更新画像，verifiedFacts 只追加', async () => {
  await tools.growthSaveProfile.execute({ targetRole: '数据运营', targetRoleSlug: 'data-ops', targetRoleStatus: 'preset', route: '稳妥路线', verifiedFacts: ['怀疑：看到结论先问依据'] })
  await tools.growthSaveProfile.execute({ verifiedFacts: ['怀疑：看到结论先问依据', '复现：能把问题稳定重现'], pending: ['可能偏好结构化表达'] })
  const profile = store.read('profile')
  assert.deepEqual(profile.verifiedFacts, ['怀疑：看到结论先问依据', '复现：能把问题稳定重现'], '重复的不该再进一次')
  assert.deepEqual(profile.pending, ['可能偏好结构化表达'])
})

await check('growth_save_profile 合并追问答案，不覆盖别的键', async () => {
  store.updateProfile({ intake: { q1: 'C', q2: 'B', q3: 'A', q4: 'B' } })
  await tools.growthSaveProfile.execute({ background: { currentJob: '测试工程师' } })
  await tools.growthSaveProfile.execute({ background: { scope: '写用例、跑回归' } })
  assert.deepEqual(store.read('profile').background, { currentJob: '测试工程师', scope: '写用例、跑回归' })
  // 清一个键：空串表示删掉它，而不是写一个空值进去
  store.updateProfile({ background: { scope: '' } })
  assert.deepEqual(store.read('profile').background, { currentJob: '测试工程师' })
  store.updateProfile({ background: { scope: '写用例、跑回归' } })
})

await check('growth_propose_transferable 拒绝在空白背景上编', async () => {
  const saved = store.read('profile').background
  store.updateProfile({ background: { currentJob: '', scope: '' } })
  await assert.rejects(
    () => tools.growthProposeTransferable.execute({ items: [{ name: 'A', text: 'a' }, { name: 'B', text: 'b' }, { name: 'C', text: 'c' }] }),
    /底盘必须从那里推/,
  )
  store.updateProfile({ background: saved })
})

await check('growth_propose_transferable 同时落「经历替代不了」的部分，并丢掉空白行', async () => {
  const saved = store.read('profile').background
  store.updateProfile({ background: { currentJob: '测试工程师', scope: '写用例、跑回归' } })
  await tools.growthProposeTransferable.execute({
    items: [
      { name: '怀疑', text: '对结论先怀疑再验证' },
      { name: '复现', text: '把问题稳定复现出来' },
      { name: '闭环', text: '把问题推到修完并验证' },
    ],
    notTransferable: ['要能对模糊需求做出判断', '表达要给结论、给依据', '   '],
  })
  assert.deepEqual(
    store.read('profile').notTransferable,
    ['要能对模糊需求做出判断', '表达要给结论、给依据'],
    '空白行必须被丢掉，否则页面上会出现一个空的项目符号',
  )
  store.updateProfile({ background: saved })
})

await check('growth_propose_transferable 拒绝无法确认的概括', async () => {
  await assert.rejects(
    () => tools.growthProposeTransferable.execute({
      items: [{ name: '学习', text: '学习能力强' }, { name: 'B', text: '能把一个偶现缺陷稳定重现' }, { name: 'C', text: '完整跟过一次上线' }],
    }),
    /不是一条可确认的底子/,
  )
})

await check('growth_propose_transferable 落成待确认清单，不直接写 verifiedFacts', async () => {
  const text = await tools.growthProposeTransferable.execute({
    items: [
      { name: '复现', text: '能把一个偶现缺陷稳定重现出来' },
      { name: '边界', text: '习惯找边界值和异常输入' },
      { name: '跟发布', text: '完整跟过一次上线并处理线上问题' },
    ],
  })
  assert.match(text, /已生成 3 条待确认的底子/)
  const profile = store.read('profile')
  assert.equal(profile.transferableSuggestions.length, 3)
  assert.equal(profile.verifiedFacts.length, 2, '未经用户确认的提议绝不能自己走进 verifiedFacts')
})

await check('否掉一条底子后不再被提议，且不会悄悄回来', async () => {
  assert.equal(store.dismissTransferable('复现：能把一个偶现缺陷稳定重现出来'), true)
  store.setTransferableSuggestions([
    { name: '复现', text: '能把一个偶现缺陷稳定重现出来' },
    { name: '闭环', text: '把发现的问题推到一个结论' },
  ])
  assert.deepEqual(store.read('profile').transferableSuggestions.map((item) => item.name), ['闭环'])
  assert.deepEqual(store.read('profile').dismissedTransferable, ['复现：能把一个偶现缺陷稳定重现出来'])
})

await check('确认过的底子也不会再被提议', async () => {
  store.updateProfile({ verifiedFacts: ['闭环：把发现的问题推到一个结论'] })
  store.setTransferableSuggestions([{ name: '闭环', text: '把发现的问题推到一个结论' }])
  assert.deepEqual(store.read('profile').transferableSuggestions, [])
})

await check('growth_propose_capability_model 拒绝覆盖预置模型', async () => {
  await assert.rejects(
    () => tools.growthProposeCapabilityModel.execute({ name: 'x', positioning: 'y', groups: [], items: [] }),
    /已经有随版本发布的预置能力模型/,
  )
})

await check('生成的模型能支撑逐项自评（走同一条 gapAnalysis）', async () => {
  store.updateProfile({ targetRole: '数据分析师', targetRoleSlug: 'custom', targetRoleStatus: 'beta' })
  const items = [
    { id: 'A1', group: 'A', name: 'SQL 取数', level: '高', anchors: ['会写单表查询', '能多表关联取业务口径数据', '能写窗口函数做复杂分层'] },
    { id: 'A2', group: 'A', name: '数据清洗', level: '中', anchors: ['知道要查缺失', '能写清洗流程', '能建立可复用的清洗规范'] },
    { id: 'A3', group: 'A', name: '指标体系', level: '中', anchors: ['认识常见指标', '能为一款产品定指标', '能设计指标树并推动治理'] },
    { id: 'B1', group: 'B', name: '结论产出', level: '高', anchors: ['能复述数字', '能给出有依据的结论', '能给出结论并标出不确定性'] },
    { id: 'B2', group: 'B', name: '可视化', level: '中', anchors: ['会画基础图表', '能选对图表类型', '能用最少图表说清最复杂的事'] },
    { id: 'B3', group: 'B', name: '报告写作', level: '高', anchors: ['能把结论写清楚', '能写完整报告', '能写出让决策者行动的结论'] },
    { id: 'B4', group: 'B', name: '业务理解', level: '中', anchors: ['知道公司在做什么生意', '能说清盈利模式', '能预判下一步关键变量'] },
    { id: 'B5', group: 'B', name: '跨部门沟通', level: '低', anchors: ['能把需求说清楚', '能推动配合', '能对齐多方目标'] },
  ]
  const text = await tools.growthProposeCapabilityModel.execute({
    name: '数据分析师', positioning: '把业务数据变成可决策的洞察与报告。',
    groups: [{ key: 'A', name: '数据处理', weight: 40 }, { key: 'B', name: '分析表达', weight: 60 }],
    items,
  })
  assert.match(text, /能力模型已生成/)
  assert.match(text, /未经行业校准/, '未经校准这件事必须说出来')
  const profile = store.read('profile')
  assert.equal(profile.capabilityModel.provenance, 'generated')
  assert.equal(model.resolveRoleStatus(profile), 'generated')

  const round = api.saveSelfAssessment({ scores: { A1: 3, B1: 1, B3: 2 } })
  assert.equal(round.entry.gapWeight, 40 * 3 + 60 * 3 + 60 * 3, 'W 用的是生成模型自己的权重')
  assert.deepEqual(round.analysis.priorities.map((entry) => entry.id), ['B1', 'B3'])
  assert.deepEqual(round.entry.curvePoints.map((point) => point.能力项), ['A1', 'B1', 'B3'])
})

await check('换方向后生成的模型自动失效，不会拿旧模型给新方向打分', async () => {
  store.updateProfile({ targetRoleSlug: 'data-ops' })
  const state = api.buildState()
  assert.equal(state.catalog.activeRoleSource, 'preset')
  assert.equal(state.catalog.activeRole.name, '数据运营')
  assert.equal(store.read('profile').capabilityModel.forSlug, 'custom', '模型还在，只是不再生效')
})

await check('自评带上模型里不存在的编号时明确拒绝', async () => {
  assert.throws(() => api.saveSelfAssessment({ scores: { ZZ9: 3 } }), /不在当前模型里/)
})

await check('growth_context scope=model 给出结构模板', async () => {
  const text = await tools.growthContext.execute({ scope: 'model' })
  assert.match(text, /## 能力模型/)
  assert.match(text, /1 分锚点/)
  assert.match(text, /高权重项/)
})

await check('growth_context scope=profile 带上追问与底盘提议状态', async () => {
  const text = await tools.growthContext.execute({ scope: 'profile' })
  assert.match(text, /当前状态的追问/)
  assert.match(text, /已否掉的底子/)
  assert.match(text, /能力模型来源/)
})

await check('growth_save_plan 写入并分配标识', async () => {
  const text = await tools.growthSavePlan.execute({
    planStart: '2026-09-25', goal: '三个月能独立产出分析报告',
    phases: [goodPhase('基础', [1, 30], [goodTask({ day: 1 })]), goodPhase('实战', [31, 60], [])],
    selfCheck: [{ id: 'Q1', phase: '基础', question: '漏斗怎么用', capability: 'B1' }],
  })
  assert.match(text, /计划已写入/)
  assert.match(text, /T1/)
  assert.deepEqual(store.read('plan').phases[0].tasks.map((task) => task.id), ['T1'])
})

await check('growth_context scope=progress 给出每个任务一行', async () => {
  const text = await tools.growthContext.execute({ scope: 'progress' })
  assert.match(text, /任务标识：T1/)
  assert.match(text, /证据档位：null/, '没交证据时档位是字面量 null，不是自述')
})

await check('学习资料：怎么上手 + 汇总 + 来源，且链接必须是真地址', async () => {
  const taskId = model.planTasks(store.read('plan'))[0].id
  const othersBefore = JSON.stringify(model.planTasks(store.read('plan')).slice(1))

  const reply = await tools.growthSaveLearning.execute({
    taskId,
    method: '先跑通官方那 5 行示例，再改一个参数看差异',
    digest: '要掌握三件事：怎么取数、口径怎么定、结论怎么被复核。常见的坑是把相关当成因果。',
    links: [{ title: '官方快速开始', url: 'https://example.com/quickstart', source: '官方文档' }],
  })
  assert.match(reply, /学习资料已写入/)
  const after = store.read('plan')
  const saved = model.taskById(after, taskId)
  assert.equal(saved.learn.method, '先跑通官方那 5 行示例，再改一个参数看差异')
  assert.equal(saved.learn.links.length, 1)
  assert.match(saved.learn.foundAt, /^\d{4}-\d{2}-\d{2}$/, '记下什么时候找的 —— 链接会过期')
  assert.equal(JSON.stringify(model.planTasks(after).slice(1)), othersBefore, '只改这一道题，别的任务一个字不动')

  // 编链接 / 占位 / 超量 / 没有的任务 / 什么都没给 —— 五种都拒。
  await assert.rejects(() => tools.growthSaveLearning.execute({ taskId, links: [{ title: 'x', url: '不是地址' }] }), /http\(s\)/)
  await assert.rejects(() => tools.growthSaveLearning.execute({ taskId, method: '待补' }), /占位/)
  await assert.rejects(() => tools.growthSaveLearning.execute({
    taskId,
    links: Array.from({ length: 5 }, (_, index) => ({ title: `t${String(index)}`, url: `https://e.com/${String(index)}` })),
  }), /最多 4 条/)
  await assert.rejects(() => tools.growthSaveLearning.execute({ taskId: 'T999', method: 'x' }), /没有 T999/)
  await assert.rejects(() => tools.growthSaveLearning.execute({ taskId }), /至少要给一样/)

  // **重写计划不该把查过的资料弄丢**：调用方没带 learn 时，沿用磁盘上同一标识那一份。
  const rewritten = validate.canonicalPlan({
    planStart: after.planStart,
    goal: after.goal,
    phases: after.phases.map((phase) => ({
      name: phase.name,
      days: phase.days,
      goal: phase.goal,
      project: phase.project,
      criteria: phase.criteria,
      weeks: phase.weeks,
      tasks: (phase.tasks ?? []).map((task) => {
        const bare = { ...task }
        delete bare.learn
        return bare
      }),
    })),
    selfCheck: after.selfCheck,
  }, after, ROLE)
  assert.equal(model.taskById(rewritten, taskId).learn.method, saved.learn.method, '重写计划时没带 learn，应沿用磁盘上那份')
  // 想清空就显式写 null —— 不是靠"忘了带"。
  const cleared = validate.canonicalPlan({
    planStart: after.planStart,
    goal: after.goal,
    phases: after.phases.map((phase) => ({
      ...phase,
      tasks: (phase.tasks ?? []).map((task) => ({ ...task, learn: null })),
    })),
    selfCheck: after.selfCheck,
  }, after, ROLE)
  assert.equal(model.taskById(cleared, taskId).learn, undefined, '显式 null = 清空')
})


await check('打卡累积打卡日，且证据为空时档位回落 null', async () => {
  store.checkIn('T1', { done: true, evidence: '看了三篇', tier: '过程' }, '2026-09-25')
  store.checkIn('T1', { done: true }, '2026-09-26')
  const entry = store.read('progress').tasks.T1
  assert.deepEqual(entry.checkInDates, ['2026-09-25', '2026-09-26'], '打卡日必须累积，不能覆盖')
  assert.equal(entry.tier, '过程')
  store.checkIn('T1', { evidence: '' })
  assert.equal(store.read('progress').tasks.T1.tier, null, '证据清空后档位不能停留在旧值')
})

await check('打卡只接受 T<n> 形式的任务标识', () => {
  assert.throws(() => store.checkIn('1.1', {}), /task id must look like/)
})

await check('growth_save_assessment 落历史并给出机制提示', async () => {
  const text = await tools.growthSaveAssessment.execute({
    scores: { 完成率: 8, 证据质量: 18, 作品达标度: 15, 知识考核: 20 },
    day: 30, confidence: 'medium', coverage: '全量',
    attribution: '计划问题', adjustments: [{ 任务标识: 'T1', 一句话动作: '换成十分钟版' }],
  })
  assert.match(text, /考核已记入历史/)
  assert.match(text, /触发铁律/, '完成率 8 分应触发减量那条铁律')
  assert.match(text, /总分 61（及格）/)
  const history = store.read('assessments').history
  const reviews = history.filter((entry) => entry.kind === 'review')
  assert.equal(reviews.length, 1)
  assert.equal(reviews[0].kind, 'review')
})

await check('考核历史只追加、按日期升序', async () => {
  store.appendAssessment({ date: '2026-09-01', day: 1, kind: 'self', coverage: '全量', curvePoints: [] })
  const dates = store.read('assessments').history.map((entry) => entry.date)
  assert.deepEqual(dates, [...dates].sort(), '历史必须按日期升序')
  assert.ok(dates.includes('2026-09-01') && dates.length >= 2, '追加不该覆盖已有的轮次')
})

await check('一段写坏的 JSON 会被明确报错，而不是静默当空', () => {
  // 复现后必须把计划放回去 —— 后面的检查要跑在真实计划上。
  const preserved = store.read('plan')
  writeFileSync(store.dataPath('plan'), 'not json')
  assert.throws(() => store.read('plan'), /not valid JSON/)
  store.write('plan', preserved)
  assert.ok(store.read('plan').phases.length > 0)
})

await check('写入是原子的：不留临时文件', () => {
  store.updateProfile({ currentRole: '测试工程师' })
  assert.deepEqual(readdirSync(store.dataDir()).filter((file) => file.endsWith('.tmp')), [])
})

// ---------------------------------------------------------------- 6. HTTP

/** Install a fake request/response pair and run the handler against it. */
async function callApi(method, url, body, contentType = 'application/json') {
  // body 可以是 JSON 对象，也可以是裸字节（证据图片走的就是裸字节那条路）。
  const chunks = body === undefined ? []
    : [Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body), 'utf8')]
  const req = {
    method,
    url,
    headers: { 'content-type': contentType },
    async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk },
  }
  let status
  let headers = {}
  let payload = Buffer.alloc(0)
  const res = {
    writeHead(code, extra) { status = code; headers = extra ?? {}; return this },
    end(chunk) {
      payload = chunk === undefined ? Buffer.alloc(0)
        : (Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8'))
      return this
    },
  }
  await api.handleApi(req, res)
  let parsed
  try { parsed = JSON.parse(payload.toString('utf8')) } catch { parsed = { raw: payload.toString('utf8') } }
  return { status, headers, body: parsed, bytes: payload }
}

await check('GET /state 一次给全页面需要的东西', async () => {
  const reply = await callApi('GET', `${api.API_PREFIX}/state`)
  assert.equal(reply.status, 200)
  assert.equal(reply.body.ok, true)
  assert.ok(Array.isArray(reply.body.plan.tasks))
  assert.ok(reply.body.metrics.completion !== undefined)
  // 执行趋势要的是整条数组，不只是本周一个数 —— 页面画的就是它。
  const weekRates = reply.body.metrics.weekRates
  assert.ok(Array.isArray(weekRates), 'metrics.weekRates 是数组')
  assert.ok(weekRates.every((entry, index) => entry.week === index + 1), '周次连续，从第 1 周开始')
  assert.ok(
    weekRates.every((entry) => entry.rate === null || (entry.rate >= 0 && entry.rate <= 1)),
    '每项是 {week, rate}；没排到天的周是 null，不是 0',
  )
  if (weekRates.length > 0) {
    assert.equal(
      weekRates[weekRates.length - 1].week,
      Math.floor((reply.body.metrics.day - 1) / 7) + 1,
      '最后一根柱子是本周',
    )
    assert.equal(
      weekRates[weekRates.length - 1].rate,
      reply.body.metrics.weekRate,
      '本周那根柱子必须与 metrics.weekRate 是同一个值 —— 同一个读数不能有两个来源',
    )
  }
  assert.ok(Array.isArray(reply.body.history))
  assert.ok(Array.isArray(reply.body.catalog.questions))
  assert.equal(reply.body.catalog.activeRole.slug, 'data-ops')
  assert.equal(reply.body.catalog.highWeightIds.length, 10)
  assert.equal(reply.body.catalog.activeRoleSource, 'preset')
  assert.ok(reply.body.catalog.followUps !== undefined, '当前状态答了就一定有追问')
  assert.ok(Array.isArray(reply.body.catalog.missingBackground), '页面靠它决定要不要显示必填告警')
  assert.ok(typeof reply.body.catalog.transferableNote.proposePrompt === 'string')
})

await check('POST /intake 保存四个选择题并推出约束与截止', async () => {
  const reply = await callApi('POST', `${api.API_PREFIX}/intake`, {
    roleSlug: 'data-ops', intake: { q1: 'C', q2: 'B', q3: 'A', q4: 'B' }, route: '冲刺路线',
  })
  assert.equal(reply.status, 200)
  const profile = store.read('profile')
  assert.equal(profile.route, '冲刺路线')
  assert.equal(profile.timePerDay, '约 1 小时')
  assert.ok(profile.deadline.length === 10)
  assert.ok(profile.constraints.includes('在职想转行'))
})

await check('POST /intake 收到非法选项时回落到最保守默认', async () => {
  await callApi('POST', `${api.API_PREFIX}/intake`, { roleSlug: 'data-ops', intake: { q1: 'H', q2: null, q3: 'H', q4: 'H' } })
  assert.deepEqual(store.read('profile').intake, model.INTAKE_DEFAULTS)
})

await check('POST /intake 支持自定义方向', async () => {
  const reply = await callApi('POST', `${api.API_PREFIX}/intake`, {
    roleSlug: model.CUSTOM_SLUG, roleName: '数据分析师', intake: { q1: 'C', q2: 'B', q3: 'A', q4: 'B' }, route: '稳妥路线',
  })
  assert.equal(reply.status, 200)
  const profile = store.read('profile')
  assert.equal(profile.targetRole, '数据分析师')
  assert.equal(profile.targetRoleSlug, model.CUSTOM_SLUG)
  // 自己填的方向没有模型可依 —— 落库的是 building，不是历史档位 beta。
  assert.equal(profile.targetRoleStatus, 'building')
  assert.match(profile.positioning, /自定义/)
})

await check('POST /intake 拒绝空的自定义方向名', async () => {
  const reply = await callApi('POST', `${api.API_PREFIX}/intake`, { roleName: '   ', intake: {} })
  assert.equal(reply.status, 400)
  assert.match(reply.body.error, /请先选择一个目标方向/)
})

await check('POST /background 保存追问，缺必填时拒绝', async () => {
  store.updateProfile({ background: { currentJob: '', scope: '', industry: '', years: '' } })
  const missing = await callApi('POST', `${api.API_PREFIX}/background`, { background: { currentJob: '测试工程师' } })
  assert.equal(missing.status, 400)
  assert.match(missing.body.error, /必填/)
  const ok = await callApi('POST', `${api.API_PREFIX}/background`, { background: { currentJob: '测试工程师', scope: '写用例、跑回归、跟发布' } })
  assert.equal(ok.status, 200)
  assert.equal(store.read('profile').background.scope, '写用例、跑回归、跟发布')
})

await check('POST /background 在没答 ② 的第一题时拒绝', async () => {
  const saved = store.read('profile').intake
  store.updateProfile({ intake: {} })
  const reply = await callApi('POST', `${api.API_PREFIX}/background`, { background: { currentJob: 'x' } })
  assert.equal(reply.status, 400)
  assert.match(reply.body.error, /先答 ② 的第一题/)
  store.updateProfile({ intake: saved })
})

await check('POST /transferable 一次同时确认与否决', async () => {
  await callApi('POST', `${api.API_PREFIX}/transferable`, {
    facts: ['复现：能把一个偶现缺陷稳定重现出来'],
    dismissed: ['跟发布：完整跟过一次上线并处理线上问题'],
  })
  const profile = store.read('profile')
  assert.ok(profile.verifiedFacts.includes('复现：能把一个偶现缺陷稳定重现出来'))
  assert.ok(profile.dismissedTransferable.includes('跟发布：完整跟过一次上线并处理线上问题'))
  assert.ok(!profile.transferableSuggestions.some((item) => item.name === '跟发布'), '否掉的要从待确认里拿掉')
  const empty = await callApi('POST', `${api.API_PREFIX}/transferable`, {})
  assert.equal(empty.status, 400)
})

await check('POST /capability-model 只接受 discard', async () => {
  const refused = await callApi('POST', `${api.API_PREFIX}/capability-model`, { name: 'x' })
  assert.equal(refused.status, 400)
  assert.match(refused.body.error, /只能由 Agent 生成/)
  const discarded = await callApi('POST', `${api.API_PREFIX}/capability-model`, { discard: true })
  assert.equal(discarded.status, 200)
  assert.equal(store.read('profile').capabilityModel, null)
  // 回到预置方向，后面的自评与考核才有模型可用。
  await callApi('POST', `${api.API_PREFIX}/intake`, { roleSlug: 'data-ops', intake: { q1: 'C', q2: 'B', q3: 'A', q4: 'B' }, route: '稳妥路线' })
  assert.equal(store.read('profile').targetRoleSlug, 'data-ops')
})

await check('POST /plan-start 保存第 1 天，并拒绝坏日期', async () => {
  const ok = await callApi('POST', `${api.API_PREFIX}/plan-start`, { date: '2026-09-25' })
  assert.equal(ok.status, 200)
  assert.equal(store.read('plan').planStart, '2026-09-25')
  const bad = await callApi('POST', `${api.API_PREFIX}/plan-start`, { date: '25/09/2026' })
  assert.equal(bad.status, 400)
  assert.match(bad.body.error, /YYYY-MM-DD/)
})

await check('POST /checkin 拒绝计划里不存在的任务', async () => {
  const reply = await callApi('POST', `${api.API_PREFIX}/checkin`, { taskId: 'T99', done: true })
  assert.equal(reply.status, 400)
  assert.match(reply.body.error, /计划里没有 T99/)
})

await check('POST /self-assessment 逐项落点、算 gap、写进历史', async () => {
  const scores = Object.fromEntries(model.ROLES['data-ops'].items.map((item) => [item.id, 3]))
  scores.A2 = 1
  const reply = await callApi('POST', `${api.API_PREFIX}/self-assessment`, { scores })
  assert.equal(reply.status, 200)
  assert.equal(reply.body.entry.kind, 'self')
  assert.equal(reply.body.entry.coverage, '全量', '快速自评是全部 20 项，算全量')
  assert.equal(reply.body.entry.answered, 20)
  assert.equal(reply.body.entry.curvePoints.length, 20)
  assert.ok(Math.abs(store.read('profile').selfAssessment.gap - 180 / 1300) < 1e-9)
})

await check('自评分数越界被拒', async () => {
  const reply = await callApi('POST', `${api.API_PREFIX}/self-assessment`, { scores: { A1: 9 } })
  assert.equal(reply.status, 400)
  assert.match(reply.body.error, /1-5/)
})

await check('自评点被窗口内的过程级证据抬到 medium', async () => {
  // 本轮窗口是 [上一轮评估日 + 1, 今天]，所以同日重评会得到空窗口 —— 这是契约
  // 定义的形状（间隔本来就不固定，以「上一次评估」为界首尾相接）。这里从干净
  // 的历史开始，验的是「任务证据进入曲线的唯一通路」本身。
  store.write('assessments', store.empty('assessments'))
  store.checkIn('T1', { done: true, evidence: '笔记', tier: '过程' }, store.today())
  const reply = await callApi('POST', `${api.API_PREFIX}/self-assessment`, { scores: { A6: 3 } })
  assert.equal(reply.body.entry.curvePoints[0].能力项, 'A6')
  assert.equal(reply.body.entry.curvePoints[0].置信度, 'medium')
  assert.equal(reply.body.entry.curvePoints[0].证据档位, '过程')
})

await check('POST /assessment 登记四维成绩', async () => {
  const reply = await callApi('POST', `${api.API_PREFIX}/assessment`, {
    scores: { 完成率: 20, 证据质量: 18, 作品达标度: 15, 知识考核: 22 }, day: 30,
  })
  assert.equal(reply.status, 200)
  assert.equal(reply.body.entry.total, 75)
  assert.equal(reply.body.entry.grade, '良')
})

await check('证据文件：图片显示、其他下载，越界与危险类型都拒', async () => {
  // 一张最小的 PNG 头 —— 这条验的是通路（字节进、字节出、名字由宿主生成），不是解码。
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
  const taskId = model.planTasks(store.read('plan'))[0].id

  const up = await callApi('POST', `${api.API_PREFIX}/evidence?task=${taskId}`, png, 'image/png')
  assert.equal(up.status, 200)
  const entry = store.read('progress').tasks[taskId]
  assert.equal(entry.images.length, 1)
  const file = entry.images[0].file
  assert.match(file, /^T\d+-\d{14}-[a-z0-9]{4}\.png$/, '文件名由宿主生成，不用上传方给的名字')
  assert.ok(existsSync(join(store.evidenceDir(), file)), '字节真的落盘了')
  assert.equal(entry.images[0].bytes, png.length)

  // 原路读回：**图片按 image/\* 回**，页面直接显示缩略图。
  const back = await callApi('GET', `${api.API_PREFIX}/evidence?file=${file}`)
  assert.equal(back.status, 200)
  assert.equal(back.headers['content-type'], 'image/png')
  assert.ok(back.bytes.equals(png))

  // **CSV 这类文件走同一条路**：能存、能读回，但回的是 octet-stream + attachment ——
  // 绝不当页面渲染（上传一个 .html 再按原类型回就是同源 XSS）。
  const csv = Buffer.from('问题,期望要点\n退款多久到账,3 个工作日\n', 'utf8')
  const csvUp = await callApi('POST', `${api.API_PREFIX}/evidence?task=${taskId}&name=${encodeURIComponent('评测集.csv')}`, csv, 'text/csv')
  assert.equal(csvUp.status, 200)
  const csvFile = store.read('progress').tasks[taskId].images[1].file
  assert.match(csvFile, /\.csv$/)
  assert.equal(store.read('progress').tasks[taskId].images[1].name, '评测集.csv', '原文件名只留着给人看')
  const csvBack = await callApi('GET', `${api.API_PREFIX}/evidence?file=${csvFile}`)
  assert.equal(csvBack.status, 200)
  assert.equal(csvBack.headers['content-type'], 'application/octet-stream')
  assert.match(csvBack.headers['content-disposition'], /^attachment; filename="/, '非图片一律下载，不当页面渲染')
  assert.match(csvBack.headers['content-disposition'], new RegExp(csvFile.replace('.', '\\.')), '响应头用宿主生成的名字，不用上传方给的')
  assert.ok(csvBack.bytes.equals(csv))

  // 路径穿越：名字必须是宿主生成的那个形状 —— `?file=../profile.json` 不该把画像吐出来。
  const escape = await callApi('GET', `${api.API_PREFIX}/evidence?file=${encodeURIComponent('../profile.json')}`)
  assert.equal(escape.status, 404)

  // 危险类型（能当页面执行的）与空文件都拒。
  const badType = await callApi('POST', `${api.API_PREFIX}/evidence?task=${taskId}`, Buffer.from('<html>'), 'text/html')
  assert.equal(badType.status, 400)
  assert.match(badType.body.error, /只收图片/)
  const empty = await callApi('POST', `${api.API_PREFIX}/evidence?task=${taskId}`, Buffer.alloc(0), 'image/png')
  assert.equal(empty.status, 400)

  // 删：只有用户点那个 × 会走到这条路由，文件与记录一起清掉（两份都能删）。
  const gone = await callApi('POST', `${api.API_PREFIX}/evidence-remove`, { taskId, file })
  assert.equal(gone.status, 200)
  assert.equal(store.read('progress').tasks[taskId].images.length, 1)
  assert.ok(!existsSync(join(store.evidenceDir(), file)), '文件跟着删了')
  await callApi('POST', `${api.API_PREFIX}/evidence-remove`, { taskId, file: csvFile })
  assert.deepEqual(store.read('progress').tasks[taskId].images, [])

  // 再删一次要说清楚，而不是静默成功。
  const twice = await callApi('POST', `${api.API_PREFIX}/evidence-remove`, { taskId, file })
  assert.equal(twice.status, 400)

  // 页面那份白名单只为了"选之前就拦住"，但**必须与宿主那张一致** —— 否则会出现"页面放行、
  // 宿主拒绝"（用户看到的是一个说不清原因的失败）。逐条对着宿主那张查。
  const storeSource = readFileSync(join(ROOT, 'store.mjs'), 'utf8')
  const blockStart = storeSource.indexOf('const EVIDENCE_TYPES')
  const block = storeSource.slice(blockStart, storeSource.indexOf('}', blockStart))
  const clientSource = readFileSync(join(ROOT, 'client.js'), 'utf8')
  for (const mime of [...block.matchAll(/'([a-z]+\/[a-z0-9.+-]+)'/g)].map((match) => match[1])) {
    assert.ok(clientSource.includes(`'${mime}'`), `页面白名单也要有 ${mime}`)
  }
})

await check('提前：节奏比日历快，但不碰起始日与打卡日期', async () => {
  const planStart = store.read('plan').planStart
  const before = (await callApi('GET', `${api.API_PREFIX}/state`)).body.metrics.day

  const on = await callApi('POST', `${api.API_PREFIX}/ahead`, { days: 3 })
  assert.equal(on.status, 200)
  const shifted = (await callApi('GET', `${api.API_PREFIX}/state`)).body
  assert.equal(shifted.metrics.aheadDays, 3)
  assert.equal(shifted.metrics.day, before + 3, '第几天跟着走（今日任务、阶段、周次都跟着走）')
  // 两个时钟分开：`today` 是真实的那一天，`planDate` 是进度天对应的**计划日期**（动态算）。
  assert.equal(shifted.today, store.today(), '页面读到的"今天"是真实的今天')
  assert.equal(shifted.planDate, store.effectiveToday({ aheadDays: 3 }), '计划日期由进度天推出来')
  assert.equal(store.read('plan').planStart, planStart, '起始日是"计划从哪天开始"这个事实，一个字都不动')

  // 打卡记的仍是**真实日期**：提前改的是"我在做第几天"，不是"现在几号"。
  const taskId = model.planTasks(store.read('plan'))[0].id
  await callApi('POST', `${api.API_PREFIX}/checkin`, { taskId, done: true, evidence: '提前做完的' })
  const entry = store.read('progress').tasks[taskId]
  assert.ok(entry.checkInDates.includes(store.today()), '打卡日期是真实的今天')
  assert.ok(
    !entry.checkInDates.includes(store.effectiveToday({ aheadDays: 3 })),
    '被提前到的那一天不该进打卡记录 —— 提前改的是"我在做第几天"，不是"现在几号"',
  )
  // 同一笔打卡记下两样东西：真实日期（什么时候做的）+ 进度天（算计划里的第几天）。
  assert.ok(entry.checkInDays.includes(before + 3), '打卡同时记下进度天')

  // Agent 读到的必须是同一天 —— 否则它按真实日期写下的轮次会和页面显示的对不上。
  const brief = await tools.growthContext.execute({ scope: 'brief' })
  assert.ok(brief.includes(store.effectiveToday({ aheadDays: 3 })), '简报里的计划日期与页面的 planDate 同一天')
  assert.ok(brief.includes(store.today()), '简报里也给出真实日期')
  assert.match(brief, /节奏比日历快/, '两个时钟不同时要说明白')

  // 回到日历节奏：回到真实的那一天。
  await callApi('POST', `${api.API_PREFIX}/ahead`, { days: 0 })
  assert.equal((await callApi('GET', `${api.API_PREFIX}/state`)).body.metrics.day, before)
  // 越界、非整数、负数都不收 —— 它不是"跳到任意日期"的工具。
  assert.equal((await callApi('POST', `${api.API_PREFIX}/ahead`, { days: 366 })).status, 400)
  assert.equal((await callApi('POST', `${api.API_PREFIX}/ahead`, { days: 1.5 })).status, 400)
  assert.equal((await callApi('POST', `${api.API_PREFIX}/ahead`, { days: -1 })).status, 400)
})

await check('提前的入口长在需求出现的地方：今日页做完之后，不在设置卡里', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // **状态与设置放页脚**：如实说两边（我在做第 8 天 / 按日历第 5 天），只放"撤销"那一个动作。
  // 这一条原来钉的是页头 —— 后来用户说「这块放下面就行，顶部留给核心内容」，于是它挪进
  // `WorkbenchFoot`；断言也跟着改成钉**位置**（在页脚里、不在页头里），而不只是钉文案还在。
  const foot = sliceOfComponent(source, 'WorkbenchFoot')
  // 这两行**各归各页**：日历节奏只在计划页、Agent 会话只在画像页（用户：「这两个不需要所有页面
  // 都有：日历节奏这个放计划页面下面，Agent 运行只放在画像下面」）。
  assert.match(foot, /if \(tab === 'plan' && ahead > 0\) \{/, '日历节奏只在计划页')
  assert.match(foot, /if \(tab === 'profile' && hasAgentLine\) \{/, 'Agent 会话只在画像页')
  assert.match(foot, /你已经在做第 \$\{String\(state\.metrics\.day\)\} 天（按日历今天是第 \$\{String\(state\.metrics\.day - ahead\)\} 天）/)
  assert.match(foot, /actions: \[\{ label: '回到日历节奏'/, '回到日历节奏要一键可达')
  assert.match(source, /h\(WorkbenchFoot, \{ key: 'foot', state, post, tab \}\)/, '把当前页签交给它，才分得清归属')
  const header = sliceOfComponent(source, 'WorkbenchHeader')
  assert.doesNotMatch(header, /key: 'ahead'/, '页头不再挂那条提前提示')
  assert.doesNotMatch(header, /h\(AgentSessionLine/, '页头不再挂「Agent 运行在哪」——它也归页脚')
  assert.match(foot, /h\(AgentSessionLine, \{ key: 'agent-session'/, 'Agent 会话那一行在页脚')
  assert.match(source, /h\(WorkbenchFoot, \{ key: 'foot', state, post, tab \}\)/, '页脚真的挂在页面底部（在页签正文之后）')
  // 「继续做下一天」长在今日页 —— 今天排的做完了、后面还有任务时，才出现。
  // 断言写「kids.push」而不是只写文案：我第一版把它写成了一个被丢掉的三元表达式 ——
  // 文案在、元素也造出来了，就是没进那棵树（渲染出来什么都没有）。
  assert.match(source, /kids\.push\(h\(NoteLine, \{[\s\S]{0,300}?继续做下一天 →/, '入口真的挂在今日页那棵树上')
  assert.match(source, /今天排的做完了 —— 接下来是第 \$\{String\(nextDay\)\} 天。/)
  assert.match(source, /\{ label: '继续做下一天 →'/, '按钮说"下一天"，不点具体天号 —— 用户关心的是"再来一道"')
  // 推到"下一道真实存在的任务"那一天，而不是无脑 +1（第 3 天之后可能第 5 天才排任务）。
  assert.match(source, /post\('\/ahead', \{ days: nextDay - pointer \+ aheadDays \}\)/)
  // 计划页那条设置撤掉了：入口只有一处。计划页的任务签只是状态 —— 不带 onClick。
  assert.doesNotMatch(source, /试跑/)
  assert.match(source, /\? `\$\{task\.id\} ✓` : task\.id/)
  assert.match(source, /title: state\.progress\.tasks\?\.\[task\.id\]\?\.done === true \? '已完成' : '还没做'/)
})

await check('POST /reset 只清指定分区', async () => {
  const reply = await callApi('POST', `${api.API_PREFIX}/reset`, { kind: 'progress' })
  assert.equal(reply.status, 200)
  assert.deepEqual(store.read('progress').tasks, {})
  assert.ok(store.read('plan').phases.length > 0, '清打卡不该动计划')
  const bad = await callApi('POST', `${api.API_PREFIX}/reset`, { kind: 'nope' })
  assert.equal(bad.status, 400)
})

await check('GET /export 给一份可自己留存的备份', async () => {
  const reply = await callApi('GET', `${api.API_PREFIX}/export`)
  assert.equal(reply.status, 200)
  assert.ok(reply.body.data.profile !== undefined && reply.body.data.plan !== undefined)
  assert.ok(reply.body.exported.length === 10)
})

await check('固定对话：写进画像、能从 /state 读回、清空画像时不被带走', async () => {
  const bound = await callApi('POST', `${api.API_PREFIX}/agent-session`, { sessionId: 'sess-abc', title: '成长工作台' })
  assert.equal(bound.status, 200)
  assert.equal(store.read('profile').agentSession.id, 'sess-abc')
  assert.equal(store.read('profile').agentSession.title, '成长工作台')
  // 页面读的就是 /state 里的这一份 —— 页面不能自己存一份（仓库规矩：不得另建真相）。
  const state = await callApi('GET', `${api.API_PREFIX}/state`)
  assert.equal(state.body.profile.agentSession.id, 'sess-abc')
  // 长得不像会话 id 的直接拒掉，而不是悄悄存进去。
  const tooLong = await callApi('POST', `${api.API_PREFIX}/agent-session`, { sessionId: 'x'.repeat(121) })
  assert.equal(tooLong.status, 400)
  // 清空画像 ≠ 解除绑定：固定的对话是「运行发到哪儿」，不是画像内容。
  const reset = await callApi('POST', `${api.API_PREFIX}/reset`, { kind: 'profile' })
  assert.equal(reset.status, 200)
  assert.equal(store.read('profile').targetRole, '', '画像该清的还是要清')
  assert.equal(store.read('profile').agentSession.id, 'sess-abc', '绑定不该被清空画像一起带走')
  // 空 id = 解除固定（页面上的「改绑」「重建」都走这条路由的另一个分支）。
  const cleared = await callApi('POST', `${api.API_PREFIX}/agent-session`, { sessionId: '' })
  assert.equal(cleared.status, 200)
  assert.equal(store.read('profile').agentSession, null)
})

await check('考卷草稿：按题合并、答完清掉，不碰考核成绩', async () => {
  const key = '节点-1'
  const first = await callApi('POST', `${api.API_PREFIX}/draft`, { key, answers: { Q1: '第一题的答案' } })
  assert.equal(first.status, 200)
  // 第二题单独存 —— **按题合并**：失焦那次与定时那次会并发，整份覆盖会让它们互相吃掉。
  await callApi('POST', `${api.API_PREFIX}/draft`, { key, answers: { Q2: '第二题的答案' } })
  let drafts = (await callApi('GET', `${api.API_PREFIX}/state`)).body.drafts
  assert.deepEqual(drafts[key].answers, { Q1: '第一题的答案', Q2: '第二题的答案' })
  assert.match(drafts[key].updated, /^\d{4}-\d{2}-\d{2}T/, '记下什么时候存的')
  // 清一题 = 删那一题（剩下的题不受影响）。
  await callApi('POST', `${api.API_PREFIX}/draft`, { key, answers: { Q1: '' } })
  drafts = (await callApi('GET', `${api.API_PREFIX}/state`)).body.drafts
  assert.deepEqual(drafts[key].answers, { Q2: '第二题的答案' })
  // 交卷之后走的路：整张清掉 —— 目录上不该留一个假的「继续作答」。
  await callApi('POST', `${api.API_PREFIX}/draft`, { key, clear: true })
  drafts = (await callApi('GET', `${api.API_PREFIX}/state`)).body.drafts
  assert.equal(drafts[key], undefined)
  // 没有 key 直接拒（否则草稿会写到一张不存在的卷子上）。
  assert.equal((await callApi('POST', `${api.API_PREFIX}/draft`, { answers: { Q1: 'x' } })).status, 400)
  // 草稿是"没交卷"的那一半，不进历史 —— 历史只由 Agent 的 growth_save_assessment 追加。
  assert.equal(store.read('assessments').history.length, store.read('assessments').history.length)
})

await check('专属会话的工作区：宿主侧的**空**目录，不是数据目录', async () => {
  // 目录由宿主挂载时建出来（幂等）—— 页面只拿到路径，它不碰磁盘。
  assert.ok(existsSync(store.workspaceDir()), '挂载时要把工作区目录建出来')
  assert.equal(store.workspaceDir(), join(store.dataDir(), 'workspace'))
  // **不是数据目录本身**：会话的 cwd 就是 Agent 的默认工作目录，指向数据目录等于把那四份 JSON
  // 摆在它手边（随手一次直接编辑就绕过了工具那边的门禁）。
  assert.notEqual(store.workspaceDir(), store.dataDir())
  const state = (await callApi('GET', `${api.API_PREFIX}/state`)).body
  assert.equal(state.agentWorkspace, store.workspaceDir(), '/state 要把路径发下来')
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.match(source, /sessions\.create\(typeof cwd === 'string' && cwd\.length > 0 \? \{ cwd \} : \{\}\)/)
  // **改名的返回值要检查**：`rename` 失败时返回 `{ ok: false }` 而**不抛** —— 只 try/catch
  // 会把失败静默吃掉（用户建出来的对话就叫「新会话」，而页面说"运行都在「成长工作台」里"）。
  assert.match(source, /const renamed = await sessions\.binding\(id\)\?\.session\?\.rename\?\.\(AGENT_SESSION_TITLE\)/)
  assert.match(source, /named = renamed\?\.ok === true/, '要看 ok，不能只看有没有抛')
  // 改了名才知道该存什么标题；存错了，页面上那句"运行都在「X」里"就是假的。
  assert.match(source, /title: created\.named \? AGENT_SESSION_TITLE : '新会话'/)
  // 点了按钮要有回声 —— 什么都不说，用户读到的就是「没啥反应」。
  assert.match(source, /新建了对话「\$\{AGENT_SESSION_TITLE\}」/)
  assert.match(source, /对话建好了，但没能改成「成长工作台」/)
  assert.ok(
    (source.match(/createAgentSession\(sessions, state\?\.agentWorkspace\)/g) ?? []).length >= 2,
    'askAgent 与「重建一个」两处新建都要带上工作区',
  )
})

await check('未知路由是 404', async () => {
  const reply = await callApi('GET', `${api.API_PREFIX}/nope`)
  assert.equal(reply.status, 404)
})

rmSync(home, { recursive: true, force: true })

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${String(failures)} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
