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
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
  // 发消息这条路必须真的在：拿到会话服务 → 取当前那一个 → 以用户回合的身份送出去。
  assert.match(source, /rootCtx\.get\('sessions'\)/)
  assert.match(source, /sessions\.binding\(current\)/)
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
  assert.match(source, /hideNext: tab === 'profile', currentTab: tab/)
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
  assert.match(clientSource, /答完交卷，AI 按 rubric 打四维分/, '页面要说清交卷后会发生什么')
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
  assert.match(source, /function ReviewTabBody\(\{ state \}\)/, '这一页只读 state')
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
  assert.match(source, /state\.focus\.tasks\.every\(/, '「已全部完成」必须真的全部完成')
  assert.match(source, /function Seal\(\{ label, sub, tone, round, stamp \}\)/)
  assert.match(source, /function Readout\(\{ value, unit, cap, first \}\)/)
  // gap 是加权缺口的比例（模型里断言的就是 180/1300 这种值）。印成「X 分」是单位错误。
  assert.match(source, /Math\.round\(gap \* 100\)/, 'gap 要按百分比印')
  assert.doesNotMatch(source, /gap\.toFixed\(2\)/, '不许再把它当分数印')
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
  // 档位不自己判：nextActionFor 已经判过了，页面再算一遍只会分叉。
  assert.match(source, /function examTier\(state\)/)
  assert.match(source, /action\.id === 'review-phase'/, '档位取自那条阶梯给出的 id')
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
  // 考卷的档位与「这次考的是哪个」必须一致：大考针对的是**已走完的那个阶段**，通常不是当前阶段。
  assert.match(source, /action\.id === 'review-phase' && typeof action\.scope === 'string'/, '大考的信息栏取自那条阶梯给出的 scope')
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

await check('考核目录：阶段与节点的状态都从已有数据算出来，不另存', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.match(source, /function ExamSyllabus\(\{ state \}\)/)
  // 节点看「那一周里有没有轮次」，阶段看「那个阶段里有没有全量轮」—— 两者用的是各自的尺子。
  assert.match(source, /rounds\.find\(\(entry\) => entry\.day >= weekStart && entry\.day <= weekEnd\)/, '节点状态来自落在那一周里的轮次')
  assert.match(source, /entry\.coverage === '全量' && entry\.day >= phase\.days\[0\]/, '阶段那一行看的是全量轮')
  for (const word of ['已考', '待完成', '待补考', '未解锁']) {
    assert.match(source, new RegExp(`${word}`), `四种状态都要有：${word}`)
  }
  // 两个概念不许再并排：「能力曲线点」是**能力项**的逐项读数，和四维图不是一回事。
  // 而且这句里不许出现 `**` —— 它是 React 的纯文本节点，不解析 Markdown，星号会原样显示给用户。
  assert.match(source, /逐项曲线点/, '曲线点要说明它是逐项读数')
  assert.match(source, /能力项各自的自评读数/, '两个概念要分开说')
  assert.doesNotMatch(source, /\*\*能力项\*\*/, '不要往界面文案里写 Markdown 加粗')
})

await check('右侧「今日」与左侧同一套语言：读数、印章、完成反馈', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // 右侧本来是另一套：自己画的两个小方盒、自己的字号、自己的绿色、原生 checkbox。
  // 不猜窗口长度 —— 从头切到文件尾（这两个组件就在文件尾部），否则一条魔数会悄悄把断言变成空转。
  const right = source.slice(source.indexOf('function RightTaskCard('))
  assert.match(right, /h\(Readout, \{ key: 'done'/, '右侧用同一套读数（等宽大数字 + 小标签）')
  assert.match(right, /h\(Seal, \{ key: 'seal'/, '连续打卡也落一枚章')
  assert.match(right, /role: 'checkbox'/, '勾选框和左侧一样是能填色的按钮')
  // 这两条区分范围：另配的绿色全文件都不该再有；原生 checkbox 只针对这两个组件
  //（④ 可迁移能力里那个是「选做过哪些」，不是完成反馈，属于另一处界面）。
  assert.doesNotMatch(right, /type: 'checkbox'/, '原生 checkbox 不许留在右侧')
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
  assert.equal(tools.TOOL_NAMES.length, 6)
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

await check('连续打卡天数从全部任务打卡日的并集数', () => {
  // 同一任务连打三天 —— 按「每任务最新日」算会读成 1 天。
  const progress = { tasks: { T1: { checkInDates: ['2026-09-25', '2026-09-26', '2026-09-27'] } } }
  assert.equal(model.streakDays(progress, '2026-09-27'), 3)
  assert.equal(model.streakDays(progress, '2026-09-28'), 3, '今天还没打卡不算断')
  assert.equal(model.streakDays(progress, '2026-09-30'), 0)
  assert.equal(model.streakDays({ tasks: {} }, '2026-09-27'), 0)
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
async function callApi(method, url, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  const req = {
    method,
    url,
    async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk },
  }
  let status
  let payload = ''
  const res = { writeHead(code) { status = code; return this }, end(text) { payload = text ?? ''; return this } }
  await api.handleApi(req, res)
  let parsed
  try { parsed = JSON.parse(payload) } catch { parsed = { raw: payload } }
  return { status, body: parsed }
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

await check('未知路由是 404', async () => {
  const reply = await callApi('GET', `${api.API_PREFIX}/nope`)
  assert.equal(reply.status, 404)
})

rmSync(home, { recursive: true, force: true })

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${String(failures)} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
