/**
 * `dsh-growth-workbench` — the domain model.
 *
 * Everything that defines what a growth plan *is*, with no I/O and no Harness
 * imports, so it can be unit-tested from a plain `node`:
 *
 *  - the capability models (`roles`): groups, weights, 1/3/5 anchors
 *  - the weighted gap 
 *  - the completion rate and streak 
 *  - the four-dimension rubric and its grade bands 
 *  - the curve-point rules 
 *
 * The field names are the ones the original skills use (`一句话动作`, `能力项`,
 * `完成率`, …). That is deliberate: the contract document is the single source
 * of truth, and a second vocabulary for the same thing is how two definitions
 * drift apart.
 *
 * @module dsh-growth-workbench/model
 */

/** 组内权重 → 系数。名字就是锚点表里的那一列。 */
export const LEVEL_COEF = { 高: 3, 中: 2, 低: 1 }

/** 默认目标分：岗位达标线。 */
export const DEFAULT_TARGET_SCORE = 3

/** 证据档位，从低到高。`null` 不在这条链上。 */
export const EVIDENCE_TIERS = ['自述', '过程', '成果']

/** 档位序号，用于「达到某档位」的比较；`null`（没交证据）记 -1。 */
export function tierRank(tier) {
  const index = EVIDENCE_TIERS.indexOf(tier)
  return index === -1 ? -1 : index
}

/**
 * The capability models this build ships.
 *
 * `items[].level` is the 组内权重 column of the source table, and the weights
 * come from the group percentages in the heading — nothing here is invented.
 * `status: 'draft'` travels with the model: the anchors are a first pass and
 * the product must say so rather than imply they were reviewed.
 */
export const ROLES = {
  // 三个新方向。与 data-ops 同一形状：2 组、各 5 项、权重合计 100、每项三条 1/3/5 锚点。
  // status 一律 `draft` —— 这是**人写的草稿**，不是行业校准过的模型；这个区分必须活着，
  // 否则由它推出来的每个分数都会显得权威，而它们并不是。
  'fde': {
    slug: 'fde',
    name: 'FDE工程师',
    status: 'draft',
    positioning: '驻到客户的业务里，把 AI 能力落成能用起来的东西：先弄懂客户的真实流程，再决定做什么、怎么接、怎么验证。交付的是「在客户环境里跑起来并有人用」。',
    groups: [
      { key: 'A', name: '业务落地', weight: 60 },
      { key: 'B', name: '工程交付', weight: 40 },
    ],
    items: [
      { id: 'A1', group: 'A', name: '客户场景澄清', level: '高', anchors: ['知道要问客户什么', '能画出客户当前的真实流程与卡点', '能区分客户说的需求与真正要解决的问题，并让客户认账'] },
      { id: 'A2', group: 'A', name: '方案边界与取舍', level: '高', anchors: ['知道方案有边界', '能说清哪些做、哪些不做及代价', '能在客户期望、模型能力与交付成本之间做出可辩护的取舍'] },
      { id: 'A3', group: 'A', name: '价值验证设计', level: '高', anchors: ['知道要证明有用', '能定出一两个可测的指标', '能设计上线前后的对照并让客户一起认这个口径'] },
      { id: 'A4', group: 'A', name: '客户沟通与预期管理', level: '中', anchors: ['能听懂客户在担心什么', '能把技术限制讲成客户能理解的话', '能在进度或效果不如预期时主动说清并给出下一步'] },
      { id: 'A5', group: 'A', name: '行业与流程理解', level: '中', anchors: ['看得懂客户的基本业务', '能问出这个行业里真正在乎的指标', '能把行业约束转成产品与工程上的决定'] },
      { id: 'B1', group: 'B', name: 'AI 能力接入', level: '高', anchors: ['会调模型接口', '能把模型接进现有系统并处理异常', '能针对客户数据与环境调整方案、控制成本与延迟'] },
      { id: 'B2', group: 'B', name: '提示词与效果调优', level: '高', anchors: ['知道提示词会影响结果', '能按客户语料改出可用的提示词', '能建立版本与评测，让效果在客户环境里稳定复现'] },
      { id: 'B3', group: 'B', name: '部署与集成', level: '高', anchors: ['知道要部署到哪', '能按客户环境完成一次部署', '能处理权限、网络、数据合规等真实约束并留下可复现的步骤'] },
      { id: 'B4', group: 'B', name: '交付文档与交接', level: '中', anchors: ['知道要留文档', '能写出客户方看得懂的说明', '能把方案、限制与运维要点交接出去，客户能自己接住'] },
      { id: 'B5', group: 'B', name: '上线后监控与迭代', level: '中', anchors: ['知道上线要看什么', '能搭出基本的用量与失败监控', '能根据真实使用数据提出下一轮改动'] },
    ],
  },
  'ai-qa': {
    slug: 'ai-qa',
    name: 'AI测试',
    status: 'draft',
    positioning: '为 AI 功能建一套可信的质量判断：失败类型、样本集、评分规则、回归与上线门槛。交付的是「这个功能能不能上线」的依据，而不是跑一遍看看。',
    groups: [
      { key: 'A', name: '测试设计', weight: 60 },
      { key: 'B', name: '质量与安全', weight: 40 },
    ],
    items: [
      { id: 'A1', group: 'A', name: '失败类型识别', level: '高', anchors: ['知道 AI 会出错', '能列出一个功能的常见失败类型', '能按代价给失败类型分级，并据此决定测到什么程度'] },
      { id: 'A2', group: 'A', name: '样本集设计', level: '高', anchors: ['知道要用真实样本', '能收集并整理出覆盖主要场景的样本集', '能让样本集覆盖边界、长尾与对抗输入，并说明覆盖了哪些、漏了哪些'] },
      { id: 'A3', group: 'A', name: '评分规则与判据', level: '高', anchors: ['知道要有个标准', '能为一个任务写出可执行的评分规则', '能把主观判断拆成可复核的分级判据，并验证不同人打出一致结果'] },
      { id: 'A4', group: 'A', name: '归因分析', level: '高', anchors: ['知道结果不对要查原因', '能区分是模型、提示词、数据还是流程的问题', '能用对照实验定位到具体环节并给出可验证的修法'] },
      { id: 'A5', group: 'A', name: '回归与自动化', level: '中', anchors: ['知道改完要重测', '能维护一套回归用例', '能把回归接进发布流程，改动后自动跑并给出可读的差异'] },
      { id: 'B1', group: 'B', name: '幻觉与拒答评估', level: '高', anchors: ['知道模型会编', '能设计出诱发幻觉与不当拒答的用例', '能量化幻觉率与拒答率，并定出可接受的阈值'] },
      { id: 'B2', group: 'B', name: '安全与越权测试', level: '高', anchors: ['知道要测越权', '能设计提示注入、越权与隐私泄露的测试用例', '能覆盖多类攻击面并给出上线前的阻断条件'] },
      { id: 'B3', group: 'B', name: '上线门槛定义', level: '高', anchors: ['知道要有个准入门槛', '能为一个功能写出准确率与安全性的验收条件', '能结合业务代价定出可辩护的上线门槛，并让产品与研发一起认'] },
      { id: 'B4', group: 'B', name: '测试报告与结论', level: '中', anchors: ['知道要写结论', '能写出一份说清测了什么、结论是什么的报告', '能用证据支撑「能上/不能上」的判断，并说明残余风险'] },
      { id: 'B5', group: 'B', name: '线上质量监控', level: '中', anchors: ['知道上线后还要看', '能定义几个线上质量信号', '能从线上数据里发现测试没覆盖到的问题并回补用例'] },
    ],
  },
  'ai-delivery': {
    slug: 'ai-delivery',
    name: 'AI交付工程师',
    status: 'draft',
    positioning: '把 AI 方案从「能演示」推到「能交付」：环境、数据、接口、权限、成本、运维，一样都不能少。交付的是客户能自己跑起来的系统与接手说明。',
    groups: [
      { key: 'A', name: '交付工程', weight: 60 },
      { key: 'B', name: '运行与协作', weight: 40 },
    ],
    items: [
      { id: 'A1', group: 'A', name: '环境与依赖梳理', level: '高', anchors: ['知道交付要看环境', '能列出目标环境的依赖与限制', '能把环境差异提前暴露并给出可执行的安装与回滚步骤'] },
      { id: 'A2', group: 'A', name: '数据接入与治理', level: '高', anchors: ['知道要用客户的数据', '能完成一次数据接入并核对正确性', '能处理脱敏、权限、增量与失败重试等真实问题并留下记录'] },
      { id: 'A3', group: 'A', name: '接口与集成', level: '高', anchors: ['知道要对接系统', '能按客户系统完成一次接口对接', '能处理鉴权、限流、超时与降级，并让对接方按文档自助接入'] },
      { id: 'A4', group: 'A', name: '成本与性能控制', level: '中', anchors: ['知道调用要花钱', '能算出一次调用的基本成本', '能在效果、延迟与成本之间做出取舍并给出监控口径'] },
      { id: 'A5', group: 'A', name: '发布与回滚', level: '高', anchors: ['知道发布要谨慎', '能写出一次发布与回滚的步骤', '能在灰度、回滚与变更窗口上做出安排，出问题时按预案处置'] },
      { id: 'B1', group: 'B', name: '运维与可观测性', level: '高', anchors: ['知道上线要看日志', '能搭出基本的日志与告警', '能从指标、日志、链路三处定位线上问题并给出根因'] },
      { id: 'B2', group: 'B', name: '交付文档与验收', level: '高', anchors: ['知道要留交付物', '能写出客户方看得懂的部署与使用说明', '能组织一次验收，把功能、限制与后续责任写清楚'] },
      { id: 'B3', group: 'B', name: '客户培训与接手', level: '中', anchors: ['知道要教会客户', '能做一次完整的操作培训', '能让客户方独立完成日常操作与常见故障处理'] },
      { id: 'B4', group: 'B', name: '问题响应与复盘', level: '中', anchors: ['知道出问题要响应', '能按优先级处理客户问题', '能把重复出现的问题沉淀成文档或改动，而不是每次救火'] },
      { id: 'B5', group: 'B', name: '跨团队协作', level: '中', anchors: ['知道要和多方对接', '能把产品、研发与客户的信息对齐', '能推动不同团队围绕交付目标形成一致决定'] },
    ],
  },
  'data-ops': {
    slug: 'data-ops',
    name: '数据运营',
    status: 'draft',
    positioning: '通过监控和分析数据，为业务决策、产品迭代和运营策略提供依据。数据运营交付的是判断——看板、分析报告、实验结论、优化建议。',
    groups: [
      { key: 'A', name: '指标与口径', weight: 30 },
      { key: 'B', name: '业务分析', weight: 30 },
      { key: 'C', name: '策略与推动', weight: 25 },
      { key: 'D', name: '表达与复盘', weight: 15 },
    ],
    items: [
      { id: 'A1', group: 'A', name: '指标体系搭建', level: '高', anchors: ['知道 DAU/留存是什么', '能为一款产品搭出北极星+一级指标', '能设计指标树并推动口径治理'] },
      { id: 'A2', group: 'A', name: '埋点与口径审计', level: '高', anchors: ['看得懂埋点文档', '能发现口径不一致并提出修正', '能建立口径治理流程并落地'] },
      { id: 'A3', group: 'A', name: '指标异动归因', level: '高', anchors: ['能看出数字涨跌', '能定位到具体环节', '能区分波动与趋势并给出结论'] },
      { id: 'A4', group: 'A', name: '报表与看板设计', level: '中', anchors: ['会用现成看板', '能为一个业务搭出可用看板', '能设计分层看板并控制信息量'] },
      { id: 'A5', group: 'A', name: '数据质量监控', level: '中', anchors: ['知道要查数据对不对', '能写出基础校验规则', '能建立数据质量预警机制'] },
      { id: 'A6', group: 'A', name: 'SQL 取数', level: '高', anchors: ['会写单表查询', '能多表关联取业务口径数据', '能写窗口函数做复杂分层'] },
      { id: 'A7', group: 'A', name: '统计基础', level: '低', anchors: ['知道均值中位数', '理解分布与抽样', '能判断显著性并避免常见谬误'] },
      { id: 'B1', group: 'B', name: '漏斗分析', level: '高', anchors: ['知道漏斗是什么', '能定位流失最大的环节', '能结合业务判断该环节的真因'] },
      { id: 'B2', group: 'B', name: '分群与对比', level: '高', anchors: ['会按单一维度拆数', '能多维度交叉定位问题', '能设计有业务解释力的分群'] },
      { id: 'B3', group: 'B', name: 'A/B 实验设计与判读', level: '高', anchors: ['知道 A/B 是什么', '能设计一次规范的实验', '能识别实验偏差与辛普森悖论'] },
      { id: 'B4', group: 'B', name: '用户行为分析', level: '中', anchors: ['看得懂行为路径图', '能还原典型用户路径', '能从行为反推用户意图'] },
      { id: 'B5', group: 'B', name: '竞品与市场分析', level: '低', anchors: ['会收集竞品数据', '能做有结构的对比', '能输出可行动的市场判断'] },
      { id: 'B6', group: 'B', name: '业务理解', level: '高', anchors: ['知道公司在做什么生意', '能说清所在业务的盈利模式', '能预判业务下一步的关键变量'] },
      { id: 'C1', group: 'C', name: '从数据到结论', level: '高', anchors: ['能复述数字', '能给出有依据的结论', '能给出结论并标出不确定性'] },
      { id: 'C2', group: 'C', name: '提出优化建议', level: '高', anchors: ['能指出异常', '能给出可执行的改进方向', '能推动建议落地并回收效果'] },
      { id: 'C3', group: 'C', name: '跨部门协作', level: '中', anchors: ['能把需求说清楚', '能推动对方配合', '能对齐多方目标达成共识'] },
      { id: 'C4', group: 'C', name: '需求承接与澄清', level: '中', anchors: ['能接住一个取数需求', '能问出对方真实要回答的问题', '能把模糊需求转成可验证命题'] },
      { id: 'D1', group: 'D', name: '分析报告写作', level: '高', anchors: ['能把结论写清楚', '能写出问题-方法-结论完整报告', '能写出让决策者直接行动的结论'] },
      { id: 'D2', group: 'D', name: '可视化表达', level: '中', anchors: ['会画基础图表', '能选对图表类型表达观点', '能用最少图表说清最复杂的事'] },
      { id: 'D3', group: 'D', name: '复盘与沉淀', level: '低', anchors: ['会记录做过什么', '能总结可复用的方法', '能沉淀成团队可用的规范'] },
    ],
  },
}

/**
 * Where a target role sits on the quality ladder (question-bank.md), plus the
 * one rung this build adds.
 *
 * `preset` has a shipped, human-authored capability model, so the
 * self-assessment and the gap can land item by item. `generated` is a model the
 * agent produced for a direction nothing shipped — it is structurally validated
 * (see {@link capabilityModelProblems}) but **not industry-calibrated**, and the
 * product says so rather than letting it pass for a preset one. The last two are
 * honestly coarser still.
 */
export const ROLE_STATUS = {
  preset: { label: '预置方向', note: '有完整能力模型，可以逐项自评。' },
  generated: { label: 'AI 生成的能力模型', note: '锚点由 AI 生成、未经人工校准，打分时按自己的判断来。' },
  building: { label: '模型建设中', note: '还没有能力模型，可以让 AI 生成一份。' },
  beta: { label: 'Beta 岗位', note: '这个方向还没有能力模型，可以让 AI 生成一份。' },
}

/** The 方向 the intake offers, with the status each one honestly carries. */
export const ROLE_CHOICES = [
  { slug: 'data-ops', name: '数据运营', status: 'preset', positioning: '通过监控和分析数据，为业务决策、产品迭代和运营策略提供依据。' },
  { slug: 'product-ops', name: '产品运营', status: 'building', positioning: '提升产品核心指标。' },
  { slug: 'user-ops', name: '用户运营', status: 'building', positioning: '经营用户生命周期。' },
  { slug: 'qa-agent', name: 'Agent 应用开发', status: 'building', positioning: '用 AI Agent 的形式构建可运行、可验证、可维护的智能应用。' },
  { slug: 'ai-pm', name: 'AI产品经理', status: 'beta', positioning: '用AI能力定义产品方向、写PRD、推进落地，重需求理解+AI工具链。' },
  { slug: 'data-analysis', name: '数据分析·商业分析', status: 'beta', positioning: '用SQL/Excel/Python把业务数据变成可决策的洞察与报告。' },
  { slug: 'growth', name: '互联网运营·增长', status: 'beta', positioning: '围绕拉新-留存-转化做内容和活动，用数据驱动增长。' },
  { slug: 'fullstack', name: '全栈工程师', status: 'beta', positioning: '贯通前端、后端与数据链路，独立交付可上线的完整业务功能。' },
  // 三个新方向：它们**已经有模型**（见上面的 ROLES），所以状态是 preset 而不是 beta ——
  // beta 的说明是「还没有能力模型，可以让 AI 生成一份」，对它们已经不成立了。
  { slug: 'fde', name: 'FDE工程师', status: 'preset', positioning: '驻到客户的业务里，把 AI 能力落成能用起来的东西：先弄懂流程，再决定做什么、怎么接、怎么验证。' },
  { slug: 'ai-qa', name: 'AI测试', status: 'preset', positioning: '为 AI 功能建一套可信的质量判断：失败类型、样本集、评分规则、回归与上线门槛。' },
  { slug: 'ai-delivery', name: 'AI交付工程师', status: 'preset', positioning: '把 AI 方案从「能演示」推到「能交付」：环境、数据、接口、权限、成本、运维，一样都不能少。' },
]

/**
 * The custom direction: everything the目录 does not list.
 *
 * A custom name is allowed, and it always starts as `beta` — there is no way to
 * know how well a self-declared direction matches what employers mean by it, so
 * the product says `beta` until a capability model exists for it.
 */
export const CUSTOM_SLUG = 'custom'

/**
 * The follow-up questions each 当前状态 answer earns.
 *
 * The four intake questions are the same for everyone; these are not. Someone
 * 在校 has a 专业 and a 年级, someone 在职 has a 岗位, someone 自由 has whatever
 * they actually do for money — and the whole point of asking is that the
 * capability model and the 可迁移底盘 are derived **from this**, not from a table
 * we fixed in advance.
 *
 * `feed` names what the answer feeds, so the agent's briefing can say where a
 * fact came from:
 *
 *   - `background` — context for the 底盘 proposal
 *   - `skills`     — the actual skills the 底盘 proposal should be drawn from
 */
export const BACKGROUND_QUESTIONS = {
  A: {
    when: '在校 / 应届',
    why: '在校生和应届生的判断依据是专业与年级：大一问「转哪个方向」和研二问，答案完全不同。',
    fields: [
      { key: 'major', label: '专业', placeholder: '例：计算机科学与技术 / 汉语言文学', required: true, feed: 'background' },
      {
        key: 'grade',
        label: '年级',
        required: true,
        feed: 'background',
        options: ['大一', '大二', '大三', '大四', '研究生', '应届已毕业'],
      },
    ],
  },
  B: {
    when: '在职同方向',
    why: '同方向进阶的底盘来自你已经在做的事：岗位越具体，能迁移的证据越具体。',
    fields: [
      { key: 'currentJob', label: '当前岗位', placeholder: '例：测试工程师 / 数据分析师', required: true, feed: 'background' },
      { key: 'years', label: '做了多久', placeholder: '例：3 年', feed: 'background' },
      { key: 'scope', label: '日常经手的事', placeholder: '例：写用例、跑回归、跟发布', feed: 'skills' },
    ],
  },
  C: {
    when: '在职想转行',
    why: '转行的底盘线索全在现岗位里。岗位与所在行业决定「哪些经验能翻译过去」，也决定「哪些必须重学」。',
    fields: [
      { key: 'currentJob', label: '当前岗位', placeholder: '例：测试工程师', required: true, feed: 'background' },
      { key: 'industry', label: '所在行业', placeholder: '例：电商 / 金融 / 制造业', feed: 'background' },
      { key: 'years', label: '做了多久', placeholder: '例：5 年', feed: 'background' },
      { key: 'scope', label: '日常经手的事', placeholder: '例：需求评审、缺陷跟踪、上线验收', required: true, feed: 'skills' },
    ],
  },
  D: {
    when: '自由 / 副业',
    why: '自由职业没有岗位名可查，只有"实际靠什么吃饭"。所以这里问的是收入来源、已经在交付的东西、拿得出手的技能——这三样是可迁移底盘唯一的抓手。',
    fields: [
      {
        key: 'income',
        label: '收入主要来自',
        required: true,
        feed: 'background',
        options: ['接单 / 外包', '内容 / 自媒体', '自有产品或小生意', '还没有收入'],
      },
      { key: 'dollars', label: '已经在交付的东西', placeholder: '例：给小店做小程序、给品牌写文案', required: true, feed: 'skills' },
      { key: 'strengths', label: '拿得出手的技能（逗号分隔）', placeholder: '例：React、文案、谈客户', feed: 'skills' },
    ],
  },
}

/** 当前状态答案 → 它的追问。没有答案时给空，页面会提示先答第 ② 题。 */
export function backgroundQuestionsFor(intake) {
  return BACKGROUND_QUESTIONS[intake?.q1] ?? undefined
}

/**
 * The 可迁移底盘 is **derived, never fixed**.
 *
 * This build ships no built-in 底子 table on purpose. The original skill had a
 * 测试→数据运营 translation table, and it was wrong for everyone who was not a
 * tester: a 在校生 has no "怀疑 / 边界 / 复现" to confirm, and 自由职业者 would
 * recognise none of it. The 底子 a person actually has is a function of their
 * 岗位 / 专业 / 技能, so it is proposed by the agent from the background answers
 * and confirmed item by item by the user.
 */
export const TRANSFERABLE_NOTE = {
  needsBackground: '先答完「你的条件」，尤其是「当前状态」那题，才能生成候选。',
  awaitingProposal: 'AI 还没有为你的现状生成底盘清单。回对话里说一句「帮我看看我有什么底子」，它会读你的岗位/专业/技能给出候选，你再逐条确认哪些是真的。',
  proposePrompt: '帮我看看我有什么底子',
}

/** The four intake questions (question-bank.md), each answered by one click. */
export const INTAKE_QUESTIONS = [
  {
    key: 'q1',
    title: '你的身份',
    options: [
      { value: 'A', label: '在校 / 应届', hint: '有时间，缺实战经验' },
      { value: 'B', label: '在职同方向', hint: '有相关经验，想进阶' },
      { value: 'C', label: '在职想转行', hint: '有职场经验但跨岗' },
      { value: 'D', label: '自由 / 副业', hint: '时间弹性，要结果导向' },
    ],
  },
  {
    key: 'q2',
    title: '每天可投入',
    options: [
      { value: 'A', label: '约 30 分钟', hint: '碎片时间' },
      { value: 'B', label: '约 1 小时', hint: '常规节奏' },
      { value: 'C', label: '2 小时以上', hint: '时间充足' },
      { value: 'D', label: '仅周末', hint: '工作日几乎没空' },
    ],
  },
  {
    key: 'q3',
    title: '核心目标',
    options: [
      { value: 'A', label: '入行转岗', hint: '拿到该岗位 offer' },
      { value: 'B', label: '在职晋升', hint: '现有岗位向该能力进阶' },
      { value: 'C', label: '副业变现', hint: '用该技能接单 / 做内容' },
      { value: 'D', label: '系统打基础', hint: '构建完整知识体系' },
    ],
  },
  {
    key: 'q4',
    title: '时间期限',
    options: [
      { value: 'A', label: '1 个月', hint: '极快，只做最值钱的事' },
      { value: 'B', label: '90 天', hint: '标准，3 阶段' },
      { value: 'C', label: '半年', hint: '充裕，扎实做项目' },
      { value: 'D', label: '1 年', hint: '长线，含系统补基础' },
    ],
  },
]

/** 用户跳过时的最保守默认值（question-bank.md）：在职同方向 / 1 小时 / 系统打基础 / 90 天。 */
export const INTAKE_DEFAULTS = { q1: 'B', q2: 'B', q3: 'D', q4: 'B' }

/** 三条路线（question-bank.md）。 */
export const ROUTES = [
  { name: '稳妥路线', fit: '在职、时间少、求稳', tradeoff: '战线长，但成功率最高', rhythm: '基础→实战→作品→巩固' },
  { name: '冲刺路线', fit: '转岗、目标明确、时间多', tradeoff: '快、聚焦，但跳步有风险', rhythm: '核心技能→最快出作品→求职冲刺' },
  { name: '系统路线', fit: '在校 / 打基础', tradeoff: '慢，但底盘扎实', rhythm: '底层知识→专项→综合项目→进阶' },
]

/** 路线默认：用户不选时取它（question-bank.md 的默认假设）。 */
export const DEFAULT_ROUTE = '稳妥路线'

/**
 * 可迁移底盘曾是这里的一张硬编码表（测试的 怀疑 / 边界 / 复现 / 验证 / 闭环）。
 *
 * 它被删掉了，因为对**不是测试的人**它全是错的：在校生没有"复现"可确认，
 * 自由职业者一条也认不出来。底盘是 岗位 / 专业 / 技能 的函数，所以现在由
 * Agent 从追问答案推出来（见 `TRANSFERABLE_NOTE`），再交由用户逐条确认。
 */



/** 四维 rubric，每维 0-25。分数段自上而下，遇到第一个满足的就停。 */
export const RUBRIC = {
  完成率: [
    { min: 21, test: (v) => v >= 0.8, text: '完成率 ≥ 80%，节奏正常' },
    { min: 16, test: (v) => v >= 0.6, text: '完成率 60-79%，偶尔落后' },
    { min: 11, test: (v) => v >= 0.4, text: '完成率 40-59%，明显滞后' },
    { min: 0, test: () => true, text: '完成率 < 40%，需干预' },
  ],
  证据质量: [
    { min: 21, test: (s) => s.成果 > 0 && s.成果 >= s.过程, text: '高置信度：有可检查成果' },
    { min: 16, test: (s) => s.过程 > 0, text: '中置信度：有过程痕迹，但无最终成果' },
    { min: 11, test: (s) => s.自述 > 0 || s.成果 + s.过程 + s.自述 > 0, text: '低置信度：仅有自述' },
    { min: 0, test: () => true, text: '只有勾选，无任何证据' },
  ],
}

/** 总分定级。 */
export const GRADE_BANDS = [
  { min: 85, grade: '优', action: '照常推进下一阶段' },
  { min: 70, grade: '良', action: '小调整后推进' },
  { min: 55, grade: '及格', action: '针对薄弱项补强，不换方向' },
  { min: 0, grade: '需努力', action: '缩减任务量，聚焦 1-2 个核心项重来，保留已学' },
]

/** 任务粒度适配度—— 观察项，不计分，但决定调整往哪走。 */
export const ATTRIBUTIONS = [
  { key: 'plan', name: '计划问题', symptoms: ['任务太重', '任务太轻', '顺序错'], action: '调任务定义（唯一允许改任务的归因）' },
  { key: 'ability', name: '能力问题', symptoms: ['学了但不会用'], action: '换学习方式、加练习，不动任务定义' },
  { key: 'drive', name: '动力问题', symptoms: ['不想做', '拖延'], action: '降级任务、缩小目标' },
  { key: 'direction', name: '方向问题', symptoms: ['不想要这个岗位了'], action: '重新规划，回到规划流程' },
]

/** 八行反馈表—— 用户说了什么 → 动哪里。 */
export const FEEDBACK_ROWS = [
  { key: 'too-hard', says: '任务太重 / 做不完', mechanism: '换成该任务的 `最低完成版本`，不加量', dimension: '完成率' },
  { key: 'no-time', says: '没时间 / 太忙', mechanism: '先给 `最低完成版本`；仍不行则该阶段每天只留 1 个任务', dimension: '完成率' },
  { key: 'no-evidence', says: '做完了但没留东西', mechanism: '下一个任务明确"交什么作为证据"，可验收', dimension: '证据质量' },
  { key: 'shallow', says: '做了但没有成果', mechanism: '给补强任务清单，针对缺的「问题/方法/结论」某一块', dimension: '作品达标度' },
  { key: 'vague', says: '概念讲不清 / 只会照做', mechanism: '出 2-3 道针对性自测题，答对再进下一阶段', dimension: '知识考核' },
  { key: 'stuck', says: '卡住了 / 不知道下一步', mechanism: '回到计划里该阶段的下一个任务，按 `前置依赖` 顺序走', dimension: '完成率' },
  { key: 'burden', says: '心理负担大 / 越做越焦虑', mechanism: '降级到 `最低完成版本`；小成功必须落在关键路径上，最多连着给 2 次', dimension: '完成率' },
  { key: 'too-easy', says: '太简单 / 没挑战', mechanism: '先查证据档位：有 `成果` 才提高真实性，否则先要成果', dimension: '证据质量' },
]

/** 五条铁律—— 唯一真相源，这里只给编号与一句话，细则在文档里。 */
export const IRON_RULES = [
  '完成率 < 40%：减量（该阶段每天只留 1 个任务、按最低完成版本交），不是加量、不是鼓励。',
  '证据质量低：下次任务明确"提交什么作为证据"，可验收。',
  '作品不达标：给补强任务清单（针对缺的「问题/方法/结论」某一块）。',
  '知识含糊：给 2-3 道针对性自测题，答对再进下一阶段。',
  '任何情况下：保留已完成技能，只动局部，不整体重置。',
]

// ---------------------------------------------------------------- 权重与差距

/** 某能力项在能力模型里的权重 `w(i) = 组权重 × 组内系数`。 */
export function itemWeight(role, item) {
  const group = role.groups.find((g) => g.key === item.group)
  if (group === undefined) throw new Error(`capability ${item.id} references unknown group ${item.group}`)
  return group.weight * LEVEL_COEF[item.level]
}

/**
 * 加权缺口与补强优先级。
 *
 * 未确认（`null`）的项**不进分母、也不补零** —— 补零会造出一个虚假的巨大差距。
 * @param role - the capability model.
 * @param scores - `{ [itemId]: 1|2|3|4|5|null }`.
 * @param target - target score per item; defaults to the 岗位达标线.
 */
export function gapAnalysis(role, scores, target = DEFAULT_TARGET_SCORE) {
  const answered = []
  const skipped = []
  for (const item of role.items) {
    const score = scores[item.id]
    if (typeof score !== 'number') skipped.push(item.id)
    else answered.push({ item, score, weight: itemWeight(role, item) })
  }
  const W = answered.reduce((sum, entry) => sum + entry.weight, 0)
  const gap = W === 0
    ? null
    : answered.reduce((sum, entry) => sum + (target - entry.score) * entry.weight, 0) / W
  const priorities = answered
    .map((entry) => ({
      id: entry.item.id,
      name: entry.item.name,
      group: entry.item.group,
      score: entry.score,
      weight: entry.weight,
      shortfall: (target - entry.score) * entry.weight,
    }))
    .filter((entry) => entry.shortfall > 0)
    .sort((left, right) => right.shortfall - left.shortfall)
  const unansweredGroups = [...new Set(skipped.map((id) => role.items.find((i) => i.id === id).group))].sort()
  return { gap, W, answeredCount: answered.length, skippedCount: skipped.length, priorities, unansweredGroups }
}

/**
 * 「高权重项」的选取：组内权重为 *高* 的全部条目，
 * 超过 10 条时按「组权重降序 → 组内编号升序」取前 10。
 */
export function highWeightItems(role, limit = 10) {
  const picked = role.items.filter((item) => item.level === '高')
  if (picked.length <= limit) return picked
  const order = new Map(role.groups.map((g) => [g.key, g.weight]))
  return [...picked]
    .sort((left, right) => (order.get(right.group) - order.get(left.group)) || left.id.localeCompare(right.id))
    .slice(0, limit)
}

// ---------------------------------------------------------------- 进度口径

/**
 * 完成率：**整个计划口径**。
 *
 * 分子是已勾选任务数，分母是计划内**全部已排出**的任务数 —— 只排到周的阶段
 * 没有任务行，所以它们既不进分子也不进分母。
 */
export function completionRate(plan, progress) {
  const tasks = planTasks(plan)
  const done = tasks.filter((task) => progress?.tasks?.[task.id]?.done === true).length
  return { done, total: tasks.length, rate: tasks.length === 0 ? null : done / tasks.length }
}

/** 计划里的全部任务，按阶段与天展开，并补上派生字段（`任务引用` / `阶段` / `天`）。 */
export function planTasks(plan) {
  const out = []
  for (const [phaseIndex, phase] of (plan?.phases ?? []).entries()) {
    for (const [taskIndex, task] of (phase.tasks ?? []).entries()) {
      out.push({
        ...task,
        phaseIndex,
        phaseName: phase.name,
        phaseDays: phase.days,
        // `任务引用` 是派生标识：给人读，会随位置变，绝不当 key（§1.3）。
        ref: `${String(phaseIndex + 1)}.${String(taskIndex + 1)}`,
      })
    }
  }
  return out
}

/** 某个任务引用（`2.3`）指到的任务；关联不上返回 undefined。 */
export function taskByRef(plan, ref) {
  return planTasks(plan).find((task) => task.ref === ref)
}

/** 按 `任务标识` 关联（唯一允许用于持久化的身份，§1.4）。 */
export function taskById(plan, id) {
  return planTasks(plan).find((task) => task.id === id)
}

/**
 * 连续打卡天数：全部任务 `打卡日期` 的**并集**，从最近一次
 * 往前连续数。
 *
 * 用并集而不是"每个任务的最新日"：减量期用户每天只推进同一个任务，
 * 按后者算会把连打三天读成 1 天 —— 最需要正反馈的人看到最错的数字。
 */
export function streakDays(progress, today) {
  const days = new Set()
  for (const entry of Object.values(progress?.tasks ?? {})) {
    for (const date of entry?.checkInDates ?? []) days.add(date)
  }
  if (days.size === 0) return 0
  const cursor = new Date(`${today}T00:00:00.000Z`)
  if (!days.has(today)) {
    // 今天还没打卡不算断：从昨天起数。
    cursor.setUTCDate(cursor.getUTCDate() - 1)
    const yesterday = cursor.toISOString().slice(0, 10)
    if (!days.has(yesterday)) return 0
  }
  let count = 0
  for (;;) {
    const key = cursor.toISOString().slice(0, 10)
    if (!days.has(key)) return count
    count += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
}

/** 计划内第几天（从 `planStart` 起算，第 1 天就是 planStart）。 */
export function dayNumber(planStart, date) {
  if (typeof planStart !== 'string' || planStart.length === 0) return null
  const start = Date.parse(`${planStart}T00:00:00.000Z`)
  const now = Date.parse(`${date}T00:00:00.000Z`)
  if (Number.isNaN(start) || Number.isNaN(now)) return null
  return Math.floor((now - start) / 86400000) + 1
}

/** 计划第 N 天对应的日期。 */
export function dateOfDay(planStart, day) {
  const start = new Date(`${planStart}T00:00:00.000Z`)
  start.setUTCDate(start.getUTCDate() + (day - 1))
  return start.toISOString().slice(0, 10)
}

/**
 * 当前阶段：第 N 天落在哪个 `days` 区间里。
 *
 * 区间来自阶段标题里写的天区间，所以只排到周、`tasks` 为空的阶段照样能被判到 ——
 * 少了它，第 31 天起会永久报成阶段 1。
 */
export function currentPhase(plan, day) {
  if (day === null) return undefined
  return (plan?.phases ?? []).find((phase) => {
    const [from, to] = phase.days ?? []
    return typeof from === 'number' && typeof to === 'number' && day >= from && day <= to
  })
}

/** 本周完成率：只作恢复判据，不进四维打分。`null` 表示本周没排到任务。 */
export function weekRate(plan, progress, day) {
  if (day === null) return null
  const weekStart = Math.floor((day - 1) / 7) * 7 + 1
  const tasks = planTasks(plan).filter((task) => typeof task.day === 'number' && task.day >= weekStart && task.day <= weekStart + 6)
  if (tasks.length === 0) return null
  const done = tasks.filter((task) => progress?.tasks?.[task.id]?.done === true).length
  return done / tasks.length
}

/** 证据档位分布，供证据质量维打分（维度 2）。 */
export function evidenceDistribution(plan, progress) {
  const counts = { 成果: 0, 过程: 0, 自述: 0, 无证据: 0 }
  for (const task of planTasks(plan)) {
    const entry = progress?.tasks?.[task.id]
    if (entry?.done !== true) continue
    counts[tierRank(entry.tier) === -1 ? '无证据' : entry.tier] += 1
  }
  return counts
}

// ---------------------------------------------------------------- 打分

/** 按分数段取四维里的前两维（另两维需要人看作品与答题，由考核时给）。 */
export function rubricScore(completion, evidence) {
  const pick = (rows, value) => (rows.find((row) => row.test(value)) ?? rows[rows.length - 1]).min
  return {
    完成率: pick(RUBRIC.完成率, completion.rate ?? 0),
    证据质量: pick(RUBRIC.证据质量, evidence),
  }
}

/** 总分定级。 */
export function gradeOf(total) {
  return (GRADE_BANDS.find((band) => total >= band.min) ?? GRADE_BANDS[GRADE_BANDS.length - 1])
}

// ---------------------------------------------------------------- 证据流

/**
 * 本轮窗口：闭区间 `[上一轮评估日 + 1 天, 本次评估日]`。
 *
 * 以"上一次评估"为界而不是固定 30 天：考核间隔本来就不固定，固定窗口会让
 * 一段证据被算进两个窗口、另一段哪个都不算。
 */
export function reviewWindow(history, exported, day, planStart) {
  const previous = history.length > 0 ? history[history.length - 1].date : null
  if (previous === null) {
    // 首轮：起点取计划第 1 天。
    const start = day === null ? exported : dateOfDay(planStart, 1)
    return { from: start, to: exported }
  }
  const next = new Date(`${previous}T00:00:00.000Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return { from: next.toISOString().slice(0, 10), to: exported }
}

/**
 * 本轮窗口内是否有达到某档位的打卡。
 * @returns the highest tier seen inside the window, or `null`.
 */
export function windowTier(plan, progress, window, capabilityId) {
  let best = null
  for (const task of planTasks(plan)) {
    if (task.capability !== capabilityId) continue
    const entry = progress?.tasks?.[task.id]
    if (entry === undefined) continue
    const inside = (entry.checkInDates ?? []).some((date) => date >= window.from && date <= window.to)
    if (!inside) continue
    if (tierRank(entry.tier) > tierRank(best)) best = entry.tier
  }
  return best
}

/**
 * 给一条自评点定置信度：默认 `low`，窗口内有 `过程` 升
 * `medium`，有 `成果` 升 `high`。
 *
 * 这是**任务证据进入能力曲线的唯一通路** —— 证据本身不直接产生分数。
 */
export function selfPointConfidence(tier) {
  if (tierRank(tier) >= tierRank('成果')) return 'high'
  if (tierRank(tier) >= tierRank('过程')) return 'medium'
  return 'low'
}

/**
 * 能力曲线的点：`{日期, 第几天, 能力项, 分, 置信度, 证据档位, 来源}`。
 * 不带 `置信度` 与 `来源` 的点画出来是骗人的，所以这两个字段在这里强制存在。
 */
export function curvePoints(history) {
  const points = []
  for (const entry of history) {
    // 只有 `覆盖项集 = 全量` 的轮次才画线；定向轮的点进记录但不进曲线（§6.3）。
    if (entry.coverage !== '全量') continue
    for (const point of entry.curvePoints ?? []) {
      points.push({ 日期: entry.date, 第几天: entry.day, ...point })
    }
  }
  return points
}

/** 能不能用曲线宣称"能力提升"：至少要有 1 个考核点或 1 条 ≥过程 证据。 */
export function canClaimProgress(history, capabilityId) {
  for (const entry of history) {
    for (const point of entry.curvePoints ?? []) {
      if (point.能力项 !== capabilityId) continue
      if (point.来源 === '考核') return true
      if (tierRank(point.证据档位) >= tierRank('过程')) return true
    }
  }
  return false
}

// ---------------------------------------------------------------- 能力模型的来源

/**
 * Which capability model is in force for this profile.
 *
 * Two sources, one shape. The built-in `ROLES` entries are human-authored and
 * ship with a version; a `profile.capabilityModel` is what the agent generated
 * for a direction nothing shipped. Everything downstream — the self-assessment,
 * the weighted gap, the review's per-question anchoring — reads whatever this
 * returns, so a generated model gets the same machinery as a preset one.
 *
 * A generated model belongs to **one** direction: it carries `forSlug`, and it
 * stops applying the moment the target changes. Otherwise switching direction
 * would silently keep scoring you against the old one.
 *
 * @param profile - the 画像 document.
 * @returns the model, or `undefined` when the direction has none yet.
 */
export function resolveRole(profile) {
  const slug = profile?.targetRoleSlug ?? ''
  if (slug.length === 0) return undefined
  const generated = profile?.capabilityModel
  if (generated !== null && generated !== undefined && generated.forSlug === slug) return generated
  return ROLES[slug]
}

/**
 * Where the model in force came from, for the label the page shows.
 * @param profile - the 画像 document.
 * @returns `preset` / `generated` / the catalog status / `building` when there is none.
 */
export function resolveRoleStatus(profile) {
  const slug = profile?.targetRoleSlug ?? ''
  const generated = profile?.capabilityModel
  if (generated !== null && generated !== undefined && generated.forSlug === slug) return 'generated'
  if (ROLES[slug] !== undefined) return 'preset'
  const catalogEntry = ROLE_CHOICES.find((entry) => entry.slug === slug)
  return catalogEntry?.status ?? 'building'
}

/** 会被当成"占位符"的锚点写法 —— 一个字都没写的刻度不是刻度。 */
const PLACEHOLDER = /^(待补|待定|待完善|暂无|不详|todo|tbd|n\/a|…+|\.{2,}|[-—–]|无)$/i

/**
 * Structural problems in a capability model, whoever wrote it.
 *
 * Run on a generated model *before* it is saved, and asserted against the
 * shipped one in the offline checks — so the two can never drift apart.
 *
 * These are the failures that do not throw, they just make every number derived
 * from the model wrong:
 *
 *  - a group whose weight is `0` disappears from the weighted denominator while
 *    still being shown with anchors (more hidden than a total that misses 100);
 *  - weights that do not sum to 100 make `gap` incomparable across models;
 *  - a placeholder anchor means the user scores that item against nothing, and
 *    a 3 you invented is indistinguishable from a 3 you measured;
 *  - duplicate ids silently merge two capabilities into one column count.
 *
 * @param model - a model in the `ROLES` shape.
 * @returns the problems, in reading order. Empty means usable.
 */
export function capabilityModelProblems(model) {
  const problems = []
  if (model === null || typeof model !== 'object' || Array.isArray(model)) return ['能力模型必须是对象']
  if (typeof model.name !== 'string' || model.name.trim().length === 0) problems.push('name 不得为空')

  const groups = Array.isArray(model.groups) ? model.groups : null
  if (groups === null || groups.length < 2) problems.push('groups 至少要有 2 个组（一个组等于没有分层）')
  else {
    const keys = new Set()
    let sum = 0
    for (const group of groups) {
      const label = `组 ${String(group?.key ?? '?')}${typeof group?.name === 'string' ? `（${group.name}）` : ''}`
      if (typeof group?.key !== 'string' || group.key.trim().length === 0) problems.push(`${label}: key 不得为空`)
      else if (keys.has(group.key)) problems.push(`${label}: key 重复`)
      else keys.add(group.key)
      if (typeof group?.name !== 'string' || group.name.trim().length === 0) problems.push(`${label}: name 不得为空`)
      if (!Number.isInteger(group?.weight)) problems.push(`${label}: weight 必须是整数百分比`)
      else if (group.weight <= 0) problems.push(`${label}: weight 必须 > 0 —— 0% 的组会从加权分母里消失，却在页面上照样有锚点`)
      else sum += group.weight
    }
    if (sum !== 100) problems.push(`组权重合计必须是 100%，现在是 ${String(sum)}% —— 否则 gap 跨模型不可比`)
  }

  const items = Array.isArray(model.items) ? model.items : null
  if (items === null || items.length < 8) problems.push('items 至少要有 8 项（少于 8 项的模型做不出有意义的加权差距）')
  else if (items.length > 40) problems.push(`items 最多 40 项，现在 ${String(items.length)} 项（再多用户填不完）`)
  else {
    const ids = new Set()
    const groupKeys = new Set(groups === null ? [] : groups.map((group) => group.key))
    for (const item of items) {
      const label = `能力项 ${String(item?.id ?? '?')}`
      if (typeof item?.id !== 'string' || item.id.trim().length === 0) problems.push(`${label}: id 不得为空`)
      else if (ids.has(item.id)) problems.push(`${label}: id 重复 —— 重复的编号会把两项算成一列`)
      else ids.add(item.id)
      if (typeof item?.name !== 'string' || item.name.trim().length === 0) problems.push(`${label}: name 不得为空`)
      if (!groupKeys.has(item?.group)) problems.push(`${label}: group ${JSON.stringify(item?.group)} 不在 groups 里`)
      if (!Object.hasOwn(LEVEL_COEF, item?.level)) problems.push(`${label}: level 必须是 高 / 中 / 低，收到 ${JSON.stringify(item?.level)}`)
      const anchors = Array.isArray(item?.anchors) ? item.anchors : null
      if (anchors === null || anchors.length !== 3) {
        problems.push(`${label}: anchors 必须是 3 条（1 / 3 / 5 三个刻度）`)
        continue
      }
      anchors.forEach((anchor, index) => {
        const scale = [1, 3, 5][index]
        if (typeof anchor !== 'string' || anchor.trim().length === 0) problems.push(`${label}: ${String(scale)} 分锚点为空`)
        else if (PLACEHOLDER.test(anchor.trim())) problems.push(`${label}: ${String(scale)} 分锚点是占位符 ${JSON.stringify(anchor.trim())} —— 没有刻度就没法打分，写不出就说明这项还没定义`)
      })
      if (anchors.length === 3 && new Set(anchors.map((anchor) => String(anchor).trim())).size !== 3) {
        problems.push(`${label}: 三个锚点不能有重复 —— 重复的刻度等于没有梯度`)
      }
    }
  }

  if (typeof model.positioning !== 'string' || model.positioning.trim().length === 0) {
    problems.push('positioning 不得为空（一句话定位）')
  }
  return problems
}

/**
 * The background answers as readable lines, for the agent's briefing.
 *
 * The 底盘 proposal and a generated capability model are both derived from
 * these, so the briefing has to carry them verbatim — a paraphrase would hand
 * the agent a summary to invent from instead of the words the user typed.
 *
 * @param profile - the 画像 document.
 * @returns one line per answered field, or an empty array when nothing is answered.
 */
export function backgroundLines(profile) {
  const questions = backgroundQuestionsFor(profile?.intake)
  if (questions === undefined) return []
  const answers = profile?.background ?? {}
  const lines = []
  for (const field of questions.fields) {
    const value = answers[field.key]
    if (typeof value !== 'string' || value.trim().length === 0) continue
    lines.push(`${field.label}：${value.trim()}${field.feed === 'skills' ? '（底盘的主要来源）' : ''}`)
  }
  return lines
}

/** 未答的追问字段，用来判断"底盘能不能开始推"了。 */
export function missingBackground(profile) {
  const questions = backgroundQuestionsFor(profile?.intake)
  if (questions === undefined) return ['当前状态（② 的第一题）']
  const answers = profile?.background ?? {}
  return questions.fields
    .filter((field) => field.required === true && (typeof answers[field.key] !== 'string' || answers[field.key].trim().length === 0))
    .map((field) => field.label)
}

