/**
 * `dsh-growth-workbench` — browser half.
 *
 * Two entry points over one set of documents:
 *
 *  1. **左侧菜单「成长工作台」** — a full page in the main column, four tabs:
 *     今日 / 计划 / 考核 / 画像. Registered as the `sidebar.panellist` row plus the
 *     keyed `main` seat, the same pair `dsh-life-workbench` uses.
 *  2. **右侧「今日」Tab** — today's tasks only, for checking something off without
 *     leaving the conversation. Registered through `ctx.sidebarRightTabs` plus the
 *     keyed `sidebar.right.pane.tab` seat.
 *
 * The two seats live in different scopes (`main` is root-scoped, the tab is
 * session-scoped), so both bodies share one module-level refresh channel: a
 * check-in made in either place appears in the other without a reload.
 *
 * **What this page does and what the agent does.** The page collects, checks off
 * and displays; the agent generates and judges. The intake, the self-assessment
 * and the 底盘 confirmation are therefore forms, not chat prompts: every 1/3/5
 * anchor stays on screen while the user scores, and one click per item beats
 * twenty questions in a transcript. The agent reads the same files through its
 * tools, so neither side has to hand the other a copy.
 *
 * **「让 AI 来做」 buttons.** The three things the agent generates — a plan, a
 * capability model, the 底盘 proposal — used to be copy-this-phrase-and-paste-it
 * buttons, because the wording is not obvious and getting it wrong wastes a turn.
 * They now say it for you: the instruction is delivered as an **ordinary user turn
 * in the workbench's own conversation** (`resolveAgentSession` → `session.prompt`).
 *
 * **那个对话是固定的。** 从 ③ 可迁移能力起，所有运行都发进同一个专用对话（第一次用时
 * 自动新建、命名、并把 id 落进 `profile.agentSession`），而不是"你此刻打开的那个" ——
 * 上一轮的计划、考核、调整因此留在同一个上下文里。发送前会先把那个对话变成当前对话
 * （`sessions.open`）并等它的窗口装好（`session.open()`）：运行必须看得见、能打断。
 * 固定的对话被删掉时**明确报错**，绝不静默改投别处。
 *
 * That choice is deliberate. It would be possible to spawn a private one-shot agent
 * and show a progress bar instead, and it would be worse: the run would be
 * invisible, you could not interrupt it, and a plan generated with the wrong idea
 * of your direction could only be thrown away afterwards. Delivering a turn keeps
 * everything the rest of this file relies on — you watch it read, you watch it
 * think, you correct it mid-flight, and nothing is hidden.
 *
 * The buttons are honest about what they are: a shortcut for typing, not an
 * autonomous background worker. Nothing is generated behind your back, and every
 * judgment that is yours to make — which 底子 you actually have, how you score
 * yourself, what evidence counts — has no button at all.
 *
 * Every `createElement` here is given its children as an **array**. Deeply nested
 * positional argument lists are the one place this file kept losing a paren, and a
 * lost paren does not fail loudly: it quietly moves the rest of the tree into the
 * wrong parent. Arrays have no such failure mode.
 *
 * @module dsh-growth-workbench/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-growth-workbench',
  factory: (require) => {
    const React = require('react');
    const { createElement: h, useCallback, useEffect, useRef, useState } = React;

    /** Right-sidebar tab identity: the key its body registers under. */
    const TAB_ID = 'dsh-growth-workbench';
    /** The tab kind `openTab` names. */
    const TAB_KIND = 'growth-workbench';
    /** Left menu panel id: the sidebar row and the `main` key, one value. */
    const PANEL_ID = 'growth-workbench';
    /** The row title, the guide title, and the page heading. */
    const LABEL = '成长工作台';
    /** 页脚署名的落款指向哪儿 —— 仓库地址只写这一处。 */
    const REPO_URL = 'https://github.com/mingdui/dsh-growth-workbench';

    const API = '/gw/api';
    if (typeof document !== 'undefined' && !document.querySelector('style[data-growth-fonts]')) {
      const style = document.createElement('style');
      style.dataset.growthFonts = 'true';
      style.textContent = "@import url('https://fonts.googleapis.com/css2?family=Calistoga&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');";
      document.head.appendChild(style);
    }

    // Hover / focus / pressed feedback, and the reduced-motion opt-out, cannot be
    // said with inline styles — and the step rows need all three. Scoped to
    // `.gw-step`, so nothing here can leak into the host app's own elements.
    if (typeof document !== 'undefined' && !document.querySelector('style[data-growth-ui]')) {
      const style = document.createElement('style');
      style.dataset.growthUi = 'true';
      style.textContent = '.gw-step{transition:border-color 160ms ease,box-shadow 160ms ease,transform 160ms ease}'
        + '.gw-step:hover{border-color:var(--gw-coral,#e56b55);box-shadow:0 16px 36px rgba(54,42,32,.10)}'
        + '.gw-step:active{transform:translateY(1px)}'
        + '.gw-step:focus-visible{outline:2px solid var(--gw-coral,#e56b55);outline-offset:3px}'
        + '.gw-step .gw-step-edit{opacity:.7;transition:opacity 160ms ease}'
        + '.gw-step:hover .gw-step-edit{opacity:1}'
        + '.gw-tf{transition:background 140ms ease}'
        + '.gw-tf:hover{background:rgba(229,107,85,.05)}'
        + '.gw-tf .gw-tf-no{opacity:.4;transition:opacity 140ms ease}'
        + '.gw-tf:hover .gw-tf-no,.gw-tf:focus-within .gw-tf-no{opacity:1}'
        // One rule for every button and input: they share no class, but they all live
        // inside `.gw-root`. No `!important` — `.gw-root button:hover` already outranks
        // a plain element selector, and the `.gw-tabbar` pair below is longer on
        // purpose, so tabs keep their own feedback instead of lifting off the bar.
        + '.gw-root button:not(:disabled):hover{border-color:var(--gw-coral,#e56b55);transform:translateY(-1px);box-shadow:0 12px 24px -16px rgba(54,42,32,.45)}'
        + '.gw-root button:not(:disabled):active{transform:translateY(1px)}'
        + '.gw-root button:focus-visible{outline:2px solid var(--gw-coral,#e56b55);outline-offset:3px}'
        + '.gw-root .gw-tabbar button:hover{transform:none;box-shadow:none;border-color:transparent;color:var(--gw-ink,#1f2933)}'
        // 文字链式的按钮（页头那两个「改绑 / 重建」）：通用 hover 会给它们加位移与投影，
        // 而它们既没有边框也没有底色 —— 那套反馈落在纯文字上就是一团脏影子。只换颜色。
        + '.gw-root .gw-quiet:not(:disabled):hover{transform:none;box-shadow:none;border-color:transparent;color:var(--gw-coral,#e56b55)}'
        // 「＋ 加一张图」是个 label（它包着 file input），通用那条按钮 hover 管不到它 ——
        // 可点的东西必须有可见反馈，所以它自己一条，键盘聚焦（focus-within）也算数。
        + '.gw-root .gw-shot-add:hover{border-color:var(--gw-coral,#e56b55);color:var(--gw-coral-deep,#a64132)}'
        + '.gw-root .gw-shot-add:focus-within{outline:2px solid var(--gw-coral,#e56b55);outline-offset:3px}'
        // 写证据的弹窗：写作要的是空间与安静 —— 遮罩压暗、卡片纸色、正文**无边框**
        // （有边框的框是"填表"，没边框的纸才是"写东西"）。
        + '.gw-modal{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:26px 16px;background:rgba(31,41,51,.42);animation:gw-fade .18s ease both}'
        + '.gw-modal-card{width:min(760px,100%);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;background:var(--gw-card,#fffefb);border-radius:20px;box-shadow:0 40px 80px -32px rgba(31,41,51,.55);animation:gw-rise .22s cubic-bezier(.2,.9,.3,1.14) both}'
        + '@keyframes gw-fade{from{opacity:0}to{opacity:1}}'
        + '@keyframes gw-rise{from{opacity:0;transform:translateY(16px) scale(.985)}to{opacity:1;transform:none}}'
        + '.gw-modal textarea{border:0;outline:0;background:transparent;resize:none;box-sizing:border-box}'
        + '.gw-modal textarea:focus{box-shadow:none;border:0}'
        // 作答框：空的时候是**虚线**（"这里能写"），有内容时是**实线纸色**（"这是我写的"）。
        // 它是"看起来不像控件"的东西，所以底色必须自己声明（见下面那条注释）。
        // 「改写」只在 hover / 键盘聚焦时浮出来 —— 常显就会变成又一个要读的词。
        + '.gw-answer{transition:border-color 160ms ease,background 160ms ease}'
        + '.gw-answer:hover{border-color:var(--gw-coral,#e56b55)}'
        + '.gw-answer .gw-answer-edit{opacity:0;transition:opacity 160ms ease}'
        + '.gw-answer:hover .gw-answer-edit,.gw-answer:focus-visible .gw-answer-edit{opacity:1}'
        // 它是个 div（里面还有可点的缩略图链接，button 里不能嵌 a），所以要自己给焦点环。
        + '.gw-root .gw-answer:focus-visible{outline:2px solid var(--gw-coral,#e56b55);outline-offset:2px}'
        // 宿主可能给 button 之类的元素一层底色 —— 自绘控件必须自己声明底色（见下面的注释）。
        + '.gw-root .gw-answer{background:transparent}'
        + '@media (prefers-reduced-motion: reduce){.gw-modal,.gw-modal-card{animation:none}}'
        + '.gw-root input:focus,.gw-root select:focus,.gw-root textarea:focus{border-color:var(--gw-coral,#e56b55);box-shadow:0 0 0 4px var(--gw-coral-soft,rgba(229,107,85,.10))}'
        // The section label's coral dash. It cannot be an inline style, and it is what
        // makes a card read as labelled tiers instead of one grey block.
        + '.gw-subhead::before{content:"";width:16px;height:2px;border-radius:2px;background:var(--gw-coral,#e56b55);flex:0 0 auto}'
        + '.gw-seal-sub{font-size:9px;font-weight:500;letter-spacing:.12em;opacity:.72}'
        // The seals are the journal layer: one stamp for a finished task, one grade stamp
        // per graded round. `currentColor` drives the border, so a tone class is all it
        // takes to re-colour one — no second rule per colour.
        + '.gw-seal{transform:rotate(-4deg)}'
        + '.gw-seal.tone-teal{color:var(--gw-teal,#2f7d74)}'
        + '.gw-seal.tone-slate{color:var(--gw-slate,#8f9ba6)}'
        + '.gw-seal.tone-amber{color:var(--gw-amber,#d59b3f)}'
        + '@keyframes gw-stamp-in{0%{transform:scale(1.7) rotate(-16deg);opacity:0}55%{transform:scale(.93) rotate(-2deg);opacity:1}100%{transform:scale(1) rotate(-4deg)}}'
        + '.gw-stamp-in{animation:gw-stamp-in .36s cubic-bezier(.2,.9,.3,1.35) both}'
        // The path band: four nodes joined by a line, with "you are here" marked. The
        // connector is drawn as two half-segments per node so the ends stop at the dots.
        + '.gw-path{display:flex;justify-content:space-between;gap:6px}'
        + '.gw-path > div{flex:1 1 0;text-align:center;position:relative;padding:18px 4px 0}'
        + '.gw-path > div::before{content:"";position:absolute;top:5px;left:0;right:0;height:2px;background:var(--gw-line,#e5dfd5)}'
        + '.gw-path > div:first-child::before{left:50%}'
        + '.gw-path > div:last-child::before{right:50%}'
        + '.gw-path i{position:absolute;top:0;left:50%;transform:translateX(-50%);width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid var(--gw-line,#e5dfd5);box-sizing:border-box}'
        + '.gw-path .done i{background:var(--gw-teal,#2f7d74);border-color:var(--gw-teal,#2f7d74)}'
        + '.gw-path .done::before{background:var(--gw-teal,#2f7d74)}'
        + '.gw-path .now i{background:var(--gw-coral,#e56b55);border-color:var(--gw-coral,#e56b55);box-shadow:0 0 0 4px var(--gw-coral-soft,rgba(229,107,85,.10))}'
        + '.gw-path b{display:block;font-size:12.5px;font-weight:600;color:var(--gw-muted-2,#9aa7b1);line-height:1.45}'
        + '.gw-path .done b{color:var(--gw-teal,#2f7d74)}'
        + '.gw-path .now b{color:var(--gw-coral-deep,#a64132)}'
        + '.gw-path span{display:block;font-family:var(--gw-mono,monospace);font-size:10.5px;color:var(--gw-muted-2,#9aa7b1);margin-top:4px}'
        + '.gw-gchip{flex:0 0 24px;width:24px;height:24px;border-radius:8px;background:#f4f1ea;color:var(--gw-ink-2,#3d4a54);display:grid;place-items:center;font-family:var(--gw-mono,monospace);font-size:12px;font-weight:600}'
        + '.gw-gchip.now{background:var(--gw-coral,#e56b55);color:#fff}'
        // The exam paper. Its masthead rule is what makes it read as a paper rather than
        // as one more card: a heavy rule, then a light one, then the questions.
        + '.gw-masthead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding-bottom:11px;border-bottom:3px solid var(--gw-ink,#1f2933)}'
        + '.gw-masthead .t{font-family:var(--gw-display,Georgia,serif);font-size:28px;letter-spacing:-.012em;line-height:1.1}'
        + '.gw-masthead .d{font-family:var(--gw-mono,monospace);font-size:12px;color:var(--gw-muted,#6f7c87);white-space:nowrap}'
        + '.gw-masthead .swap{appearance:none;background:none;border:0;font:inherit;font-size:12.5px;color:var(--gw-coral-deep,#a64132);cursor:pointer;padding:2px 0;border-bottom:1px solid rgba(166,65,50,.35);transition:border-color 160ms ease}'
        + '.gw-masthead .swap:hover{border-bottom-color:var(--gw-coral-deep,#a64132)}'
        + '.gw-strap{display:flex;gap:16px;flex-wrap:wrap;align-items:baseline;border-top:1px solid var(--gw-line,#e5dfd5);padding-top:11px;font-size:12.5px;color:var(--gw-muted,#6f7c87)}'
        + '.gw-eq{padding:22px 0;border-top:1px solid var(--gw-line-soft,#efeae2)}'
        + '.gw-eq:first-of-type{border-top:0;padding-top:20px}'
        + '.gw-eq .head{display:flex;align-items:baseline;gap:12px}'
        + '.gw-eq .no{font-family:var(--gw-display,Georgia,serif);font-size:22px;color:var(--gw-coral,#e56b55);flex:0 0 auto;min-width:26px}'
        + '.gw-eq .text{font-size:15.5px;line-height:1.68;flex:1 1 auto}'
        + '.gw-eq .cap{font-family:var(--gw-mono,monospace);font-size:11.5px;color:var(--gw-coral-deep,#a64132);background:var(--gw-coral-soft,rgba(229,107,85,.10));border:1px solid rgba(229,107,85,.2);border-radius:999px;padding:3px 9px;flex:0 0 auto;white-space:nowrap}'
        + '.gw-eq .why{font-size:12.5px;color:var(--gw-muted,#6f7c87);margin:8px 0 0 38px}'
        + '.gw-eq textarea{display:block;width:calc(100% - 38px);margin:13px 0 0 38px;box-sizing:border-box;font:inherit;font-size:13.5px;line-height:1.7;color:inherit;background:#fffdf9;border:1px dashed var(--gw-line,#e5dfd5);border-radius:14px;padding:14px 16px;min-height:100px;resize:vertical;transition:border-color 160ms ease,box-shadow 160ms ease}'
        + '.gw-eq textarea::placeholder{color:var(--gw-muted-2,#9aa7b1)}'
        + '.gw-paper .foot{display:flex;align-items:center;gap:16px;flex-wrap:wrap;border-top:3px solid var(--gw-ink,#1f2933);padding-top:16px;margin-top:6px}'
        + '@media (prefers-reduced-motion:reduce){.gw-step,.gw-step .gw-step-edit,.gw-tf,.gw-tf .gw-tf-no,.gw-root button,.gw-root input,.gw-root select,.gw-root textarea{transition:none}.gw-stamp-in{animation:none}.gw-step:active,.gw-root button:not(:disabled):active{transform:none}}';
      document.head.appendChild(style);
    }


    /** The tabs the left page shows, in order. */
    const TABS = [
      { id: 'today', label: '今日' },
      { id: 'plan', label: '计划' },
      { id: 'review', label: '考核' },
      { id: 'profile', label: '画像' },
    ];

    // ---------------------------------------------------------------- transport

    /** Call one API route and return the parsed reply. */
    async function call(path, body) {
      const response = await fetch(`${API}${path}`, body === undefined
        ? { headers: { accept: 'application/json' } }
        : {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(body),
        });
      const text = await response.text();
      let parsed;
      try {
        parsed = text.length > 0 ? JSON.parse(text) : {};
      } catch {
        throw new Error(`growth-workbench: unexpected reply (${String(response.status)})`);
      }
      if (parsed.ok !== true) throw new Error(parsed.error || `growth-workbench: request failed (${String(response.status)})`);
      return parsed;
    }

    // 远端回的失败**不是** Error：它是 `{ code, message }` 那种普通对象，`String()` 会印成
    // 「[object Object]」。所以这里要单独认一下带 `message` 的对象 —— 否则"为什么失败"这句
    // 话在最需要它的时候正好是一串废话。
    const messageOf = (failure) => {
      if (failure instanceof Error) return failure.message;
      if (failure !== null && typeof failure === 'object' && typeof failure.message === 'string') return failure.message;
      return String(failure);
    };

    /** Every mounted view's reloader, so a write in one reaches the other. */
    const reloaders = new Set();
    const activityListeners = new Set();
    let agentActivity = null;
    function refreshOthers(writer) {
      for (const reload of reloaders) if (reload !== writer) reload();
    }
    function setAgentActivity(next) {
      agentActivity = next;
      for (const listen of activityListeners) listen(next);
    }
    function subscribeActivity(listener) {
      activityListeners.add(listener);
      listener(agentActivity);
      return () => activityListeners.delete(listener);
    }
    /**
     * Is one of our agent runs in flight right now?
     *
     * 空状态写「生成中」而其实没在跑，与写「去点上一页的按钮」而其实已经跑起来了，
     * 是同一种错误的两面：文案必须跟着真实状态走。页头那条 AI 状态栏用的就是这个信号。
     */
    function useAgentBusy() {
      const [activity, setActivity] = useState(agentActivity);
      useEffect(() => subscribeActivity(setActivity), []);
      return activity !== null && activity !== undefined
        && (activity.status === 'running' || activity.status === 'queued');
    }

    function startExternalRefresh(load) {
      let stopped = false;
      let timer;
      const tick = async () => {
        if (stopped) return;
        await load(true);
        timer = setTimeout(tick, agentActivity?.status === 'running' ? 1800 : 5000);
      };
      timer = setTimeout(tick, 1800);
      return () => { stopped = true; clearTimeout(timer); };
    }

    // ---------------------------------------------------------------- 让 AI 来做

    /**
     * The client root context, captured at `apply()`.
     *
     * Components need it to reach the session service, and nothing else in this
     * file does — so it is one module-level handle rather than a prop threaded
     * through every form.
     */
    let rootCtx;

    /** One instruction in flight at a time: two clicks must not become two runs. */
    let sendInFlight = false;

    /**
     * 我们占着的那个"主视图"引用 —— 只在新版会话 API 上有（见 `claimMainView`）。
     *
     * 新版把"现在显示哪个对话"从控制器里挪了出来：**谁是当前对话，就看谁用
     * `source: 'mainView'` 持有它**（官方侧栏就是这么判断的：`retainedBy.mainView > 0`）。
     * 工作台的运行必须看得见，所以这个引用得我们自己拿着；换目标时把上一个放开，
     * 免得侧栏里同时出现两个"当前"。
     */
    let mainRef;
    let mainRefId = '';

    /** 用户自己切走之后就把我们的持有放开 —— 一个订阅，只装一次。 */
    let mainWatchStop;

    /**
     * 新版会话 API 里"当前对话"用的那个来源标签。
     *
     * 官方侧栏按 `retainedBy.mainView > 0` 判断"现在显示的是哪个对话"，所以要让运行看得见，
     * 就得用**它这个标签**去持有；换成自己的名字，那一行不会被当成当前对话。
     */
    const MAIN_VIEW_SOURCE = 'mainView';

    /** 固定对话的标题。一处定义 —— 新建与改名都从这里取，不会各写一份。 */
    const AGENT_SESSION_TITLE = '成长工作台';

    /**
     * 「重建一个」之后自动发过去的第一句话。
     *
     * 两件事一起办：① 侧栏对**没有消息的空对话**一律显示「新会话」（`displayTitle`：blank 的行
     * 不看标题）—— 发一句出去，那一行当场变成「成长工作台」，用户不用等到自己第一次提问；
     * ② 老师本来就得先开口，这是用户点名要的（「自动发段话过去『老师好!』」）。
     */
    const AGENT_GREETING = '老师好！';

    /**
     * 确保「成长工作台」这个**工作区**存在，返回它的 id。
     *
     * 为什么非有不可：侧栏的分组读的是**工作区注册表**（"这个目录注册成工作区了吗"），不是会话的
     * `cwd`。只给 `cwd` 建出来的会话，文件确实落在那个目录里（会话日志的 `cwd` 字段可以作证），
     * 侧栏照样把它归进「未分组」—— 用户撞上过。
     *
     * 宿主挂载时也会注册一次（省一次往返，见 `index.mjs`），但**页面不能指望它**：成不成取决于
     * 那个 profile 挂没挂工作区服务。所以这里走 DSH 页面自己那条路 —— `workspaces` 服务，
     * 用户在侧栏「新建工作区」走的就是它；成功之后侧栏立刻就有这个分组，不用重开。
     *
     * 幂等：同一个路径重复创建会返回已有的那个（宿主侧同样）。哪一步拿不到就返回空串，
     * 调用方退回只带 `cwd`（能用，只是分组差一点）。
     *
     * @param path - 工作区目录（宿主发下来的 `agentWorkspace`）。
     * @param knownId - 宿主已经注册好的 id；有就直接用，不再往返一次。
     * @returns 工作区 id，失败时是空串。
     */
    async function ensureAgentWorkspace(path, knownId) {
      if (typeof knownId === 'string' && knownId.length > 0) return knownId;
      if (typeof path !== 'string' || path.length === 0) return '';
      const workspaces = typeof rootCtx?.get === 'function' ? rootCtx.get('workspaces') : undefined;
      if (workspaces === undefined || workspaces === null || typeof workspaces.create !== 'function') return '';
      try {
        const workspace = await workspaces.create({ path });
        const id = typeof workspace?.workspaceId === 'string' ? workspace.workspaceId : '';
        // 新建出来的标题默认是**目录名**（basename = 「workspace」）。换成看得懂的那个名字。
        if (id.length > 0 && workspace?.title !== AGENT_SESSION_TITLE) {
          try {
            await workspaces.rename?.(id, AGENT_SESSION_TITLE);
          } catch { /* 名字是次要的：分组先成立 */ }
        }
        return id;
      } catch {
        return '';
      }
    }

    /**
     * 新建一个专用对话（并给它起名），**不落盘**。
     *
     * `cwd` = 宿主的空工作区目录。注意它**不是**数据目录 —— 会话的 cwd 就是 Agent 的默认工作
     * 目录，指向数据目录等于把那四份 JSON 摆在它手边（随手一次直接编辑就绕过了工具那边的门禁）。
     *
     * 落盘由调用方决定用哪条路：`askAgent` 用 `call`（它不需要页面重渲染，跑完的轮询会带上），
     * 页头那两个动作走 `post`（写完要让这一行自己更新）。
     */
    async function createAgentSession(sessions, cwd, knownWorkspaceId) {
      const workspaceId = await ensureAgentWorkspace(cwd, knownWorkspaceId);
      // **归属优先走工作区 id，其次才是 cwd**：侧栏分组读的是工作区注册表，只给 cwd 的会话
      // 会挂在「未分组」下（用户撞上过）。两者不能同时传 —— 宿主的 `session.create` 会直接拒。
      const hasCwd = typeof cwd === 'string' && cwd.length > 0;
      const where = typeof workspaceId === 'string' && workspaceId.length > 0
        ? { workspaceId }
        : (hasCwd ? { cwd } : {});
      let id;
      try {
        id = await sessions.create(where);
      } catch (failure) {
        // 工作区 id 可能已经失效（用户把那个工作区从侧栏删了）—— 退回 cwd 再试一次。
        // 分组是次要的，**建不出会话**才是真的挡住用户。
        if (where.workspaceId !== undefined && hasCwd) {
          try {
            id = await sessions.create({ cwd });
          } catch (retry) {
            throw new Error(`没法新建专用对话：${messageOf(retry)}`);
          }
        } else {
          throw new Error(`没法新建专用对话：${messageOf(failure)}`);
        }
      }
      // 把它变成**这一页显示着的**那个对话，并等它的窗口装好 —— 拿回来的就是那个把手（binding）。
      // 新版 API 里"改名"也要一个**活着的**会话，而"活着"的定义就是有人持有它：所以这一步
      // 必须在改名之前（旧版里这一步是 `open()`：标题服务会核对它是否在会话表里）。
      const binding = await claimMainView(sessions, id);
      let named = false;
      let reason = '';
      for (let attempt = 0; attempt < 2 && !named; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => { setTimeout(resolve, 400); });
        try {
          const live = binding ?? bindingOf(sessions, id) ?? await waitForBinding(sessions, id, 1500);
          const renamed = await live?.session?.rename?.(AGENT_SESSION_TITLE);
          named = renamed?.ok === true;
          // **失败的原因要带回去**：我原来只留了个 true/false，于是"为什么没改成名"这件事
          // 被我自己丢掉了 —— 用户报了两次，我两次都只能猜。
          if (!named) reason = messageOf(renamed?.error) || 'DSH 没有接受这个标题';
          if (renamed === undefined) reason = '这个对话还没准备好接受改名';
        } catch (failure) {
          reason = messageOf(failure);
        }
      }
      // 还没拿到把手就再等一轮：新会话进列表是异步的，慢一点的机器上第一次常常还没有。
      // （用户在自己的机器上撞上过：界面报「专用对话刚建好却寻址不到 —— 稍后再试一次」。）
      return { id, named, reason, workspaceId, binding: binding ?? await waitForBinding(sessions, id, 6000) };
    }

    /**
     * 会话服务有两代 API，差异只在这个文件里收一次 —— 因为**我们改不了用户装的是哪一代**。
     *
     * 0.1.6 及更早：`open(id)` 把某个对话切成"当前对话"，`binding(id)` 从列表里解析，
     *   `list.getSnapshot().current` 就是当前对话。
     * 0.1.7 起：`open()` 整段删掉，换成**显式引用计数** —— "当前对话"不再是控制器的事实，
     *   而是"谁用 `source: 'mainView'` 持有它"（官方侧栏就是这么判断的）。拿一个对话要
     *   `retain(id, { source })`，它回一个引用：`await reference.ready` 等窗口装好，
     *   `reference.release()` 放开。`binding(id)` 也换了语义：只借"已经被持有的"，
     *   不再从列表解析 —— 于是**没持有过就什么都拿不到**（用户升级后撞上的就是这个：
     *   先报「固定的对话不在了」，再点「重建一个」报 `sessions.open is not a function`）。
     *
     * 探测的是 `retain` 在不在，不是版本号 —— 判据只认手上这个对象有什么。
     */
    function isModernSessions(sessions) {
      return typeof sessions?.retain === 'function';
    }

    /** 这一页此刻显示着的那个对话（问不到就是空串）。 */
    function currentSessionId(sessions) {
      const snapshot = sessions?.list?.getSnapshot?.();
      if (snapshot === undefined || snapshot === null) return '';
      if (isModernSessions(sessions)) {
        const row = Object.values(snapshot.byId ?? {})
          .find((item) => ((item?.retainedBy?.[MAIN_VIEW_SOURCE]) ?? 0) > 0);
        return typeof row?.id === 'string' ? row.id : '';
      }
      return typeof snapshot.current === 'string' ? snapshot.current : '';
    }

    /**
     * 借一个对话的把手。两代语义不同：新版只借"已经被持有的"，所以调用方得先
     * `claimMainView` —— 直接问一个没人持有的对话，答案永远是"没有"。
     */
    function bindingOf(sessions, id) {
      if (typeof id !== 'string' || id.length === 0) return undefined;
      if (id === mainRefId && mainRef !== undefined) {
        try { return mainRef.binding; } catch { return undefined; }
      }
      const binding = sessions?.binding?.(id);
      return binding ?? undefined;
    }

    /** 带超时的等待：`reference.ready` 万一一直不落地，也不能把这一页挂死。 */
    async function withTimeout(promise, timeoutMs) {
      let timer;
      try {
        return await Promise.race([
          promise,
          new Promise((resolve) => { timer = setTimeout(() => { resolve(undefined); }, timeoutMs); }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }

    /**
     * 把这个对话变成**这一页显示着的**那个，并等它的窗口装好；返回它的把手。
     *
     * 新版：整件事就是"用 `mainView` 这个标签持有它" —— 官方侧栏按 `retainedBy.mainView`
     * 判断当前对话，所以持有它 = 让运行看得见。同一时刻我们只持有一个：换目标时把上一个
     * 放开，否则侧栏里会同时出现两个"当前"。
     * 旧版：`open(id)` 一句话就是这件事。
     *
     * 拿不到就返回 `undefined`，由调用方去说那句能照做的话 —— **不让 TypeError 冒到用户
     * 面前**：`sessions.open is not a function` 这种话对用户没有任何意义。
     */
    async function claimMainView(sessions, id, timeoutMs = 8000) {
      if (typeof id !== 'string' || id.length === 0) return undefined;
      if (!isModernSessions(sessions)) {
        if (typeof sessions?.open !== 'function') return undefined;
        if (currentSessionId(sessions) !== id) sessions.open(id);
        return waitForBinding(sessions, id, timeoutMs);
      }
      if (mainRef === undefined || mainRefId !== id) {
        let reference;
        try {
          reference = sessions.retain(id, { source: MAIN_VIEW_SOURCE });
        } catch {
          // 地址现在不可用（这一代还没进目录、控制器已经销毁……）：按"拿不到"处理。
          return undefined;
        }
        const previous = mainRef;
        mainRef = reference;
        mainRefId = id;
        try { previous?.release?.(); } catch { /* 放开上一个失败不挡住这一个 */ }
        watchMainView(sessions);
      }
      // 先把引用取到局部再等：万一它在我们等的时候被放开（用户切走、插件卸载），模块级的
      // `mainRef` 就成了 undefined —— 那时读 `.ready` 又是另一句 TypeError。
      const held = mainRef;
      try {
        return (await withTimeout(held?.ready, timeoutMs)) ?? undefined;
      } catch {
        // ready 被拒（引用已经放开 / 这一代已经结束）：同上，交给调用方说话。
        return undefined;
      }
    }

    /**
     * 用户自己切到别的对话去了 —— 把我们的持有放开，别跟他抢那一行。
     *
     * 判据是"**别的**对话拿到了 mainView"：官方侧栏与我们都用同一个来源标签，所以用户一点
     * 别的对话，那条就出现了。我们不夺回焦点：要看哪条是他自己的事。
     */
    function watchMainView(sessions) {
      if (mainWatchStop !== undefined) return;
      const stop = sessions?.list?.subscribe?.(() => {
        if (mainRef === undefined) return;
        const taken = Object.values(sessions.list.getSnapshot?.()?.byId ?? {})
          .some((row) => row?.id !== mainRefId && ((row?.retainedBy?.[MAIN_VIEW_SOURCE]) ?? 0) > 0);
        if (taken) releaseMainView();
      });
      mainWatchStop = typeof stop === 'function' ? stop : undefined;
    }

    /** 放开我们占着的主视图（幂等；旧版没有可放开的，空转）。 */
    function releaseMainView() {
      const reference = mainRef;
      mainRef = undefined;
      mainRefId = '';
      try { reference?.release?.(); } catch { /* 放开失败不挡住任何事 */ }
    }

    /**
     * 等一个会话在列表里变得可用。
     *
     * `create()` 的注释说它在 resolve 时已经进了列表（同步投影），但这里只花一次轮询的
     * 代价就能把"刚建好还没跟上"和"真的被删了"分开 —— 后者是**不能静默改投**的那种情况，
     * 值得等清楚再下结论。
     */
    async function waitForBinding(sessions, id, timeoutMs = 8000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const binding = bindingOf(sessions, id);
        if (binding !== undefined && binding !== null && binding.session?.getSnapshot?.()?.removed !== true) return binding;
        if (Date.now() > deadline) return undefined;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    /**
     * 这次运行该发进哪个对话。
     *
     * 从 ③ 可迁移能力起，工作台的每一次 Agent 运行都发进**同一个**对话 —— 而不是"你
     * 此刻打开的那个"。上一轮的计划、考核、调整因此都在同一个上下文里，不会被别的对话
     * 淹没，也不会散得到处都是。
     *
     * 固定的是**新建**的专用对话（不是随手借一个现有的）：它只服务这一个方向。它被删掉时
     * **不静默改投** —— 抛出去，页面把话说清楚，由用户决定重建还是改绑。
     */
    async function resolveAgentSession(sessions) {
      const state = await call('/state');
      const pinned = state?.profile?.agentSession ?? null;
      const pinnedId = typeof pinned?.id === 'string' ? pinned.id : '';
      // revision 一起带出去：这是这一轮**开始之前**页面数据的版本。「跑完了到底有没有改动
      // 数据」靠它对比 —— 只看"revision 变过"会提前报喜（见 useWorkbench 里的完成判定）。
      const revision = typeof state?.revision === 'string' ? state.revision : '';

      if (pinnedId.length > 0) {
        // 先把它变成当前显示的那个对话（顺带拿到把手）。拿不到时**要分清是哪一种拿不到**：
        // 新版 API 里"列表里没有它"和"这一页还没寻址到它"是两回事，用户能做的事也不同 ——
        // 前者要重建对话，后者刷一下页面就够。
        const binding = await claimMainView(sessions, pinnedId);
        if (binding === undefined) {
          const label = typeof pinned.title === 'string' && pinned.title.length > 0 ? `「${pinned.title}」` : '';
          const listed = sessions?.list?.getSnapshot?.()?.byId?.[pinnedId] !== undefined;
          if (listed) throw new Error('固定的对话还在，只是这一页还没寻址到它 —— 刷新一下页面（F5）再点一次即可，不用重建对话。');
          throw new Error(`固定的对话${label}不在了 —— 在页头点「重建」或「改绑到当前对话」，不要让它悄悄发去别处`);
        }
        return { id: pinnedId, binding, created: false, revision };
      }

      const created = await createAgentSession(sessions, state?.agentWorkspace, state?.agentWorkspaceId);
      // **先落盘再发**：落盘失败就不发，否则会出现"消息发了、下次又新建一个"的重复对话。
      // 标题按实际改没改成功来落：改名失败时存「新会话」以外的真相没有意义 —— 页面会用
      // 这个名字去说"运行都在「X」里"，存错了那句话就是假的。
      await call('/agent-session', { sessionId: created.id, title: created.named ? AGENT_SESSION_TITLE : '新会话' });
      // 对话此刻已经**落盘固定**了（上面那次 /agent-session），所以这里寻址不到只是这一页的事：
      // 刷新之后页面会重新把它读出来并寻址得到。报错要说到这一层，否则用户只会反复点。
      const binding = created.binding ?? await waitForBinding(sessions, created.id, 4000);
      if (binding === undefined) {
        throw new Error('专用对话已经建好了，只是这一页还没寻址到它 —— 刷新一下页面（F5）再点一次即可，不用重建对话。');
      }
      return { id: created.id, binding, created: true, named: created.named, reason: created.reason, revision };
    }

    /**
     * 固定的那个对话现在还在跑吗？
     *
     * 一轮运行常常要写好几次页面数据（先写画像、再写计划），所以**不能**拿"数据变了一次"
     * 当"跑完了" —— 那会在它还在干活的时候就说「已返回结果」（用户就是这么撞上的：结果还在
     * 执行中，绿色那行已经报喜）。会话自己知道答案：`running` 为假且队列为空，才是真跑完。
     *
     * @returns `true` / `false`，或 `undefined` = 问不到（没有会话服务、或那个对话没了）。
     */
    function sessionStillRunning(sessionId) {
      if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined;
      const sessions = typeof rootCtx?.get === 'function' ? rootCtx.get('sessions') : undefined;
      if (sessions === undefined || sessions === null) return undefined;
      // 新版 API 只借"已经被持有的"会话：运行期间我们自己持有它，所以问得到；用户切走之后
      // 我们放开了持有，这里就问不到（返回 undefined，调用方退回"看数据变没变"那条判据）。
      const snapshot = bindingOf(sessions, sessionId)?.session?.getSnapshot?.();
      if (snapshot === undefined || snapshot === null) return undefined;
      return snapshot.running === true || (snapshot.queue ?? []).length > 0;
    }

    /**
     * 这一轮跑完了没有 —— 判定只有这一处（两个视图的 load 都走它）。
     *
     * 曾经的判定是「页面数据变了一次 = 跑完了」，而一轮里常常要写好几次（先写画像、再写
     * 计划），于是它还在干活的时候，页头已经报「AI 已返回结果，页面已自动更新」——用户就是
     * 这么撞上的，而且那一行还会把按钮重新点亮，点一下就是**第二次运行**。
     * 现在分两步：先问**会话还在不在跑**（那才是"做完没做完"），跑完了再看数据变没变
     * （那才决定说哪句话）。
     */
    function settleAgentActivity(next) {
      const activity = agentActivity;
      if (activity === null || activity === undefined || activity.status !== 'queued') return;
      const running = sessionStillRunning(activity.sessionId);
      const changed = typeof next?.revision === 'string' && next.revision.length > 0 && next.revision !== activity.startedRevision;
      if (running === true) {
        // 见过它在跑。记一笔 ——「它不跑了」才敢下结论：刚发出去那一瞬间 running 还没翻上来，
        // 那时说"跑完了"就是同一种谎。
        if (activity.sawRunning !== true) setAgentActivity({ ...activity, sawRunning: true });
        return;
      }
      if (changed) {
        setAgentActivity({ ...activity, status: 'completed', wrote: true, finishedAt: Date.now(), resultRevision: next.revision });
        return;
      }
      // 数据没变：要么它真的只说了话没写盘，要么 running 还没翻上来。要求"见过它在跑"，
      // 或者已经等了足够久（快得没被轮询看到的运行）。
      if (activity.sawRunning === true || Date.now() - (activity.startedAt ?? 0) > 3000) {
        setAgentActivity({ ...activity, status: 'completed', wrote: false, finishedAt: Date.now(), resultRevision: next?.revision ?? '' });
      }
    }


    /**
     * Say one thing to the agent **in the workbench's own conversation**.
     *
     * 从 ③ 可迁移能力起，工作台的每一次运行都发进同一个固定对话（第一次用时新建并固定），
     * 而不是"你此刻打开的那个" —— 上一轮的计划、考核、调整因此留在同一个上下文里，不会
     * 散在各处。发送前会先把那个对话变成当前对话：**运行必须看得见、能打断**，这一点不让步。
     *
     * This is the whole point of the buttons: the user should not have to work
     * out the wording, and the work should stay visible. So the message is
     * delivered as an ordinary user turn — the agent reads it with the same
     * tools it always has, the run shows up in the conversation like any other,
     * and the user can interrupt or correct it mid-flight. Nothing here creates
     * a hidden agent.
     *
     * `'queue'` rather than `'steer'`: a click must never cut off a turn that is
     * already running. Sending while busy appends, which is what the caller sees
     * reported back as `queued`.
     *
     * @param text - the instruction to deliver verbatim.
     * @returns `{ queued, deduped }` — whether the session was already busy when it
     * landed, and whether this call was stopped by the idempotency gate (in which
     * case nothing was sent at all).
     */
    async function askAgent(text) {
      if (rootCtx === undefined) throw new Error('工作台还没挂载完成，稍后重试');
      // 幂等：同一条指令还在跑（或已排进队列、结果还没落盘）时不再发第二条。
      // 模块确认按钮上的自动触发是直接调这里的，绕过了 AskButton 那道 sendInFlight 闸 ——
      // 连点两下确认就是两次 Agent 运行，而它们要写的是同一份候选。
      if (agentActivity !== null && agentActivity !== undefined
        && (agentActivity.status === 'running' || agentActivity.status === 'queued')
        && agentActivity.text === text) return { queued: true, deduped: true };
      setAgentActivity({ status: 'running', text, startedAt: Date.now() });
      // 用 ctx.get 而不是 inject：inject 里写一个不存在的服务会让整个插件静默不挂载，
      // 而这里只需要"拿不到就说清楚"。
      let target, session, before, handle;
      try {
        const sessions = typeof rootCtx.get === 'function' ? rootCtx.get('sessions') : undefined;
        if (sessions === undefined || sessions === null) throw new Error('当前环境没有会话服务，无法替你发消息 —— 请手动复制指令发到对话里');

        // 发进**固定的那个**对话（第一次用时新建并固定），不是"此刻打开的那个"。
        target = await resolveAgentSession(sessions);
        // 固定的对话不是当前对话时，先把它变成当前对话再发 —— 工作台不做看不见的运行：
        // 这条指令会像你自己发的一样出现在那个对话里，你能看着它跑、能打断。
        // （两代 API 的差异收在 `claimMainView` 里：旧版 `open()`，新版 `retain(mainView)`。）
        if (currentSessionId(sessions) !== target.id) await claimMainView(sessions, target.id);
        session = target.binding.session;
        // 窗口没装好就 prompt，等于把消息发进一个还没有事件流的会话。open() 是幂等的。
        await session.open?.();
        before = session.getSnapshot();
        // beginSubmission 会先在对话里放一条"提交中"的回声 —— 这就是用户期待看到的：
        // 这条指令像是他自己发的。
        handle = session.beginSubmission({ mode: 'queue', text, attachments: [] });
      } catch (failure) {
        // 没送出去就是失败，必须落一个状态：否则页头一直停在"正在送…"，按钮也一直禁用。
        setAgentActivity({ status: 'error', text, finishedAt: Date.now(), error: messageOf(failure) });
        throw failure instanceof Error ? failure : new Error(messageOf(failure));
      }
      let result;
      try {
        result = await session.prompt([{ type: 'text', text }], 'queue', AbortSignal.timeout(20000), handle.requestId);
      } catch (failure) {
        handle.abandon();
        setAgentActivity({ status: 'error', text, finishedAt: Date.now(), error: messageOf(failure) });
        throw new Error(`发送失败：${messageOf(failure)}`);
      }
      if (result?.ok !== true) {
        const error = result?.error?.message ?? '未知原因';
        setAgentActivity({ status: 'error', text, finishedAt: Date.now(), error });
        throw new Error(`发送失败：${error}`);
      }
      // 那个会话的 id 与"开始前"的数据版本一起记下来：页头判"跑完了没有"要用这两样 ——
      // 问它还在不在跑，以及这一轮到底改没改数据。
      setAgentActivity({ status: 'queued', text, sessionId: target.id, startedRevision: target.revision, sawRunning: false, queued: before.running === true || (before.queue ?? []).length > 0, startedAt: Date.now() });
      return { queued: before.running === true || (before.queue ?? []).length > 0 };
    }

    /**
     * A button that says one thing to the agent.
     *
     * Two kinds of button, and the difference matters:
     *
     *  - **one-shot** (`done` given): build a model, propose the 底盘, write a
     *    plan. The effect lands in `/state`, so the button stays disabled until
     *    that field actually changes — a second click while the run is going
     *    would start a second run. If the run fails and writes nothing, the
     *    button re-arms on its own after a minute rather than staying stuck.
     *  - **repeatable** (`done` omitted): a review. It happens again and again,
     *    so it just re-arms after a short cooldown.
     *
     * @param {{ text: string, label: string, done?: boolean, style?: object, hint?: string, onSent?: Function }} props - what to say, how to know it landed, and what to do once it is on its way.
     */
    function AskButton({ text, label, done, style, hint, onSent }) {
      const [phase, setPhase] = useState('idle'); // idle | sending | sent | error
      const [note, setNote] = useState('');
      const [armed, setArmed] = useState(false);

      const oneShot = done !== undefined;
      // 一次性按钮：等状态真的变了才算完；等太久就重新可点，免得一次失败把按钮焊死。
      useEffect(() => {
        if (phase !== 'sent') return undefined;
        if (oneShot && done === true) { setPhase('idle'); setNote('已完成'); return undefined; }
        const timer = setTimeout(() => { setPhase('idle'); setNote(oneShot ? '还没看到结果 —— 可以再点一次，或去对话里看看' : ''); }, 60000);
        return () => clearTimeout(timer);
      }, [phase, oneShot, done, armed]);

      const click = async () => {
        if (sendInFlight) return;
        sendInFlight = true;
        setPhase('sending');
        setNote('');
        try {
          const outcome = await askAgent(text);
          setPhase('sent');
          setArmed((value) => !value);
          // 被幂等闸拦下的那一次什么都没发出去 —— 不能说成「已排进对话」，否则用户
          // 以为排了两次，实际只有一次。
          setNote(outcome.deduped === true
            ? '已经在跑了 —— 没有重复发送。'
            : outcome.queued ? '已排进对话（前面还有一条在跑，跑完就到它）' : '已发进对话 —— 切过去就能看到它开始干活');
        // 发送成功之后才回调：调用方拿它做「送去哪、顺便跳到哪」这类交接。
        if (typeof onSent === 'function') onSent();
        } catch (failure) {
          setPhase('error');
          setNote(messageOf(failure));
        } finally {
          sendInFlight = false;
        }
      };

      const busy = phase === 'sending' || (phase === 'sent' && oneShot && done !== true);
      return h(React.Fragment, null, [
        h('button', {
          key: 'btn',
          type: 'button',
          disabled: busy,
          style: { ...S.button, ...(style ?? {}), ...(busy ? { opacity: '0.6', cursor: 'default' } : {}) },
          onClick: () => { void click(); },
        }, phase === 'sending' ? '发送中…' : phase === 'sent' && busy ? '等它跑完…' : label),
        note.length === 0 ? null : h('span', { key: 'note', style: phase === 'error' ? S.error : S.fine }, note),
        hint === undefined ? null : h('span', { key: 'hint', style: S.fine }, hint),
      ]);
    }

    // ---------------------------------------------------------------- shared state

    /** Read `/state`, expose the write every view shares. */
    function useWorkbench() {
      const [state, setState] = useState(null);
      const [error, setError] = useState('');

       const load = useCallback(async (silent = false) => {
         try {
           const next = await call('/state');
           setState((previous) => {
             settleAgentActivity(next);
             return next;
           });
           setError('');
         } catch (failure) {
           if (!silent) setError(messageOf(failure));
         }
       }, []);

       useEffect(() => {
         reloaders.add(load);
         load();
         const stopPolling = startExternalRefresh(load);
         return () => { reloaders.delete(load); stopPolling(); };
       }, [load]);

      const post = useCallback(async (route, body) => {
        try {
          const reply = await call(route, body);
          await load();
          refreshOthers(load);
          return { ok: true, reply };
        } catch (failure) {
          setError(messageOf(failure));
          return { ok: false, error: messageOf(failure) };
        }
      }, [load]);

      return { state, error, post, reload: load };
    }

    // ---------------------------------------------------------------- styles

    const S = {
      page: { '--gw-paper': '#f8f6f1', '--gw-ink': '#1f2933', '--gw-ink-2': '#3d4a54', '--gw-muted': '#6f7c87', '--gw-muted-2': '#9aa7b1', '--gw-line': '#e5dfd5', '--gw-line-soft': '#efeae2', '--gw-card': '#fffefb', '--gw-track': '#efeae2', '--gw-coral': '#e56b55', '--gw-coral-deep': '#a64132', '--gw-coral-soft': 'rgba(229,107,85,.10)', '--gw-teal': '#2f7d74', '--gw-teal-soft': 'rgba(47,125,116,.12)', '--gw-amber': '#d59b3f', '--gw-slate': '#8f9ba6', '--gw-display': 'Calistoga, Georgia, serif', '--gw-body': 'Inter, system-ui, sans-serif', '--gw-mono': 'JetBrains Mono, ui-monospace, monospace', '--gw-sh1': '0 1px 2px rgba(54,42,32,.05)', '--gw-sh2': '0 16px 40px -22px rgba(54,42,32,.30)', '--gw-sh3': '0 24px 52px -24px rgba(54,42,32,.38)', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', color: 'var(--gw-ink)', background: 'var(--gw-paper)', fontFamily: 'var(--gw-body)' },
      tabbar: { display: 'flex', gap: '30px', padding: '20px 30px 0', borderBottom: '1px solid var(--gw-line, #e5dfd5)', background: 'var(--gw-paper, #f8f6f1)', position: 'sticky', top: 0, zIndex: 2 },
      tab: { padding: '0 2px 13px', fontSize: '14.5px', fontWeight: '500', font: 'inherit', cursor: 'pointer', color: 'var(--gw-muted, #6f7c87)', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', transition: 'color 160ms ease, border-color 160ms ease' },
      tabOn: { color: 'var(--gw-ink, #1f2933)', fontWeight: '600', borderBottom: '2px solid var(--gw-coral, #e56b55)' },
      body: { flex: '1 1 auto', overflowY: 'auto', padding: '32px 30px 64px', background: 'radial-gradient(circle at 84% 4%, rgba(229,107,85,.10), transparent 26%), var(--gw-paper, #f8f6f1)' },
      inner: { maxWidth: '900px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' },
      stack: { display: 'flex', flexDirection: 'column', gap: '20px' },
      card: { borderRadius: '20px', padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--gw-card, #fffefb)', boxShadow: 'var(--gw-sh1), var(--gw-sh2)' },
      h2: { margin: '0', fontFamily: 'var(--gw-display, Calistoga, Georgia, serif)', fontSize: '23px', lineHeight: '1.3', fontWeight: '400', letterSpacing: '-.012em' },
      h3: { margin: '0', fontSize: '17px', fontWeight: '700', letterSpacing: '-.005em' },
      meta: { fontSize: '13px', color: 'var(--gw-muted, #6f7c87)', lineHeight: '1.7' },
      fine: { fontSize: '12px', color: 'var(--gw-muted, #6f7c87)', lineHeight: '1.6' },
      row: { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--gw-line-soft, #efeae2)' },
      input: { flex: '1 1 auto', minWidth: '0', padding: '11px 14px', fontSize: '14px', font: 'inherit', color: 'inherit', background: '#fffdf9', borderRadius: '11px', border: '1px solid var(--gw-line, #e5dfd5)', outline: 'none', transition: 'border-color 160ms ease, box-shadow 160ms ease' },
      button: { padding: '11px 18px', minHeight: '44px', fontSize: '14px', fontWeight: '600', font: 'inherit', cursor: 'pointer', color: 'var(--gw-ink, #1f2933)', background: '#fffdf9', borderRadius: '12px', border: '1px solid var(--gw-line, #d9d0c4)', transition: 'transform 150ms ease, background 150ms ease, border-color 150ms ease, box-shadow 150ms ease' },
      // 选中态：珊瑚实底 + **更深的珊瑚边**。边框若与底色同色，就等于没有边 ——
      // 用户读到的不是「选中了」，而是「点击之后边框消失了」。
      buttonOn: { borderColor: 'var(--gw-coral-deep, #a64132)', background: 'var(--gw-coral, #e56b55)', color: '#fff' },
      buttonLight: { borderColor: 'var(--gw-coral, #e56b55)', color: 'var(--gw-coral-deep, #a64132)' },
      small: { padding: '9px 14px', minHeight: '44px', fontSize: '13px' },
      select: { padding: '10px 12px', fontSize: '13px', font: 'inherit', color: 'inherit', background: '#fffdf9', borderRadius: '11px', border: '1px solid var(--gw-line, #d9d0c4)' },
      chip: { display: 'inline-block', padding: '4px 10px', fontSize: '12px', borderRadius: '999px', color: 'var(--gw-coral-deep, #a64132)', background: 'var(--gw-coral-soft, rgba(229,107,85,.10))', border: '1px solid rgba(229,107,85,.2)' },
      chipPlain: { display: 'inline-block', padding: '4px 10px', fontSize: '12px', borderRadius: '999px', color: 'var(--gw-muted, #6f7c87)', background: '#f4f1ea', border: '1px solid var(--gw-line-soft, #efeae2)' },
      // 文字链式的动作（页头那一行「改绑 / 重建」、提前那条提醒里的「回到日历节奏」）：
      // 无边框无底色，只靠下划线 + 颜色说"这能点"。它的 hover 自己一条（`.gw-quiet`），
      // 不吃通用那套上浮与投影。
      quiet: { font: 'inherit', background: 'none', border: 'none', padding: '0', textDecoration: 'underline', color: 'var(--gw-coral-deep, #a64132)', cursor: 'pointer' },
      error: { fontSize: '13px', color: '#b33a2d', background: '#fff0ed', border: '1px solid #f3c5be', borderRadius: '12px', padding: '12px 15px' },
      warn: { fontSize: '13px', color: '#8a5a1f', background: '#fdf7e8', border: '1px solid #ecd9a8', borderRadius: '12px', padding: '12px 15px' },
      empty: { fontSize: '14px', color: 'var(--gw-muted, #6f7c87)', padding: '14px 0' },
      pre: { margin: '0', padding: '13px 15px', fontSize: '13px', lineHeight: '1.65', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f6f3ec', borderRadius: '12px' },
      inline: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
      wrap: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
      spread: { display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '14px' },
      subhead: { display: 'flex', alignItems: 'center', gap: '9px', fontSize: '11px', fontWeight: '600', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--gw-muted-2, #9aa7b1)' },
      readouts: { display: 'flex', gap: '0', flexWrap: 'wrap', alignItems: 'flex-end' },
      readoutNum: { fontFamily: 'var(--gw-mono, monospace)', fontSize: '26px', fontWeight: '600', letterSpacing: '-.02em', lineHeight: '1.1' },
      readoutCap: { fontSize: '11px', fontWeight: '600', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--gw-muted-2, #9aa7b1)', marginTop: '6px' },
      seal: { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px', border: '2px solid currentColor', borderRadius: '9px', padding: '6px 11px', color: 'var(--gw-coral-deep, #a64132)', fontSize: '11.5px', fontWeight: '700', letterSpacing: '.1em', lineHeight: '1.15', transform: 'rotate(-4deg)', textAlign: 'center', whiteSpace: 'nowrap' },
      bar: { height: '10px', borderRadius: '999px', background: 'var(--gw-track, #efeae2)', overflow: 'hidden' },
      barFill: { display: 'block', height: '100%', borderRadius: '999px', background: 'var(--gw-coral, #e56b55)' },
      pathbox: { background: '#faf8f4', border: '1px solid var(--gw-line-soft, #efeae2)', borderRadius: '16px', padding: '20px 22px 14px' },
    };

    /**
     * One 画像 step, collapsed.
     *
     * Two lines, not one: the head is what you scan (name, 编辑), the
     * second is what this step actually holds. A single line per card left the
     * list both airy and unreadable — the ② summary is long enough that
     * right-aligning and ellipsising it hid the one thing worth reading.
     *
     * The row keeps its own padding instead of `S.card`'s: a 20px-padded card
     * around one short line is mostly empty space, four of them stacked.
     */
    function CollapsedModule({ label, summary, done, onEdit }) {
      return h('button', { type: 'button', className: 'gw-step', style: { ...S.card, padding: '13px 16px', gap: '5px', flexDirection: 'column', alignItems: 'stretch', textAlign: 'left', cursor: 'pointer', width: '100%', color: 'var(--gw-ink, #1f2933)' }, onClick: onEdit }, [
        h('div', { key: 'head', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [

          h('span', { key: 'label', style: { fontWeight: '700', fontSize: '14px', flex: '1 1 auto', color: 'var(--gw-ink, #1f2933)' } }, label),
          h('span', { key: 'edit', className: 'gw-step-edit', style: { color: 'var(--gw-coral-deep, #a64132)', fontSize: '13px', flex: '0 0 auto' } }, '编辑'),
        ]),
        h('div', { key: 'sub', style: { display: 'flex', alignItems: 'flex-start', gap: '7px' } }, [
          h('span', { key: 'dot', style: { width: '6px', height: '6px', borderRadius: '50%', flex: '0 0 auto', marginTop: '6px', background: done ? 'var(--gw-coral, #e56b55)' : 'var(--gw-line, #e5dfd5)' } }),
          h('span', { key: 'text', style: { ...S.fine, wordBreak: 'break-word' } }, summary || '还没填'),
        ]),
      ]);
    }

    /**
     * 展开态卡片自己的标题行：还是那一步的标题，右边换成「收起」，整行可点。
     *
     * 复用 `.gw-step` 是为了白拿它写好的 hover / focus / pressed 反馈与 reduced-motion
     * 豁免 —— 「收起」像折叠行的「编辑」一样在悬停时亮起来。但它住在表单那张卡片
     * **里面**，所以要把 `.gw-step:hover` 的边框和投影按掉：否则鼠标一扫，卡片里会
     * 再画出一张卡片。行内样式本来就压得住样式表。
     *
     * 点正文不能收：正在填的表单被一次误点折回去，比多点一次「收起」糟得多。
     */
    function OpenModuleHead({ label, onCollapse }) {
      return h('button', {
        type: 'button',
        className: 'gw-step',
        style: {
          display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
          padding: '0', border: '0', borderColor: 'transparent', boxShadow: 'none',
          background: 'transparent', font: 'inherit', textAlign: 'left', cursor: 'pointer',
          color: 'var(--gw-ink, #1f2933)',
        },
        onClick: onCollapse,
      }, [
        h('span', { key: 'label', style: { ...S.h3, flex: '1 1 auto' } }, label),
        h('span', { key: 'fold', className: 'gw-step-edit', style: { color: 'var(--gw-coral-deep, #a64132)', fontSize: '13px', flex: '0 0 auto' } }, '收起'),
      ]);
    }

    function ProfileModule({ label, summary, done, open, onOpen, onConfirm, confirmLabel, children }) {
      if (!open) return h(CollapsedModule, { label, summary, done, onEdit: onOpen });
      // 展开态是**一张**卡：标题、表单、确认按钮都在里面。原先表单自带一张卡，确认按钮
      // 落在它外面右对齐飘着，看着像个孤儿 —— 而它属于这一步，就该长在卡片里。
      return h('div', { style: { ...S.card, gap: '0' } }, [
        children,
        h('div', { key: 'confirm', style: { display: 'flex', justifyContent: 'flex-end', paddingTop: '18px' } }, h('button', { type: 'button', style: { ...S.button, ...S.buttonOn }, onClick: onConfirm }, confirmLabel ?? `确认${label}，继续 →`)),
      ]);
    }

    /**
     * 「这份证据算什么」的三种答案各指什么。
     *
     * **只加解释，不加词汇** —— 档位名来自 `EVIDENCE_TIERS`（页面从 `state.catalog.tiers`
     * 拿），这里只是把这三个词讲清楚。原先它们只是三枚没有解释的按钮：用户没有任何地方能
     * 知道「自述」和「过程」差在哪，于是要么乱选、要么干脆不填。
     */
    const TIER_GLOSS = {
      自述: '只有我的说法 —— 算辅证，不计成果',
      过程: '留下了过程中的东西：笔记、草稿、截图、日志',
      成果: '做出了能给别人看的东西：文件、链接、成品',
    };

    /**
     * 证据文件收哪几种 —— 与宿主那张白名单（`store.EVIDENCE_TYPES`）一致。
     *
     * 页面这一份只为了"选之前就拦住"（省一次往返、也把话说清）；真正说了算的是宿主 ——
     * 页面能被绕过，宿主不能。
     */
    const EVIDENCE_ACCEPT = [
      'image/png', 'image/jpeg', 'image/webp', 'image/gif',
      'text/csv', 'application/json', 'text/plain', 'text/markdown', 'application/zip', 'application/pdf',
    ];

    /** 证据文件的上限，与宿主那条路由一致。 */
    const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

    /**
     * 一份证据文件的地址。文件名是宿主生成的，这里只做一次编码。
     *
     * 读回来的处理**分两类**（宿主那边定的）：图片按 `image/*` 回、页面直接显示缩略图；
     * 其余一律 `octet-stream + attachment` —— 点它就是下载，不会被当成页面渲染。
     */
    const evidenceUrl = (file) => `${API}/evidence?file=${encodeURIComponent(file)}`;

    /** 这一份证据是图还是文件（页面据此决定"缩略图"还是"文件名 + 下载"）。 */
    const isImage = (item) => String(item?.mime ?? '').startsWith('image/');

    /** 文件大小，给人看的那种。 */
    const sizeLabel = (bytes) => `${String(Math.max(1, Math.round(Number(bytes ?? 0) / 1024)))} KB`;

    /** 从 URL 里取出域名 —— 用户靠它判断"这是什么站的链接"，比一长串地址有用。 */
    const hostOf = (url) => {
      try {
        return new URL(url).host.replace(/^www\./, '');
      } catch {
        return url;
      }
    };

    /**
     * 写证据的弹窗 —— 一块安静的写作空间。
     *
     * 为什么是弹窗而不是行内输入框：证据是要**写**的东西，一行框装不下它（用户第一次的反馈
     * 就是「这种框也没有输入的意愿」）。这里给它一整张纸：动作当标题、完成标准与可接受证据
     * 摆在旁边，正文**无边框**（有边框的框是"填表"，没边框的纸才是"写东西"）、行高放宽，
     * 档位和图都在手边。
     *
     * Esc 关、Cmd/Ctrl+Enter 保存、点遮罩关。**关掉不等于丢掉**：有关键改动时关闭照样先存，
     * 只是不留在那儿等结果 —— 与原先"失焦即存"的承诺一致。
     */
    function EvidenceEditor({ task, entry, post, reload, tiers, onClose }) {
      const [text, setText] = useState(entry?.evidence ?? '');
      const [tier, setTier] = useState(entry?.tier ?? '');
      const [note, setNote] = useState('');
      const [busyShot, setBusyShot] = useState(false);
      const [saving, setSaving] = useState(false);
      const body = useRef(null);

      const dirty = text !== (entry?.evidence ?? '') || tier !== (entry?.tier ?? '');
      // 空证据选不了档位：服务端有这条规则（证据为空 → 档位退回未交），页面不能让你点个寂寞。
      const canPickTier = text.trim().length > 0;
      const tierGloss = !canPickTier
        ? '先写下留下了什么，再选它算什么 —— 空着就是「未交」'
        : (TIER_GLOSS[tier] ?? '选一个：它决定这条证据算多重');

      // `save` 必须在下面那两个 effect 之前定义：effect 的依赖数组在**渲染时**就会读它。
      const save = useCallback(async () => {
        setSaving(true);
        setNote('');
        // 档位与证据**一起**交：只交档位的话服务端读到的还是空证据，会按规则把它退回去。
        const reply = await post('/checkin', { taskId: task.id, evidence: text, tier: tier === '' ? null : tier });
        setSaving(false);
        if (reply.ok !== true) {
          setNote(reply.error ?? '没存上');
          return;
        }
        onClose();
      }, [post, task.id, text, tier, onClose]);

      const close = useCallback(() => {
        if (dirty) void post('/checkin', { taskId: task.id, evidence: text, tier: tier === '' ? null : tier });
        onClose();
      }, [dirty, text, tier, post, task.id, onClose]);

      // ⌘/Ctrl + Enter 保存（Esc 由 `Modal` 统一管：它调 onClose，而这里的 onClose 就是
      // `close` —— 有关键改动时先落盘）。
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void save(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [save]);

      // 打开时把焦点放进正文。背景滚动由 `Modal` 锁。
      useEffect(() => {
        body.current?.focus();
      }, []);

      /** 传证据文件：**图片和别的文件都走这一条**（裸字节直传，文件名由宿主生成）。 */
      const upload = async (files) => {
        if (files.length === 0) return;
        setBusyShot(true);
        setNote('');
        try {
          for (const file of files) {
            if (!EVIDENCE_ACCEPT.includes(file.type)) throw new Error(`「${file.name}」这种类型不收 —— 图片、csv / json / txt / md / zip / pdf 可以`);
            if (file.size > MAX_EVIDENCE_BYTES) throw new Error(`「${file.name}」超过 8 MB —— 先压一下，或者只交其中一部分`);
            // 原文件名随 query 带上**只为了在页面上显示**：落盘名由宿主生成，响应头也用宿主那个
            // （上传方给的名字进文件名或响应头都是注入面）。
            const response = await fetch(`${API}/evidence?task=${encodeURIComponent(task.id)}&name=${encodeURIComponent(file.name)}`, {
              method: 'POST',
              headers: { 'content-type': file.type },
              body: file,
            });
            const raw = await response.text();
            let parsed;
            try { parsed = raw.length > 0 ? JSON.parse(raw) : {}; } catch { parsed = {}; }
            if (parsed.ok !== true) throw new Error(parsed.error ?? `上传失败（${String(response.status)}）`);
          }
          if (typeof reload === 'function') await reload();
        } catch (failure) {
          setNote(messageOf(failure));
        } finally {
          setBusyShot(false);
        }
      };

      /** 删掉一份证据。**这是唯一会删证据文件的入口** —— 见 store 里那条注释。 */
      const dropShot = async (file) => {
        setNote('');
        const reply = await post('/evidence-remove', { taskId: task.id, file });
        if (reply.ok !== true) setNote(reply.error ?? '删不掉');
      };

      const run = [
        h('div', { key: 'head', style: { padding: '24px 28px 14px' } }, [
          h('div', { key: 'kicker', style: S.subhead }, Number.isInteger(task.day) ? `第 ${String(task.day)} 天 · 写证据` : '写证据'),
          h('div', { key: 'action', style: { fontFamily: 'var(--gw-display, Calistoga, Georgia, serif)', fontSize: '21px', lineHeight: '1.55', marginTop: '10px' } }, task.action),
          h('div', { key: 'done', style: { ...S.fine, marginTop: '8px' } }, `完成标准：${task.doneCriteria}`),
          h('div', { key: 'ev', style: { ...S.fine, marginTop: '2px' } }, `可接受证据：${task.acceptableEvidence}`),
        ]),
        h('div', { key: 'rule1', style: { height: '1px', background: 'var(--gw-line-soft, #efeae2)', margin: '0 28px' } }),
        h('textarea', {
          key: 'body',
          ref: body,
          'aria-label': '证据',
          value: text,
          onChange: (event) => setText(event.target.value),
          placeholder: '今天这件事留下了什么？\n\n一段笔记、一个链接、一张图、或者做出来的那个东西 —— 写给自己看就行。',
          style: { flex: '1 1 auto', minHeight: '230px', padding: '18px 28px', fontSize: '15.5px', lineHeight: '1.95', fontFamily: 'inherit', color: 'var(--gw-ink, #1f2933)' },
        }),
        h('div', { key: 'rule2', style: { height: '1px', background: 'var(--gw-line-soft, #efeae2)', margin: '0 28px' } }),
        h('div', { key: 'foot', style: { padding: '14px 28px 20px', display: 'flex', flexDirection: 'column', gap: '14px' } }, [
          h('div', { key: 'tierRow', style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } }, [
            h('span', { key: 'ask', style: S.fine }, '这份证据算什么？'),
            h('div', {
              key: 'tier',
              role: 'group',
              'aria-label': '证据档位',
              style: { display: 'inline-flex', border: '1px solid var(--gw-line, #e5dfd5)', borderRadius: '12px', overflow: 'hidden', background: '#fffdf9', flex: '0 0 auto', opacity: canPickTier ? '1' : '.55' },
            }, tiers.map((value, index) => h('button', {
              key: value,
              type: 'button',
              disabled: !canPickTier,
              'aria-pressed': tier === value,
              style: { appearance: 'none', font: 'inherit', fontSize: '12.5px', fontWeight: '500', padding: '8px 13px', border: '0', borderLeft: index === 0 ? '0' : '1px solid var(--gw-line, #e5dfd5)', background: tier === value ? 'var(--gw-teal-soft, rgba(47,125,116,.12))' : 'transparent', color: tier === value ? 'var(--gw-teal, #2f7d74)' : 'var(--gw-muted, #6f7c87)', cursor: canPickTier ? 'pointer' : 'default', transition: 'background 140ms ease, color 140ms ease' },
              onClick: () => setTier(value),
            }, value))),
            h('span', { key: 'gloss', style: { ...S.fine, flex: '1 1 220px' } }, tierGloss),
          ]),
          h('div', { key: 'shots', style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } }, [
            // 图 → 缩略图（看一眼就知道是什么）；其他文件 → 名字 + 大小 + 下载。
            // 两者读回来的方式本来就不同（一个 inline、一个 attachment），这里也照实分开。
            ...(entry?.images ?? []).map((item) => (isImage(item)
              ? h('span', { key: item.file, className: 'gw-shot', style: { position: 'relative', display: 'inline-flex' } }, [
                h('a', {
                  key: 'open',
                  href: evidenceUrl(item.file),
                  target: '_blank',
                  rel: 'noreferrer',
                  title: `${sizeLabel(item.bytes)}　点开看原图`,
                  style: { display: 'block', lineHeight: '0' },
                }, [h('img', {
                  key: 'img',
                  src: evidenceUrl(item.file),
                  alt: '证据图片',
                  style: { width: '58px', height: '58px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--gw-line, #e5dfd5)', background: '#fff' },
                })]),
                h('button', {
                  key: 'drop',
                  type: 'button',
                  'aria-label': '删掉这张图',
                  title: '删掉这张图',
                  style: { position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', minHeight: '0', padding: '0', display: 'grid', placeItems: 'center', borderRadius: '999px', border: '1px solid var(--gw-line, #e5dfd5)', background: '#fffdf9', color: 'var(--gw-muted, #6f7c87)', fontSize: '12px', lineHeight: '1', cursor: 'pointer' },
                  onClick: () => { void dropShot(item.file); },
                }, '×'),
              ])
              : h('span', { key: item.file, className: 'gw-shot', style: { display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '6px 8px 6px 11px', borderRadius: '10px', border: '1px solid var(--gw-line, #e5dfd5)', background: '#fffdf9' } }, [
                h('a', {
                  key: 'open',
                  href: evidenceUrl(item.file),
                  title: '点开就是下载',
                  style: { fontSize: '13px', color: 'var(--gw-coral-deep, #a64132)', textDecoration: 'underline', wordBreak: 'break-all' },
                }, item.name ?? item.file),
                h('span', { key: 'size', style: { ...S.fine, color: 'var(--gw-muted-2, #9aa7b1)', whiteSpace: 'nowrap' } }, sizeLabel(item.bytes)),
                h('button', {
                  key: 'drop',
                  type: 'button',
                  'aria-label': '删掉这份证据',
                  title: '删掉这份证据',
                  style: { width: '20px', height: '20px', minHeight: '0', padding: '0', display: 'grid', placeItems: 'center', borderRadius: '999px', border: '1px solid var(--gw-line, #e5dfd5)', background: '#fffdf9', color: 'var(--gw-muted, #6f7c87)', fontSize: '12px', lineHeight: '1', cursor: 'pointer' },
                  onClick: () => { void dropShot(item.file); },
                }, '×'),
              ]))),
            // 两个入口：**图片**按 image/* 回、页面直接看；**其他文件**（csv / json / txt / md /
            // zip / pdf）按 attachment 回 —— 所以从按钮上就分开说，不让「加一张图」去接一个 CSV。
            h('label', { key: 'add-image', className: 'gw-shot-add', style: { ...S.chipPlain, display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '34px', padding: '6px 13px', cursor: busyShot ? 'default' : 'pointer' } }, [
              busyShot ? '正在传…' : '＋ 加图',
              // 1px + opacity 而不是 display:none —— 后者连键盘都聚焦不到。
              h('input', {
                key: 'file',
                type: 'file',
                accept: 'image/png,image/jpeg,image/webp,image/gif',
                multiple: true,
                style: { position: 'absolute', width: '1px', height: '1px', opacity: '0' },
                onChange: (event) => { void upload([...(event.target.files ?? [])]); event.target.value = ''; },
              }),
            ]),
            h('label', { key: 'add-file', className: 'gw-shot-add', style: { ...S.chipPlain, display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '34px', padding: '6px 13px', cursor: busyShot ? 'default' : 'pointer' } }, [
              busyShot ? '正在传…' : '＋ 加文件',
              h('input', {
                key: 'file',
                type: 'file',
                accept: '.csv,.json,.txt,.md,.log,.zip,.pdf',
                multiple: true,
                style: { position: 'absolute', width: '1px', height: '1px', opacity: '0' },
                onChange: (event) => { void upload([...(event.target.files ?? [])]); event.target.value = ''; },
              }),
            ]),
            h('span', { key: 'hint', style: { ...S.fine, color: 'var(--gw-muted-2, #9aa7b1)' } }, '图直接看；其他文件给名字和大小，点开就是下载'),
            note.length === 0 ? null : h('span', { key: 'note', style: { ...S.fine, color: '#b33a2d' } }, note),
          ]),
          h('div', { key: 'actions', style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--gw-line-soft, #efeae2)', paddingTop: '14px' } }, [
            h('span', { key: 'hint', style: { ...S.fine, marginRight: 'auto' } }, 'Esc 关 · ⌘/Ctrl + Enter 保存'),
            h('button', { key: 'close', type: 'button', style: S.button, onClick: close }, '关闭'),
            h('button', {
              key: 'save',
              type: 'button',
              disabled: saving || !dirty,
              style: { ...S.button, ...(dirty ? S.buttonOn : { color: 'var(--gw-muted, #6f7c87)', background: 'transparent', borderColor: 'transparent', cursor: 'default' }) },
              onClick: () => { void save(); },
            }, saving ? '保存中…' : (dirty ? '保存' : '已保存')),
          ]),
        ]),
      ];

      return h(Modal, { label: '写证据', onClose: close }, run);
    }

    /**
     * 弹窗的**外壳**：遮罩、卡片、Esc、点遮罩关、锁背景滚动。
     *
     * 抽出来是因为**出现了第二个弹窗**（学习资料）。上一次"两个座位各写一份"的教训还热着：
     * 外壳一旦复制就一定会分叉（一个支持 Esc、另一个忘了），而这类差异只有用户会撞上。
     * 内容与"关的时候要不要先存"由调用方决定 —— `onClose` 是它们的入口。
     */
    function Modal({ label, onClose, children, className }) {
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') { event.preventDefault(); onClose(); }
        };
        window.addEventListener('keydown', onKey);
        // 打开时锁住背景滚动 —— 弹窗不该让底下的页面跟着滚。
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
          window.removeEventListener('keydown', onKey);
          document.body.style.overflow = previous;
        };
      }, [onClose]);
      return h('div', {
        className: 'gw-modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': label,
        // **点遮罩不关**（用户：「点击弹窗外面的位置不要弹窗消失，我们弹窗只认关闭按钮」）：
        // 这两个弹窗里装的是用户敲进去的东西 —— 手一滑点到旁边就没了，比少一个快捷操作糟得多。
        // Esc 还留着（它是明确的键盘动作，而且两个弹窗都"关掉也先存"，丢不了）。
      }, [h('div', { key: 'card', className: `gw-modal-card${className === undefined ? '' : ` ${className}`}` }, children)]);
    }

    /**
     * 学习资料：一张**用来读的**纸。
     *
     * 任务卡上那一行只放"怎么上手"当引子；方法、AI 汇总、来源都在这张纸上 —— 汇总可能上百字，
     * 挤在任务行里既读不下去、也把那一行压垮。排版按"读"来：正文放大到 15.5px、行高 1.95、
     * 保留原文换行（汇总里常是 ①②③ 的分条），来源单列一行一行，标出域名和"什么时候找的"。
     */
    function LearningSheet({ task, onClose }) {
      const learn = task.learn;
      const links = learn.links ?? [];
      return h(Modal, { label: '学习资料', onClose, className: 'gw-learn-sheet' }, [
        h('div', { key: 'head', style: { padding: '24px 30px 14px' } }, [
          h('div', { key: 'kicker', style: S.subhead }, Number.isInteger(task.day) ? `第 ${String(task.day)} 天 · 学习资料` : '学习资料'),
          h('div', { key: 'action', style: { fontFamily: 'var(--gw-display, Calistoga, Georgia, serif)', fontSize: '21px', lineHeight: '1.55', marginTop: '10px' } }, task.action),
          h('div', { key: 'task', style: { ...S.fine, marginTop: '8px' } }, `${task.id} · 引用 ${task.ref} · 能力项 ${task.capability}`),
        ]),
        h('div', { key: 'rule', style: { height: '1px', background: 'var(--gw-line-soft, #efeae2)', margin: '0 30px' } }),
        h('div', { key: 'body', style: { flex: '1 1 auto', overflowY: 'auto', padding: '20px 30px 8px', display: 'flex', flexDirection: 'column', gap: '20px' } }, [
          learn.method.length > 0 ? h('div', { key: 'method' }, [
            h('div', { key: 'h', style: S.subhead }, '怎么上手'),
            h('div', { key: 'p', style: { fontSize: '15px', lineHeight: '1.9', marginTop: '8px', color: 'var(--gw-ink, #1f2933)' } }, learn.method),
          ]) : null,
          learn.digest.length > 0 ? h('div', { key: 'digest' }, [
            h('div', { key: 'h', style: S.subhead }, 'AI 汇总'),
            h('div', {
              key: 'p',
              style: { fontSize: '15.5px', lineHeight: '1.95', marginTop: '8px', whiteSpace: 'pre-wrap', color: 'var(--gw-ink-2, #3d4a54)' },
            }, learn.digest),
          ]) : null,
          h('div', { key: 'links' }, [
            h('div', { key: 'h', style: S.subhead }, links.length > 0 ? '来源' : '来源（没有找到可引用的）'),
            ...(links.length > 0
              ? links.map((link, index) => h('a', {
                key: link.url,
                href: link.url,
                target: '_blank',
                rel: 'noreferrer',
                style: { display: 'block', marginTop: '8px', color: 'var(--gw-ink, #1f2933)', textDecoration: 'none' },
              }, [
                h('div', { key: 't', style: { fontSize: '14.5px', color: 'var(--gw-coral-deep, #a64132)', textDecoration: 'underline' } }, `${String(index + 1)}. ${link.title}`),
                h('div', { key: 'u', style: { ...S.fine, marginTop: '2px', wordBreak: 'break-all' } }, `${hostOf(link.url)}${link.source.length > 0 ? `　·　${link.source}` : ''}`),
              ]))
              : [h('div', { key: 'none', style: { ...S.fine, marginTop: '8px' } },
                '这次的汇总来自模型自己的通识，没有可引用的来源 —— 按自己的判断用。')]),
          ]),
        ]),
        h('div', { key: 'foot', style: { padding: '14px 30px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderTop: '1px solid var(--gw-line-soft, #efeae2)' } }, [
          h('span', { key: 'when', style: { ...S.fine, marginRight: 'auto' } }, `AI 找的 · ${learn.foundAt}`),
          h(AskButton, { key: 'again', text: `给 ${task.id} 重新找一遍学习资料`, label: '重新找一遍', hint: '链接会过期 —— 重新找就是重新检索。' }),
          h('button', { key: 'close', type: 'button', style: S.button, onClick: onClose }, '关闭'),
        ]),
      ]);
    }

    /**
     * 勾选框：可填色的方框 + 白勾。
     *
     * **左页与右栏共用这一个** —— 它们原先各写了一遍一模一样的样式代码，而"完成的那一下
     * 反馈"是最不该漂的地方（旁边那枚印章同理，也来自同一个 `Seal`）。
     */
    function TaskCheck({ task, done, onToggle }) {
      return h('button', {
        type: 'button',
        role: 'checkbox',
        'aria-checked': done,
        'aria-label': task.action,
        style: { marginTop: '1px', flex: '0 0 auto', width: '24px', height: '24px', padding: '0', display: 'grid', placeItems: 'center', borderRadius: '8px', cursor: 'pointer', transition: 'background 160ms ease, border-color 160ms ease, transform 120ms ease', border: `2px solid ${done ? 'var(--gw-teal, #2f7d74)' : 'var(--gw-line, #e5dfd5)'}`, background: done ? 'var(--gw-teal, #2f7d74)' : '#fff' },
        onClick: onToggle,
      }, [
        done ? h('span', { key: 'tick', style: { width: '10px', height: '6px', borderLeft: '2px solid #fff', borderBottom: '2px solid #fff', transform: 'rotate(-45deg) translate(1px, -1px)' } }) : null,
      ]);
    }

    /**
     * 证据的阅读态 + 写作弹窗。
     *
     * **左页与右栏共用这一个**，所以两边的证据是同一套：同一排缩略图、同一个写作弹窗、
     * 同一组档位解释。右栏原先自己写了一份（一行 input + 原生 select + 自己一套档位措辞），
     * 于是它落后了左页整整一版 —— 只有走右栏的人拿不到弹窗和图片。
     *
     * 外层的缩进由调用方给（左页要让开勾选框那一列），这里只管内容。
     */
    function TaskEvidenceLine({ task, entry, post, reload, tiers }) {
      const [editing, setEditing] = useState(false);
      const evidenceText = String(entry?.evidence ?? '');
      const images = entry?.images ?? [];
      const hasContent = evidenceText.length > 0 || images.length > 0;
      const open = () => setEditing(true);
      return h(React.Fragment, null, [
        // **整块就是入口**：空的时候点提示语、有内容时点正文，都进写作弹窗。
        // 所以它不再挂一条「改写 / 加图」的文字链 —— 那正是"框和动作分家"的样子。
        h('div', {
          key: 'line',
          className: 'gw-answer',
          role: 'button',
          tabIndex: 0,
          'aria-label': evidenceText.length > 0 ? '改写这条证据' : '写一条证据',
          title: '点一下写点什么',
          style: {
            display: 'flex', flexDirection: 'column', gap: '9px',
            padding: '12px 14px', borderRadius: '12px', cursor: 'text',
            // 空 = 虚线（这里能写）；有内容 = 实线纸色（这是我写的）。
            border: `1px ${hasContent ? 'solid' : 'dashed'} ${hasContent ? 'var(--gw-line-soft, #efeae2)' : 'var(--gw-line, #e5dfd5)'}`,
            background: hasContent ? '#fffdf9' : 'transparent',
          },
          onClick: open,
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
          },
        }, [
          h('div', {
            key: 'text',
            style: {
              fontSize: '14px', lineHeight: '1.8', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              color: evidenceText.length > 0 ? 'var(--gw-ink, #1f2933)' : 'var(--gw-muted-2, #9aa7b1)',
            },
          }, evidenceText.length > 0
            ? evidenceText
            : '写下今天留下的东西 —— 一段笔记、一个链接、一张图、或者做出来的那个东西'),
          h('div', { key: 'meta', style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } }, [
            // 档位**只在定了之后**显示：没定就不提（「未交」是门禁的词，不是给人看的）。
            entry?.tier ? h('span', { key: 'tier', style: S.chipPlain }, entry.tier) : null,
            ...images.map((item) => (isImage(item)
              ? h('a', {
                key: item.file,
                className: 'gw-shot',
                href: evidenceUrl(item.file),
                target: '_blank',
                rel: 'noreferrer',
                title: `${sizeLabel(item.bytes)}　点开看原图`,
                style: { display: 'block', lineHeight: '0' },
                // 缩略图在"整块可点"的框里：点它只该开图，不该把弹窗一起打开。
                onClick: (event) => event.stopPropagation(),
              }, [h('img', {
                key: 'img',
                src: evidenceUrl(item.file),
                alt: '证据图片',
                style: { width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--gw-line, #e5dfd5)', background: '#fff' },
              })])
              : h('a', {
                key: item.file,
                className: 'gw-shot',
                href: evidenceUrl(item.file),
                title: '点开就是下载',
                style: { ...S.fine, color: 'var(--gw-coral-deep, #a64132)', textDecoration: 'underline', wordBreak: 'break-all' },
                onClick: (event) => event.stopPropagation(),
              }, `${item.name ?? item.file}　${sizeLabel(item.bytes)}`))),
            // 常态不占位置，hover / 键盘聚焦时浮出来。
            h('span', { key: 'edit', className: 'gw-answer-edit', style: { ...S.fine, marginLeft: 'auto', color: 'var(--gw-coral-deep, #a64132)' } }, '改写'),
          ]),
        ]),
        editing ? h(EvidenceEditor, { key: 'editor', task, entry, post, reload, tiers, onClose: () => setEditing(false) }) : null,
      ]);
    }

    /**
     * 学习资料那一行：**引子 + 入口**。
     *
     * 任务行里只放"怎么上手"一句（它是引子，看一眼就知道要不要打开），方法与汇总在
     * `LearningSheet` 那张纸上读 —— 汇总可能上百字，挤在任务行里既读不下去也把这一行压垮。
     * 还没有资料时给一个入口（`AskButton`），它会把「找资料 → 汇总 → 写回」跑一遍。
     */
    function TaskLearnLine({ task }) {
      const [open, setOpen] = useState(false);
      const learn = task.learn;
      if (learn === undefined) {
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '5px' } }, [
          // 「（只有要求，没有方法）」是画外音：用户点开一个格子，不需要被告知这道题**缺什么**，
          // 只需要知道现在没有、以及那个「让 AI 找资料」的按钮能做什么。
          h('span', { key: 'none' }, '还没有学习资料'),
          h('span', { key: 'act', style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } }, [
            h(AskButton, { key: 'go', text: `给 ${task.id} 找学习资料`, label: '让 AI 汇总资料' }),
          ]),
        ]);
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '5px' } }, [
        learn.method.length > 0
          ? h('div', { key: 'method', style: { color: 'var(--gw-ink-2, #3d4a54)', lineHeight: '1.7' } }, `怎么上手：${learn.method}`)
          : null,
        // 任务行只放**入口与"里面有什么"**：来源日期、「重新找」、以及那句提示都收进弹窗
        // （用户：「弹窗里面保留即可，外面不用显示」）—— 行里越少，越看得清这道题要做什么。
        h('div', { key: 'row', style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } }, [
          h('button', { key: 'open', type: 'button', className: 'gw-quiet', style: { ...S.fine, ...S.quiet }, onClick: () => setOpen(true) }, '打开学习资料 →'),
          h('span', { key: 'meta', style: { color: 'var(--gw-muted-2, #9aa7b1)' } },
            `${learn.digest.length > 0 ? `汇总 ${String(learn.digest.length)} 字` : '没有汇总'}${learn.links.length > 0 ? ` · ${String(learn.links.length)} 条来源` : ' · 无可引用来源'}`),
        ]),
        open ? h(LearningSheet, { task, onClose: () => setOpen(false) }) : null,
      ]);
    }

    /**
     * 「下一步」那张深色卡 —— 页头与右栏共用同一份文案与骨架。
     *
     * 两边不一样的是"接下来那一下"：左页给「现在去做 →」（把你送到那一页），右栏给一句指路
     * （它本来就在今日这一侧，送不了）。**文案来自同一个 `state.nextAction`**，所以不会出现
     * 一处说东、一处说西。
     */
    function NextActionCard({ action, style, note, aside }) {
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', background: 'linear-gradient(100deg, #253b39, #36534d)', color: '#fff', ...style } }, [
        h('div', { key: 'copy', style: { flex: '1 1 220px' } }, [
          h('div', { key: 'label', style: { fontSize: '12px', opacity: '.7', textTransform: 'uppercase', letterSpacing: '.12em' } }, '下一步'),
          h('div', { key: 'title', style: { fontSize: '17px', fontWeight: '700', marginTop: '4px' } }, action?.label ?? '今天没有待办'),
          h('div', { key: 'reason', style: { fontSize: '13px', opacity: '.78', marginTop: '4px', lineHeight: '1.5' } }, action?.reason ?? '去成长工作台查看完整计划。'),
          note ?? null,
        ]),
        aside ?? null,
      ]);
    }

    /** One task row: check it off, then say what evidence came out of it. */
    function TaskRow({ task, entry, post, reload, tiers }) {
      // 交互件全部来自**共用组件**（`TaskCheck` 勾选 / `TaskEvidenceLine` 证据与弹窗）——
      // 这一行自己只管版式与元信息，所以不会再出现"改了左边、忘了右边"。
      //
      // 版式按**三块**分（层次是这里唯一的活）：
      //   这一步的要求 · 怎么学 · 我的痕迹
      // 原先这七行是平的：同一字号、同一颜色，读者没有落点，得自己猜哪行是任务、哪行是要求、
      // 哪行是自己写的。
      const done = entry?.done === true;
      const save = (patch) => post('/checkin', { taskId: task.id, ...patch });
      return h('div', { 'data-task-id': task.id, style: { ...S.row, flexDirection: 'column', alignItems: 'stretch', gap: '14px' } }, [
        h('div', { key: 'head', style: { display: 'flex', alignItems: 'flex-start', gap: '8px' } }, [
          h(TaskCheck, { key: 'box', task, done, onToggle: () => { void save({ done: !done }); } }),
          h('div', { key: 'text', style: { flex: '1 1 auto', minWidth: '0' } }, [
            h('div', {
              key: 'action',
              style: {
                fontSize: '15px', lineHeight: '1.6', cursor: 'pointer', wordBreak: 'break-word',
                textDecoration: done ? 'line-through' : 'none', opacity: done ? '0.6' : '1',
              },
              onClick: () => { void save({ done: !done }); },
            }, [
              // 标识单独成签、动作独立成句 —— 原先把「T5（2.1）列出这个功能的…」挤在一行，
              // 读者的第一眼落在编号上而不是要做的事上。
              h('span', { key: 'id', style: { ...S.chip, marginRight: '8px', verticalAlign: '1px' } }, task.id),
              task.action,
            ]),
            // 元信息只留"这是哪一道、要多久" —— 最低版本/完成标准/可接受证据搬到下面
            // 「这一步的要求」那一块去，它们是要核对的条件，不该混在编号里。
            h('div', { key: 'meta', style: { ...S.fine, marginTop: '4px' } },
              `引用 ${task.ref}　能力项 ${task.capability}　预计 ${String(task.minutes)} 分钟`),
          ]),
          // 「打卡 N 天」撤了：它说的是"你为这道题打过几次卡"，但读数条上已经有「连续 N 天」，
          // 而它自己不说清就需要解释 —— 一个要解释才懂的读数不值得占一屏。
          done ? h(Seal, { key: 'mark', tone: 'teal', label: '已完成', stamp: true }) : null,
        ]),
        // ① 要求：**标签 + 内容**两列。这样它读起来是"可以核对的条件"，而不是又一段说明文字。
        h('div', { key: 'req', style: { display: 'flex', flexDirection: 'column', gap: '5px', paddingLeft: '22px' } }, [
          h('div', { key: 'h', className: 'gw-subhead', style: S.subhead }, '这一步的要求'),
          ...[['最低版本', task.minimumVersion], ['完成标准', task.doneCriteria], ['可接受证据', task.acceptableEvidence]]
            .map(([label, value]) => h('div', { key: label, style: { display: 'flex', gap: '12px', alignItems: 'baseline' } }, [
              h('span', { key: 'l', style: { flex: '0 0 62px', fontSize: '12px', color: 'var(--gw-muted-2, #9aa7b1)' } }, label),
              h('span', { key: 'v', style: { flex: '1 1 auto', fontSize: '13px', lineHeight: '1.7', color: 'var(--gw-ink-2, #3d4a54)' } }, value),
            ])),
        ]),
        // 学习资料：这道题**怎么学**。计划只给要求是不够的 —— 没有方法，做题的人第一步就卡住。
        // 这一行只放引子与入口，方法与汇总在 `LearningSheet` 那张纸上读。
        h('div', { key: 'learn', className: 'gw-learn', style: { ...S.fine, paddingLeft: '22px', display: 'flex', flexDirection: 'column', gap: '5px' } }, [
          h('div', { key: 'h', className: 'gw-subhead', style: S.subhead }, '怎么学'),
          h(TaskLearnLine, { task }),
        ]),
        // ③ 我的痕迹：作答框（`TaskEvidenceLine`，两边共用）。右栏同一块也用它 ——
        // 「看起来不像控件」的东西在这里只需要一处实现。
        h('div', { key: 'evidence', style: { display: 'flex', flexDirection: 'column', gap: '7px', paddingLeft: '22px' } }, [
          h('div', { key: 'h', className: 'gw-subhead', style: S.subhead }, '我的痕迹'),
          h(TaskEvidenceLine, { task, entry, post, reload, tiers }),
        ]),
      ]);
    }

    /**
     * 一枚印章。手账那一层 —— 完成的、定级的、连续打卡的，都用它落款，而不是再写一行灰字。
     * `S.seal` 是底子，`tone` 决定颜色（描边走 currentColor，所以一个类比一条规则省事）。
     */
    function Seal({ label, sub, tone, round, stamp }) {
      const style = { ...S.seal };
      if (round === true) {
        style.borderRadius = '50%';
        style.width = '66px';
        style.height = '66px';
        style.padding = '0';
        style.fontSize = '16px';
        style.letterSpacing = '0';
      }
      return h('span', {
        className: `gw-seal${tone === undefined ? '' : ` tone-${tone}`}${stamp === true ? ' gw-stamp-in' : ''}`,
        style,
      }, [
        h('span', { key: 'label' }, label),
        sub === undefined ? null : h('span', { key: 'sub', className: 'gw-seal-sub' }, sub),
      ]);
    }

    /**
     * 一个读数：等宽大数字 + 大写间距小标签。这是治「一大堆同重的灰字」的地方 ——
     * 先看到 9/9、67%、12，再决定要不要去读那行说明。
     */
    function Readout({ value, unit, cap, first }) {
      const style = { padding: '0 22px', borderLeft: '1px solid var(--gw-line-soft, #efeae2)' };
      if (first === true) {
        style.paddingLeft = '0';
        style.borderLeft = '0';
      }
      return h('div', { style }, [
        h('div', { key: 'v', style: S.readoutNum }, [
          value,
          unit === undefined ? null : h('small', { key: 'u', style: { fontSize: '14px', fontWeight: '500', color: 'var(--gw-muted-2, #9aa7b1)', marginLeft: '2px' } }, unit),
        ]),
        h('div', { key: 'c', style: S.readoutCap }, cap),
      ]);
    }

    /** The metrics strip the page and the tab both show. */
    /**
     * 第几天：计划还没开始时它还不是 1。
     *
     * 原先到处写 `Math.max(1, day)` —— 那会把「还没开始」显示成「第 1 天」，而这是用户
     * 在这页上读到的第一个数字。没开始就直说还差几天。
     */
    function dayInfo(day) {
      if (day === null || day === undefined) return { value: '—', cap: '第几天', chip: 'DAY --', started: false };
      if (day < 1) return { value: String(1 - day), cap: '天后开始', chip: `${String(1 - day)} 天后开始`, started: false };
      return { value: String(day), cap: '第几天', chip: `DAY ${String(day).padStart(2, '0')}`, started: true };
    }

    /**
     * 加权缺口怎么念。
     *
     * `gap` 的单位是**分**，不是百分比：它是「(达标线 3 分 − 你的分) × 权重」的加权平均 ——
     * 0.62 就是"平均比达标线低 0.62 分"，**负数就是高于达标线**。页面上原先一律印成
     * 「-62%」：把分值当成了百分比，而且那个负号没有任何解释（用户的疑问就是
     * 「-62% 距达标线 是啥意思」）。一处定义，三处显示（读数条、自评卡、考核历史）都用它。
     */
    function gapLabel(gap) {
      if (gap === null || gap === undefined || typeof gap !== 'number' || Number.isNaN(gap)) return null;
      if (Math.abs(gap) < 0.005) return { cap: '正好在达标线', value: '0.00', unit: '分' };
      // 「距达标线 / 已超达标线」这两个词用户读了两次都没读懂（「0.62分 我现在都没明白是啥意思」）——
      // 它们是**名词**，而这里要说的是"比一个线高还是低"。改成一句能直接读出口的比较，
      // 并在下面那行把"达标线是什么"说清楚（数字本身没有单位感，是这句比较给了它单位）。
      return gap > 0
        ? { cap: '比达标线低', value: Math.abs(gap).toFixed(2), unit: '分' }
        : { cap: '比达标线高', value: Math.abs(gap).toFixed(2), unit: '分' };
    }

    function Metrics({ state }) {
      const { metrics } = state;
      // 「达标线是什么」那句的展开状态 —— 默认收起（它天天占一行就是版面噪音，见下面那个 `?`）。
      const [showGapNote, setShowGapNote] = useState(false);
      const day = dayInfo(metrics.day);
      const week = metrics.weekRate === null ? undefined : String(Math.round(metrics.weekRate * 100));
      // 「本周」在提前模式下不是字面意义的本周 —— 它一直是**计划里的第 N 周**。所以按计划叫它。
      const weekNo = metrics.day === null || metrics.day < 1 ? null : Math.floor((metrics.day - 1) / 7) + 1;
      // gap 的单位是**分**（见 `gapLabel`）—— 这里原先印成百分比，是把分值当成了比例。
      const gap = gapLabel(metrics.gap);
      // 「走到哪一段了」：第几段 + 阶段名，**并进上面那一排指标**，排在「完成」前面（用户：
      // 「做到上面指标 在完成指标前面 1/4 阶段」）—— 它本来就属于那一排，那一排说的都是
      // "我在哪、做到哪了"。没有当前阶段（还没开始 / 已经走完）时这一格不出现。
      const phaseIndex = metrics.phaseIndex;
      const phase = typeof phaseIndex === 'number' && phaseIndex >= 0 && metrics.phaseName.length > 0
        ? { index: phaseIndex, total: state.plan.phases.length, name: metrics.phaseName }
        : null;
      const kids = [
        h('div', { key: 'numbers', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' } }, [
          h('div', { key: 'strip', style: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', flex: '1 1 auto' } }, [
            h(Readout, { key: 'day', first: true, value: day.value, cap: day.cap }),
            phase === null ? null : h(Readout, { key: 'phase', value: `${String(phase.index + 1)}/${String(phase.total)}`, cap: phase.name }),
            h(Readout, { key: 'done', value: `${String(metrics.completion.done)}/${String(metrics.completion.total)}`, cap: '完成' }),
            h(Readout, { key: 'week', value: week === undefined ? '—' : week, unit: week === undefined ? undefined : '%', cap: weekNo === null ? '本周完成率' : `第 ${String(weekNo)} 周` }),
            // 没有自评时不是「距达标线 0.00」—— 那会读成"正好在线上"。说清楚是**还没有**。
            h(Readout, { key: 'gap', value: gap === null ? '—' : gap.value, unit: gap === null ? undefined : gap.unit, cap: gap === null ? '还没自评' : gap.cap }),
            // 「达标线是什么」收进这个 `?`（用户：「加个?图标提示，这里太占位置」）—— 那一句
            // 解释是真需要的（「0.62 分」不说明白就只是个数字），但不该天天占一行版面。
            // 不删、只是折叠：点开就在下面那一行原位出现。
            gap === null ? null : h('button', {
              key: 'gap-help',
              type: 'button',
              className: 'gw-quiet',
              title: '达标线是什么',
              'aria-label': '达标线是什么',
              'aria-expanded': showGapNote ? 'true' : 'false',
              style: { ...S.fine, ...S.quiet, flex: '0 0 auto', width: '20px', height: '20px', padding: '0', marginBottom: '2px', borderRadius: '50%', border: '1px solid var(--gw-line, #d9d0c4)', textAlign: 'center', lineHeight: '18px', textDecoration: 'none', cursor: 'pointer' },
              onClick: () => { setShowGapNote(!showGapNote); },
            }, '?'),
          ]),
          metrics.streak > 0 ? h(Seal, { key: 'streak', tone: 'teal', label: `连续 ${String(metrics.streak)} 天`, sub: '不间断' }) : null,
        ]),
        gap === null || !showGapNote ? null : h('div', { key: 'gap-note', style: S.meta },
          `达标线 = 每项 3 分（照现成规范能独立做出合格产出）；这一栏是「达标线 − 我的分」按权重平均出来的差。`),
      ];
      if (state.plan.planStart === '') {
        kids.push(h('div', { key: 'warn', style: S.warn },
          '计划还没有起始日 —— 去「计划」页设定第 1 天。'));
      }
      // 「今天没排到任务」这句原先也在这里说了一遍，和下面那张卡的标题重复。留一处就够 ——
      // 那是这一页唯一说「你该看哪一批任务」的地方。
      return h('div', { style: S.card }, kids);
    }

    /** Today's body, shared by the page tab and the right-sidebar tab. */
    function TodayBody({ state, post, reload, compact }) {
      const kids = [];
      // 「我在做第几天」是提前过的指针；「按日历今天是第几天」= 指针减掉提前的天数。
      const aheadDays = state.metrics.aheadDays ?? 0;
      const pointer = state.metrics.day;
      const allTasks = state.plan.phases.flatMap((phase) => phase.tasks ?? []);
      const todayLeft = pointer === null
        ? []
        : allTasks.filter((task) => task.day === pointer && state.progress.tasks?.[task.id]?.done !== true);
      const nextDay = pointer === null
        ? null
        : (allTasks.map((task) => task.day).filter((day) => Number.isInteger(day) && day > pointer).sort((left, right) => left - right)[0] ?? null);
      if (!compact) kids.push(h(Metrics, { key: 'metrics', state }));
      // 空状态要说清「为什么空、下一步怎么办」。原先只有一句「计划里没有待办任务」，
      // 而下面这三种情况的原因完全不同 —— 用户看完还是不知道该做什么。
      const taskTotal = state.plan.phases.reduce((sum, phase) => sum + ((phase.tasks ?? []).length), 0);
      const rows = state.focus.tasks.length === 0
        ? [h('div', { key: 'empty', style: S.empty }, state.plan.phases.length === 0
          ? '还没有计划。完成「画像」后就能生成。'
          : taskTotal === 0
            ? '计划目前只排到周，还没有排到天的任务 —— 让 AI 把它细化到天，这里就会出现今天该做的事。'
            : '计划里的任务都做完了 —— 该做一次考核，把成果沉淀下来。')]
        : state.focus.tasks.slice(0, 1).map((task) => h(TaskRow, { key: task.id, task, entry: state.progress.tasks?.[task.id], post, reload, tiers: state.catalog.tiers }));
      kids.push(h('div', { key: 'card', style: S.card }, [
        // 卡头只留标题。原先这里还会在"今天全部做完"时落一枚「已全部完成」的章 —— 撤了：
        // 一屏上已经有「连续 N 天」和任务自己那枚「已完成」，再来一枚就是三枚章抢注意力
        // （用户的原话：「过多眼花」）。**完成的正反馈没有少**：勾上就有那一下盖章，
        // 而且每个任务各自那枚才是真的（它说的是这道题，不是这一屏）。
        h('div', { key: 'head', style: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' } }, [
          h('h3', { key: 'title', style: S.h3 }, state.focus.scheduled
            // 提前模式下"今天"不是字面意义的今天 —— 那就是"你在第 N 天要做"。
            ? (aheadDays > 0 && pointer !== null ? `你在第 ${String(pointer)} 天要做` : '今天要做')
            : '接下来要做'),
        ]),
        ...rows,
      ]));
      // 「今天排的做完了，我还有力气」—— 这句话只有在这里说得出口：需求就出现在这一刻。
      // 所以入口长在这儿，而不是计划页的设置卡里（那里是"日历"，不是"我今天的状态"）。
      // 按钮把指针推到**下一道真实存在的任务**那一天（中间可能有没排任务的空档）。
      if (pointer !== null && todayLeft.length === 0 && nextDay !== null) {
        kids.push(h(NoteLine, {
          key: 'ahead',
          text: `今天排的做完了 —— 接下来是第 ${String(nextDay)} 天。`,
          // 推到"那一天"，而不是无脑 +1：第 3 天之后可能第 5 天才排了任务。
          actions: [{ label: '继续做下一天 →', onClick: () => { void post('/ahead', { days: nextDay - pointer + aheadDays }); } }],
        }));
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: compact ? '8px' : '18px' } }, kids);
    }

    function WorkbenchHeader({ state, post, onNavigate, hideNext, currentTab }) {
      const action = state.nextAction;
      // 下一步就落在用户正在看的这一页时，「现在去做 →」是让他去他已经站在的地方 ——
      // 考核那条的 targetTab 与 targetAnchor 都是 review，而页面上没有这个锚点，
      // 于是这个按钮完全空转。理由留着（它解释为什么是现在），按钮去掉：这一页自己的
      // 动作就在下面（考核页是「让 AI 现在考核」）。
      const onThisTab = action !== undefined && action !== null && action.targetTab === currentTab;
      const day = dayInfo(state.metrics.day);
      const [activity, setActivity] = useState(agentActivity);
      useEffect(() => subscribeActivity(setActivity), []);
      // 运行固定发在工作台自己的那个对话里 —— 状态栏要说的是**那个**对话，不是"当前对话"。
      const agentTitle = state.profile.agentSession?.title || AGENT_SESSION_TITLE;
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, [
        h('div', { key: 'intro', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' } }, [
          h('div', { key: 'copy' }, [
            h('div', { key: 'eyebrow', style: { ...S.fine, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--gw-coral-deep, #a64132)' } }, '成长手记'),
            h('h1', { key: 'title', style: { ...S.h2, fontSize: '40px', lineHeight: '1.08', marginTop: '8px' } }, state.profile.targetRole ? `向 ${state.profile.targetRole} 走` : '把成长，变成下一步'),
            h('div', { key: 'sub', style: S.meta }, state.profile.positioning || '不是填表，而是把今天真正做成一小步。'),
          ]),
          h('div', { key: 'day', style: { ...S.chip, fontFamily: 'var(--gw-mono, monospace)' } }, day.value === '—' ? 'DAY --' : (day.started ? `DAY ${String(day.value).padStart(2, '0')}` : `${day.value} 天后开始`)),
        ]),
        action === undefined || action === null || hideNext === true ? null : h(NextActionCard, {
          key: 'next',
          action,
          style: { padding: '16px 18px', borderRadius: '15px', boxShadow: '0 14px 28px rgba(37,59,57,.16)' },
          aside: onThisTab ? null : h('button', { key: 'go', type: 'button', style: { ...S.button, background: '#f3c26b', borderColor: '#f3c26b', color: '#253b39' }, onClick: () => onNavigate(action.targetTab, action.targetAnchor) }, '现在去做 →'),
        }),
        activity === null ? null : h('div', { key: 'activity', role: 'status', 'aria-live': 'polite', style: { ...S.meta, padding: '9px 12px', borderRadius: '10px', background: activity.status === 'error' ? '#fff0ed' : activity.status === 'completed' ? '#edf7ef' : '#f3efe8' } }, activity.status === 'completed'
          ? (activity.wrote === true
            ? 'AI 已返回结果，页面已自动更新。'
            // 「跑完了」和「写了东西」是两件事：它可能只在对话里回了一段话。那种时候说
            // 「页面已自动更新」就是空欢喜，得说清去哪儿看它说了什么。
            : `AI 跑完了，这次没有改动页面数据 —— 它说了什么在「${agentTitle}」那个对话里。`)
          : activity.status === 'error' ? `AI 处理失败：${activity.error}` : activity.status === 'queued' ? 'AI 已接手，页面会自动刷新结果，不需要守着对话。' : `正在把请求送进「${agentTitle}」对话…`),
      ]);
    }

    /**
     * 「一行说明 + 一两个动作」的那种行 —— **三处共用同一个样子**。
     *
     * 用户点名的三处：今日页的「今天排的做完了… 继续做下一天 →」、页脚的「你已经在做第 N 天…
     * 回到日历节奏」、页脚的「Agent 运行都在… 改绑 / 重建」。原先一处带沙色底、另两处不带，
     * 字号还分 meta / fine 两种 —— 同一类东西三种样子。
     *
     * 动作由这一层统一样式（`gw-quiet`：无边框无底色、只靠下划线与颜色），调用方只给
     * `{ label, onClick, disabled }`，这样"统一"不是靠自觉。
     */
    function NoteLine({ text, actions }) {
      return h('div', { className: 'gw-noteline', style: { ...S.meta, display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' } }, [
        h('span', { key: 'text', style: { minWidth: '0' } }, text),
        ...(actions ?? []).filter(Boolean).map((action) => h('button', {
          key: action.label,
          type: 'button',
          className: 'gw-quiet',
          disabled: action.disabled === true,
          style: { ...S.meta, ...S.quiet, cursor: action.disabled === true ? 'default' : 'pointer' },
          onClick: action.onClick,
        }, action.label)),
      ]);
    }

    /**
     * 页脚：**状态与设置**，不是核心内容。现在有四行，各归各页：提前的节奏（计划）、
     * 跟老师商量（计划 / 考核）、Agent 运行在哪（画像）、改动记录（画像）。
     *
     * 这两行原先在页头 —— 夹在「下一步」和指标卡之间。于是每次打开这一页，第一眼读到的是
     * "你的节奏比日历快几天""Agent 在哪个对话里跑"：都重要，但都不是"我现在要做什么"。
     * 核心内容留在上面，这些挪到下面（用户：「这块放下面就行，顶部留给核心内容」）。
     * 顶部的 DAY 徽标仍然说着"第几天"，所以挪下去没丢信息。
     */
    function WorkbenchFoot({ state, post, tab }) {
      const ahead = state.metrics.aheadDays ?? 0;
      const pinned = state.profile.agentSession ?? null;
      const hasAgentLine = (typeof pinned?.id === 'string' && pinned.id.length > 0) || typeof rootCtx?.get === 'function';
      const kids = [];
      // **这两行各有归属，不必每个页签都摆**（用户：「这两个不需要所有页面都有：日历节奏这个放
      // 计划页面下面，Agent 运行只放在画像下面」）—— 「日历节奏」是计划的时间设置，
      // 「Agent 运行在哪个对话」是画像那一摊的设置。别的页签读到它们只是噪音。
      if (tab === 'plan' && ahead > 0) {
        kids.push(h(NoteLine, {
          key: 'ahead',
          text: state.metrics.day === null
            ? '你的节奏比日历快 —— 计划还没开始，所以还没有"第几天"'
            : `你已经在做第 ${String(state.metrics.day)} 天（按日历今天是第 ${String(state.metrics.day - ahead)} 天）`,
          actions: [{ label: '回到日历节奏', onClick: () => { void post('/ahead', { days: 0 }); } }],
        }));
      }
      // 「和老师聊聊」—— 这两个页签上的东西是**可以商量的**：计划怎么排、考卷与评分标准怎么定。
      // 入口就长在它们自己那一页的页脚，说清"能商量"与"商量完会发生什么"（改动记在画像页），
      // 点下去发出去的是一句**完整的**话（带着这一页的上下文），不是半句等着用户接。
      // 计划还没有的时候不摆它：那时候页面上只有一件事要做 —— 先生成计划。
      if (state.plan.phases.length > 0 && tab === 'plan') {
        kids.push(h(NoteLine, {
          key: 'teacher-plan',
          text: '哪一天排得不合适、哪道题你本来就会 —— 跟老师说，他会改；改了什么记在「画像」页的改动记录里。',
          actions: [{
            label: '和老师聊聊',
            onClick: () => {
              void askAgent('我想跟你聊聊现在的计划。先调 growth_context scope=plan 看一遍，用三句话说明现在最卡的是哪几处，然后问我想改什么 —— 先别动手，等我说完再改。').catch(() => {});
            },
          }],
        }));
      }
      if (state.plan.phases.length > 0 && tab === 'review') {
        kids.push(h(NoteLine, {
          key: 'teacher-review',
          text: '对考卷、考题或评分标准有疑问 —— 问老师。分数不会因为忙或累就改，下一段的任务难度可以调。',
          actions: [{
            label: '和老师聊聊',
            onClick: () => {
              void askAgent('我想跟你聊聊考核 —— 考卷、考题、评分标准这些。先调 growth_context scope=plan 与 scope=history，说明这次的考卷与标准是怎么定的，然后问我对哪一条有疑问。').catch(() => {});
            },
          }],
        }));
      }
      if (tab === 'profile' && hasAgentLine) {
        kids.push(h(AgentSessionLine, { key: 'agent-session', state, post }));
      }
      // 改动记录紧跟在「Agent 运行在哪个对话」后面（用户：「放这后面」）—— 这两行说的是同一件
      // 事的两半：谁在动，动了什么。空账时 `ChangeLog` 自己返回 null，不必在这儿判。
      if (tab === 'profile') {
        kids.push(h(ChangeLog, { key: 'changes', state }));
      }
      // 页脚最后一行：署名。**每个页签都有**（它是这件东西的落款，不是某一页的设置），
      // 但它得轻 —— 一行 12px 灰字，一个链接，不占版面、不抢"我现在要做什么"。
      // 版本号从 `/state` 来（宿主读自己的 package.json）：报问题时说得出装的是哪一版。
      kids.push(h('div', {
        key: 'credit',
        style: { ...S.fine, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'baseline', color: 'var(--gw-muted-2, #9aa7b1)' },
      }, [
        h('span', { key: 'by' }, `${LABEL}${state.version ? ` v${state.version}` : ''} · MIT · © mingdui`),
        h('a', {
          key: 'src',
          href: REPO_URL,
          target: '_blank',
          rel: 'noreferrer',
          style: { color: 'inherit', textDecoration: 'underline' },
        }, '源码'),
      ]));
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' } }, kids);
    }

    /**
     * Agent 运行发到哪个对话 —— 页头一行小字 + 最多两个安静的动作。
     *
     * 它是**一条说明**，不是一张卡：从 ③ 可迁移能力起，每一次运行都发进同一个固定对话
     * （第一次用时自动新建），所以"发到哪儿"必须随时看得见、随时能改。固定的对话被删掉时
     * 这一行不猜 —— 发送会明确报错（见 `resolveAgentSession`），而出口就在这里。
     */
    function AgentSessionLine({ state, post }) {
      const pin = state.profile.agentSession ?? null;
      const pinnedId = typeof pin?.id === 'string' ? pin.id : '';
      const title = typeof pin?.title === 'string' && pin.title.length > 0 ? pin.title : AGENT_SESSION_TITLE;
      const sessions = typeof rootCtx?.get === 'function' ? rootCtx.get('sessions') : undefined;
      const [note, setNote] = useState('');
      // 动作的回声（「新建了对话「成长工作台」」这种）—— 与错误分开存，不然一句好消息长着
      // 一张红脸。点了按钮什么都不说，用户读到的就是「没啥反应」（他的原话）。
      const [ok, setOk] = useState('');
      const [busy, setBusy] = useState(false);
      // 既没固定、又没有会话服务（预览环境就是这样）：这一行没有话可说。
      if (pinnedId.length === 0 && sessions === undefined) return null;

      const run = async (work) => {
        setBusy(true);
        setNote('');
        setOk('');
        try {
          await work();
        } catch (failure) {
          setNote(messageOf(failure));
        } finally {
          setBusy(false);
        }
      };
      const act = (label, work) => ({
        label,
        disabled: busy,
        onClick: () => { void run(work); },
      });
      // "当前对话"两代读法不同（旧版 `list.current`，新版看谁持有着 mainView）——
      // 差异在 `currentSessionId` 里收着，这里只管用。
      const currentId = () => currentSessionId(sessions);
      const currentTitle = () => sessions?.list?.getSnapshot?.()?.byId?.[currentId()]?.title ?? '';
      const bindCurrent = act(pinnedId.length > 0 ? '改绑到当前对话' : '固定到当前对话', async () => {
        if (currentId().length === 0) throw new Error('现在没有打开的对话可以改绑 —— 先打开一个，再点这里');
        const reply = await post('/agent-session', { sessionId: currentId(), title: currentTitle() });
        if (reply.ok !== true) throw new Error(reply.error ?? '改绑失败');
      });
      const rebuild = act('重建一个', async () => {
        const created = await createAgentSession(sessions, state?.agentWorkspace, state?.agentWorkspaceId);
        const reply = await post('/agent-session', { sessionId: created.id, title: created.named ? AGENT_SESSION_TITLE : '新会话' });
        if (reply.ok !== true) throw new Error(reply.error ?? '固定失败');
        // 不必再"打开"一次：新建那一步（`createAgentSession`）已经把它变成了这一页显示着的
        // 那个对话 —— 两代 API 的差异在 `claimMainView` 里收着（旧版 open，新版 retain(mainView)）。
        // **要有回声**：点了按钮什么都不说，用户读到的是"没啥反应"（他的原话）。
        // 改名失败时**把原因一起说出来** —— 我上一版只回了个 true/false，于是用户报了两次，
        // 我两次都只能猜。名字没改成不是灾难，说不清为什么才是。
        // 回声三句，都是用户看得见的现象，一句不猜：
        //  ① 建好了、名字也改上了 —— 但**空对话在侧栏里一律显示「新会话」**（DSH 的规矩：
        //     `displayTitle` 对 `blank` 的行一律用那个标签，不看标题）。第一条消息发出去，
        //     那一行就会变成「成长工作台」。用户为此报过两次，所以这句话得说。
        //  ② 名字没改上 —— 把原因带上。
        //  ③ 没能归到工作区 —— 直说它会挂在「未分组」下。
        // 打个招呼：空对话在侧栏里叫「新会话」，这一句发出去它就变成「成长工作台」了。
        // 走的是 `askAgent` —— 同一份可见、可打断的通道，不是偷偷跑一个后台。发送失败不挡住
        // 这一行的话（`askAgent` 自己会把失败落到页头那行状态里）。
        void askAgent(AGENT_GREETING).catch(() => {});
        const where = created.workspaceId.length > 0 ? '' : '没能归到工作区 —— 侧栏里挂在「未分组」下。';
        setOk(created.named
          ? `新建了对话「${AGENT_SESSION_TITLE}」，已经把「${AGENT_GREETING}」发过去了，之后的运行都发进它。${where}`
          : `对话建好了，也把「${AGENT_GREETING}」发过去了，但没能改成「成长工作台」${created.reason.length > 0 ? `（${created.reason}）` : ''}。${where}`);
      });

      // 没有会话服务（预览里就是这样，别的宿主也可能）：这一行只剩说明 —— 两个动作都要
      // 靠它才做得了，摆一个按不动的按钮比不摆更糟。
      return h('div', { className: 'gw-agent-line' }, [
        h(NoteLine, {
          key: 'line',
          text: pinnedId.length > 0
            ? `Agent 运行都在「${title}」这个对话里`
            : 'Agent 运行会发进一个专用对话（第一次用时自动新建）',
          actions: sessions === undefined ? [] : [bindCurrent, pinnedId.length === 0 ? null : rebuild],
        }),
        note.length === 0 ? null : h('span', { key: 'note', style: S.error }, note),
        ok.length === 0 ? null : h('span', { key: 'ok', style: { ...S.meta, color: 'var(--gw-teal, #2f7d74)' } }, ok),
      ]);
    }


    /** ISO（UTC）→ 本地「MM-DD HH:mm」；不是今年的才带上年份。 */
    function stampOf(iso) {
      const at = new Date(iso);
      if (Number.isNaN(at.getTime())) return '';
      const md = `${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
      const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
      return at.getFullYear() === new Date().getFullYear() ? `${md} ${hm}` : `${String(at.getFullYear())}-${md} ${hm}`;
    }

    /**
     * 改动记录 —— **老师动了什么**，一行一条：`时间 · 模块 · 一句话`。
     *
     * 它回答的是一个很具体的不安：隔一天回到页面，"这题怎么变了"。所以它不是审计日志 ——
     * 每条只有一句话；也不是统计 —— 最近三条直接摆出来，更早的折在一个按钮后面。
     * 一条都没有的时候整个模块不出现：没发生的事不用占一行。
     */
    function ChangeLog({ state }) {
      const all = state.profile.changes ?? [];
      const [open, setOpen] = useState(false);
      if (all.length === 0) return null;
      const entries = [...all].reverse(); // 最近的在上
      const shown = open ? entries : entries.slice(0, 3);
      const hidden = entries.length - shown.length;
      return h('div', { className: 'gw-changes', style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
        h('div', { key: 'head', style: { ...S.meta, fontWeight: 600 } }, `改动记录（${String(entries.length)} 条）`),
        ...shown.map((entry, index) => h('div', {
          key: `${String(entry.at)}-${String(index)}`,
          style: { ...S.meta, display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' },
        }, [
          h('span', { key: 'at', style: { flex: '0 0 auto', opacity: .72, fontFamily: 'var(--gw-mono, monospace)' } }, stampOf(entry.at)),
          // 模块用 `chipPlain`（灰底）而不是 `chip`（珊瑚底）：一整列珊瑚色小签读起来像五条告警，
          // 而这里只是个分类标签 —— 该被看见的是那句话。
          h('span', { key: 'module', style: S.chipPlain }, entry.module),
          h('span', { key: 'text', style: { flex: '1 1 200px', minWidth: '0' } }, entry.text),
        ])),
        hidden > 0 || open
          ? h('button', {
            key: 'more',
            type: 'button',
            className: 'gw-quiet',
            style: { ...S.meta, ...S.quiet, alignSelf: 'flex-start', cursor: 'pointer' },
            onClick: () => { setOpen(!open); },
          }, open ? '收起' : `更早的 ${String(hidden)} 条`)
          : null,
      ]);
    }

    /**
     * 执行趋势：每周完成率的柱状图。
     *
     * 与四维趋势图不同，这里用柱子而不是折线 —— 每周完成率是离散测量，柱子更准；
     * 而「那一周没排到天的任务」= 没有柱子，缺口得以如实表达，不必把折线断开。
     * 只到本周为止：未来周画上去就是一排 0%，那不是「执行得差」，是「还没到」。
     */
    function WeekTrendChart({ rates }) {
      if (rates.length === 0) return null
      const W = 640
      const H = 170
      // 左侧留给刻度字：**「100%」是这里最宽的一个**，11px 下约 27px，右对齐到 `LEFT - 8`，
      // 所以 LEFT = 34 时它的左边缘落在 x ≈ -1 —— 被 SVG 自己的边界切掉，四个刻度里
      // 只有它少了前面那个 1（用户看出来的：「感觉看不到那个1了，太靠左了」）。46 留出余量。
      const LEFT = 46
      const RIGHT = 14
      const TOP = 14
      const BOTTOM = 30
      const plotW = W - LEFT - RIGHT
      const plotH = H - TOP - BOTTOM
      const slot = plotW / rates.length
      const barW = Math.max(6, Math.min(30, slot * 0.62))
      const y = (rate) => TOP + plotH * (1 - rate)
      const kids = []

      for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
        kids.push(h('line', {
          key: `grid-${String(tick)}`,
          x1: LEFT, x2: W - RIGHT, y1: y(tick), y2: y(tick),
          stroke: tick === 0 ? 'var(--gw-line, #d9d0c4)' : 'var(--gw-line-soft, #eee9e1)',
          strokeWidth: 1,
        }))
        kids.push(h('text', {
          key: `tick-${String(tick)}`,
          x: LEFT - 8, y: y(tick) + 4, textAnchor: 'end',
          style: { fontSize: '11px', fill: 'var(--gw-muted, #718096)' },
        }, [`${String(Math.round(tick * 100))}%`]))
      }

      const everyLabel = rates.length <= 8
      rates.forEach((entry, index) => {
        const centre = LEFT + slot * index + slot / 2
        const current = index === rates.length - 1
        const scored = entry.rate !== null && entry.rate !== undefined
        if (scored) {
          // 0% 也要留一条细柱：它是「排了任务但一项没做」，与「这周没排任务」（没有柱子）
          // 是两件事，画成一样就等于把缺数据说成了没做完。
          const height = Math.max(2, plotH * entry.rate)
          kids.push(h('rect', {
            key: `bar-${String(entry.week)}`,
            x: centre - barW / 2, y: TOP + plotH - height, width: barW, height, rx: 3,
            fill: current ? '#e56b55' : 'rgba(229,107,85,.34)',
          }, [
            h('title', { key: 'tip' }, [`第 ${String(entry.week)} 周 · 完成率 ${String(Math.round(entry.rate * 100))}%`]),
          ]))
        }
        if (everyLabel || current) {
          kids.push(h('text', {
            key: `week-${String(entry.week)}`,
            x: centre, y: H - BOTTOM + 16, textAnchor: 'middle',
            style: {
              fontSize: '11px',
              fill: current ? 'var(--gw-coral-deep, #a64132)' : 'var(--gw-muted, #718096)',
              fontWeight: current ? '700' : '400',
            },
          }, [String(entry.week)]))
        }
        if (current && scored) {
          kids.push(h('text', {
            key: 'now',
            x: centre, y: TOP + plotH - plotH * entry.rate - 6, textAnchor: 'middle',
            style: { fontSize: '11px', fontWeight: '700', fill: 'var(--gw-coral-deep, #a64132)' },
          }, [`${String(Math.round(entry.rate * 100))}%`]))
        }
      })

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, [
        h('div', { key: 'plot', style: { overflowX: 'auto' } }, [
          h('svg', {
            viewBox: `0 0 ${String(W)} ${String(H)}`,
            width: '100%',
            role: 'img',
            'aria-label': `执行趋势：第 1 到第 ${String(rates.length)} 周的完成率`,
            style: { display: 'block', minWidth: '460px', height: 'auto' },
          }, kids),
        ]),
        rates.length > 1 ? null : h('div', { key: 'one', style: S.fine }, '再有一周，才看得出走势。'),
      ])
    }

    /**
     * 路径带：四个阶段连成一条线，「你在这」标在当前那一段上。
     *
     * 状态不靠另存 —— `metrics.phaseIndex` 就是当前阶段，比它小的都已经走完。
     * 这里只用短标签（长名字在这条带上会折到看不清），完整的名字、天区间与验收标准
     * 在下面那张阶段列表里。
     */
    /**
     * 七个段位，从黄铜到王者。颜色是**有意压过饱和度**的：这条阶梯要有七种颜色才分得出，
     * 但它得落在纸底上，不能炸开。
     *
     * 阶段与段位等距对应（见 rankIndexForPhase）：四个阶段就是 黄铜 / 黄金 / 钻石 / 王者 ——
     * 收在最高一段，阶梯才是向上的。
     */
    const RANKS = [
      { name: '黄铜', color: '#b08d57' },
      { name: '白银', color: '#94a3ad' },
      { name: '黄金', color: '#d59b3f' },
      { name: '铂金', color: '#6fb3ab' },
      { name: '钻石', color: '#6aa9e0' },
      { name: '超凡大师', color: '#9b8bd0' },
      { name: '王者', color: '#c9553a' },
    ];

    /** 第 N 个阶段对应哪一段：等距取，所以阶段数变了不用改表。 */
    function rankIndexForPhase(index, count) {
      if (count <= 1) return RANKS.length - 1;
      return Math.round((index * (RANKS.length - 1)) / (count - 1));
    }

    /**
     * 起点那一格：木牌。它**不在 RANKS 里** —— RANKS 是阶段对应得上的七段（等距取），
     * 而木牌是"一段都还没走完"的样子：计划刚开始时你手里就是这块牌子。
     */
    const START_RANK = { name: '木牌', color: '#9c7b52' };

    /** 当前段位：走完几个阶段就到第几段；一段都没走完时是木牌。 */
    function currentRank(state, phaseCount) {
      const index = state.metrics.phaseIndex;
      if (index === null || index === undefined || index <= 0 || phaseCount <= 0) return START_RANK;
      return RANKS[rankIndexForPhase(Math.min(index - 1, phaseCount - 1), phaseCount)];
    }

    /** 段位名（没有名字时给一个空串，供只有图形的地方用）。 */
    function rankOf(index, count) {
      return RANKS[rankIndexForPhase(index, count)];
    }

    /**
     * 这条阶梯上走到第几段了：走完的阶段数决定。
     * 当前阶段**没走完**就不算达成 —— 空心的那一枚正是「还差什么」。
     */
    function rankReached(tierIndex, phaseIndex, phaseCount) {
      if (phaseIndex <= 0) return false;
      return tierIndex <= rankIndexForPhase(Math.min(phaseIndex - 1, phaseCount - 1), phaseCount);
    }

    /**
     * 段位章：一枚手画的盾牌 —— 本仓库没有 dependencies，图标库引不进来，而这形状很简单。
     * 达成的填色，没达成的只留描边；两者都带名字，所以「黄铜 → 王者」这条梯子看得见。
     */
    function RankBadge({ rank, achieved, size, showName }) {
      const side = size ?? 30;
      const stroke = achieved === true ? rank.color : 'var(--gw-line, #e5dfd5)';
      return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '7px', flex: '0 0 auto' } }, [
        h('svg', { key: 'badge', viewBox: '0 0 24 24', width: String(side), height: String(side), 'aria-hidden': 'true' }, [
          h('path', {
            key: 'shield',
            d: 'M12 1.7 3.3 5.1v7.2c0 5 3.7 8.8 8.7 10.4 5-1.6 8.7-5.4 8.7-10.4V5.1L12 1.7z',
            fill: achieved === true ? rank.color : 'transparent',
            stroke,
            strokeWidth: '2',
            strokeLinejoin: 'round',
          }),
        ]),
        showName === false ? null : h('span', {
          key: 'n',
          style: { fontSize: '12.5px', fontWeight: '600', color: achieved === true ? rank.color : 'var(--gw-muted-2, #9aa7b1)', whiteSpace: 'nowrap' },
        }, rank.name),
      ]);
    }

    function PathBand({ phases, currentIndex }) {
      if (phases.length === 0) return null;
      return h('div', { className: 'gw-path' }, phases.map((phase, index) => {
        const state = index === currentIndex ? 'now' : (currentIndex >= 0 && index < currentIndex ? 'done' : '');
        return h('div', { key: phase.name, className: state }, [
          h('i', { key: 'dot' }),
          h('b', { key: 'name' }, phase.name),
          h('span', { key: 'days' }, `${String(phase.days[0])}–${String(phase.days[1])}`),
        ]);
      }));
    }

    /**
     * 四块能力：字母章 + 名称 + 权重 + 自评进度条。
     *
     * 这是总目标那层落到可度量的地方 —— 目标里说要补齐的，量的就是这个模型。
     * 权重与项数都来自模型自己；进度按已打分的项数算（缺数据记为未提交，不是 0 分）。
     */
    function GroupRows({ role, scores }) {
      const currentKey = (role.groups.find((group) => role.items.some((item) => item.group === group.key && scores[item.id] === undefined)) ?? {}).key;
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '11px' } }, role.groups.map((group) => {
        const items = role.items.filter((item) => item.group === group.key);
        const scored = items.filter((item) => scores[item.id] !== undefined).length;
        const current = group.key === currentKey;
        const full = scored === items.length && items.length > 0;
        return h('div', { key: group.key, style: { display: 'flex', alignItems: 'center', gap: '12px' } }, [
          h('span', { key: 'chip', className: `gw-gchip${current ? ' now' : ''}` }, group.key),
          h('span', { key: 'name', style: { flex: '0 0 150px', fontSize: '13px', ...(current ? { fontWeight: '600', color: 'var(--gw-coral-deep, #a64132)' } : {}) } }, group.name),
          h('span', { key: 'weight', style: { flex: '0 0 auto', fontFamily: 'var(--gw-mono, monospace)', fontSize: '11.5px', color: 'var(--gw-muted-2, #9aa7b1)' } }, `${String(group.weight)}%`),
          h('div', { key: 'bar', style: { ...S.bar, flex: '1 1 auto' } }, [
            h('i', { key: 'fill', style: { ...S.barFill, width: `${String(items.length === 0 ? 0 : Math.round((scored / items.length) * 100))}%`, background: full ? 'var(--gw-teal, #2f7d74)' : 'var(--gw-coral, #e56b55)' } }),
          ]),
          h('span', { key: 'count', style: { flex: '0 0 36px', textAlign: 'right', fontFamily: 'var(--gw-mono, monospace)', fontSize: '12px', color: 'var(--gw-muted, #6f7c87)' } }, `${String(scored)}/${String(items.length)}`),
        ]);
      }));
    }

    /** The plan tab: goal, execution trend, phases with their day intervals, the task contract, self-check, portfolio. */
    function PlanTabBody({ state, post }) {
      const plan = state.plan;
      // 生成计划这个动作在画像页底部也有一个入口，而 AskButton 的"已发送"状态是每个实例
      // 各自的 —— 所以这里要看全局 activity，不能只看这个按钮自己被点过没有。
      const busy = useAgentBusy();
      const [startDraft, setStartDraft] = useState(plan.planStart ?? '');
      // 这个按钮以前没有状态：日期没改动时点下去是一次空写，页面上什么都不变 ——
      // 用户看到的就是「点了没反应」。所以让它跟着数据的真实状态走，而不是跟着点击走：
      // 与库里一致就显示「已保存」（不假装可点），改动了才是可点的「保存」。
      const [saving, setSaving] = useState(false);
      useEffect(() => { setStartDraft(plan.planStart ?? ''); }, [plan.planStart]);
      const startChanged = startDraft !== (plan.planStart ?? '');
      const saveStart = async () => {
        setSaving(true);
        await post('/plan-start', { date: startDraft });
        // 不在这里写「已保存」：成功与否由刷新后的 planStart 决定，那才是真的。
        setSaving(false);
      };

      if (plan.phases.length === 0) {
        const ready = state.profile.targetRole.length > 0 && state.catalog.missingBackground.length === 0 && state.catalog.activeRole !== null;
        const generating = busy && ready;
        return h('div', { 'data-anchor': 'plan-empty', style: S.card }, [
          h('h2', { key: 't', style: S.h2 }, generating ? 'AI 正在生成计划' : '还没有计划'),
          h('div', { key: 'a', style: S.meta }, generating
            ? '在画像页触发的生成还在跑 —— 完成后这一页会自动出现计划，不用守着对话。'
            : ready ? '画像四项已经齐了 —— 点下面的按钮生成。' : '完成「画像」里的四项，就能让 AI 写计划了。'),
          h('div', { key: 'act', style: S.inline }, [
            h(AskButton, { key: 'btn', text: '帮我生成成长计划', label: generating ? 'AI 正在生成计划…' : '让 AI 生成计划', style: S.buttonOn,
              done: plan.phases.length > 0,
              hint: generating ? '生成完成后本页会自动更新。' : '它会读你的画像，写出总目标和分阶段任务。' }),
          ]),
          ready ? null : h('div', { key: 'block', style: S.meta },
            '还差：'
            + [state.profile.targetRole.length === 0 ? '选目标岗位' : '', state.catalog.missingBackground.length > 0 ? `补「当前状态」里的追问（${state.catalog.missingBackground.join('、')}）` : '', state.catalog.activeRole === null ? '建这个方向的能力模型' : '']
              .filter(Boolean).join('、')
            + ''),
        ]);
      }

      const kids = [];

      kids.push(h('div', { key: 'goal', style: S.card }, [
        // 当前段位摆在总目标的右边：那是「你现在手里是什么牌子」，一眼看得到该往哪换。
        // 层标那条珊瑚短线跟着「总目标」走 —— 所以 subhead 类挂在内层的 span 上，不挂在这一行。
        h('div', { key: 'kicker', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px' } }, [
          h('span', { key: 't', className: 'gw-subhead', style: S.subhead }, '总目标'),
          h(RankBadge, { key: 'rank', rank: currentRank(state, plan.phases.length), achieved: true, size: 30 }),
        ]),
        // 总目标是 Agent 写的一整句。保持它完整、让它当这张卡上唯一的大字块 —— 周围那些
        // 结构（阶段、能力组、作品集）各自从自己的字段渲染，不去拆这句话。
        h('div', { key: 'quote', style: { fontFamily: 'var(--gw-display, Calistoga, Georgia, serif)', fontSize: '23px', lineHeight: '1.65', letterSpacing: '-.012em' } }, plan.goal || '（未写总目标）'),
        h('div', { key: 'meta', style: S.wrap }, [
          h('span', { key: 'role', style: S.chipPlain }, `方向 ${plan.role}`),
          h('span', { key: 'route', style: S.chipPlain }, `路线 ${plan.route}`),
          state.profile.timePerDay ? h('span', { key: 'time', style: S.chipPlain }, `每天 ${state.profile.timePerDay}`) : null,
          state.profile.deadline ? h('span', { key: 'due', style: S.chipPlain }, `截止 ${state.profile.deadline}`) : null,
        ]),
        h('div', { key: 'path-head', style: { ...S.subhead, marginTop: '8px' } }, '路径 · 四个阶段'),
        h(PathBand, { key: 'path', phases: plan.phases, currentIndex: state.metrics.phaseIndex }),
        // 目标里说要补齐的东西，量的就是这份模型；没有模型时这一段不出现，而不是显示空壳。
        state.catalog.activeRole === null || state.catalog.activeRole === undefined ? null
          : h('div', { key: 'groups-head', style: { ...S.subhead, marginTop: '8px' } }, '要补的四块能力 · 权重高的先补'),
        state.catalog.activeRole === null || state.catalog.activeRole === undefined ? null
          : h(GroupRows, { key: 'groups', role: state.catalog.activeRole, scores: state.profile.selfAssessment?.scores ?? {} }),
        h('div', { key: 'start', style: S.inline }, [
          h('span', { key: 'label', style: { fontSize: '13px' } }, '第 1 天'),
          h('input', {
            key: 'date',
            style: { ...S.input, maxWidth: '150px' },
            type: 'date',
            value: startDraft,
            onChange: (event) => setStartDraft(event.target.value),
          }),
          h('button', {
            key: 'save',
            // 没改动时它不是一个按钮，只是一个读数：把这层意思做进样式里，
            // 而不是留一个点下去毫无反应的按钮让人反复试。
            style: { ...S.button, ...(startChanged ? S.buttonLight : { color: 'var(--gw-muted, #718096)', background: 'transparent', borderColor: 'transparent', cursor: 'default' }) },
            type: 'button',
            disabled: !startChanged || saving,
            onClick: () => { void saveStart(); },
          }, saving ? '保存中…' : startChanged ? '保存' : '已保存'),
          h('span', { key: 'note', style: S.meta }, '计划的第 1 天，决定「第几天」与周次。'),
        ]),
      ]));

      // 计划页原先只回答「我打算做什么」。执行趋势补上另一半：我实际做得怎样。
      // 放在总目标之后、阶段之前 —— 阶段列表很长，图排在它后面会被埋掉。
      const weekRates = state.metrics.weekRates ?? [];
      if (weekRates.length > 0) {
        kids.push(h('div', { key: 'exec-trend', style: S.card }, [
          h('h3', { key: 't', style: S.h3 }, '执行趋势'),
          h('div', { key: 'sub', style: S.meta }, weekRates.length > 0 && state.metrics.day !== null
            ? `每周完成率，到第 ${String(Math.floor((state.metrics.day - 1) / 7) + 1)} 周为止。`
            : '每周完成率，到本周为止。'),
          h(WeekTrendChart, { key: 'chart', rates: weekRates }),
          h('div', { key: 'note', style: S.fine }, '完成率 = 那一周排到天的任务里完成了多少；那一周没排到天的任务时不画柱子。'),
          // 证据档位原先是「今日」读数条上的一行 —— 它其实不是每天要看的数（今天只关心今天那
          // 一件），而是"这一段做得实不实"的一次反馈，所以挪来这里与完成率作伴（用户：
          // 「这个看看放哪里合适」）。读法跟着数字一起留在这儿。
          h('div', { key: 'evidence', style: S.fine },
            `证据档位：成果 ${String(state.metrics.evidence.成果)} · 过程 ${String(state.metrics.evidence.过程)} · 自述 ${String(state.metrics.evidence.自述)} · 无 ${String(state.metrics.evidence.无证据)}　（过程与成果都算数，自述只作辅证）`),
        ]));
      }

      plan.phases.forEach((phase, index) => {
        const body = [
          h('div', { key: 'head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap' } }, [
            // 段位章摆在这一步的最前面：一眼看到「做完这个阶段能拿到什么」。
            // 达成看的是「这个阶段有没有走完」—— 当前这段还没走完，所以它是空心的。
            h('div', { key: 'left', style: { display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 auto', minWidth: '0' } }, [
              // 段位牌子一律按它对应的段位渲染出颜色（「这一段该拿什么牌」），
              // 不走「达成才填色」——「当前段位」只由总目标右上那一枚承担，
              // 「这一段走到哪了」由旁边那枚印章（已走完/进行中/未开始）承担。
              h(RankBadge, { key: 'rank', rank: rankOf(index, plan.phases.length), achieved: true, size: 32 }),
              h('h3', { key: 'title', style: { ...S.h3, flex: '1 1 auto', minWidth: '0' } }, `阶段${String(index + 1)} ${phase.name}（第 ${String(phase.days[0])}-${String(phase.days[1])} 天）`),
            ]),
            // 阶段状态不另存：phaseIndex 就是当前阶段，比它小的都已经走完。
            // 计划还没开始时 phaseIndex 是 -1，那时每一段都是「未开始」。
            index === state.metrics.phaseIndex
              ? h(Seal, { key: 'st', label: '进行中', stamp: true })
              : (state.metrics.phaseIndex >= 0 && index < state.metrics.phaseIndex
                ? h(Seal, { key: 'st', tone: 'teal', label: '已走完' })
                : h(Seal, { key: 'st', tone: 'slate', label: '未开始' })),
          ]),
          h('div', { key: 'goal', style: S.meta }, `阶段目标：${phase.goal}`),
          h('div', { key: 'project', style: S.meta }, `实战项目：${phase.project || '—'}`),
          h('div', { key: 'criteria', style: S.meta }, `考核标准：${phase.criteria || '—'}`),
        ];
        if (phase.tasks.length === 0) {
          const weeks = (phase.weeks ?? []).map((week) => `第${String(week.week ?? '?')}周：${week.theme ?? ''}`).join('；');
          body.push(h('div', { key: 'weeks', style: S.empty }, `只排到周，尚未细化到天。${weeks}`));
        } else {
          // 十个字列排下来每列只剩一百来像素，而「一句话动作 / 完成标准 / 可接受证据」装的是整句话。
          // 改成每个任务四行：动作在前，元数据与两条标准各一行小字 —— 横向滚的表格读不了句子。
          const oneTask = (task) => h('div', { key: task.id, className: 'gw-plan-task', style: { ...S.row, flexDirection: 'column', alignItems: 'stretch', gap: '4px' } }, [
            h('div', { key: 'head', style: { display: 'flex', gap: '9px', alignItems: 'baseline' } }, [
              // 标识这枚小签顺便把"做完了没有"说掉：计划页原先对完成状态**一个字都没有**，
              // 于是"哪些已经做了"只能回今日页一条条对。已完成就换成青色 + 一个勾 ——
              // 它是状态，不是入口：打卡只在今日页（入口唯一）。
              h('span', {
                key: 'id',
                title: state.progress.tasks?.[task.id]?.done === true ? '已完成' : '还没做',
                style: {
                  ...S.chip, flex: '0 0 auto',
                  ...(state.progress.tasks?.[task.id]?.done === true
                    ? { color: 'var(--gw-teal, #2f7d74)', background: 'var(--gw-teal-soft, rgba(47,125,116,.12))', borderColor: 'rgba(47,125,116,.3)' }
                    : {}),
                },
              }, state.progress.tasks?.[task.id]?.done === true ? `${task.id} ✓` : task.id),
              h('span', { key: 'action', style: { fontSize: '14px', fontWeight: '600', opacity: state.progress.tasks?.[task.id]?.done === true ? '.62' : '1' } }, task.action),
            ]),
            h('div', { key: 'meta', style: S.fine }, [
              task.ref ? `引用 ${task.ref}` : '',
              Number.isInteger(task.day) ? `第 ${String(task.day)} 天` : '',
              `能力项 ${task.capability}`,
              `预计 ${String(task.minutes)} 分钟`,
              `最低版本：${task.minimumVersion}`,
              task.dependsOn && task.dependsOn !== '无' ? `依赖 ${task.dependsOn}` : '',
            ].filter(Boolean).join('　·　')),
            h('div', { key: 'criteria', style: S.fine }, `完成标准：${task.doneCriteria}`),
            h('div', { key: 'evidence', style: S.fine }, `可接受证据：${task.acceptableEvidence}`),
          ]);

          const isDone = (task) => state.progress.tasks?.[task.id]?.done === true;
          const open = phase.tasks.filter((task) => !isDone(task));
          const finished = phase.tasks.filter(isDone);
          // **没做完的在前，做完的折到后面**（用户：「已完成的放该阶段模块的后面折叠起来，
          // 其他未完成的像现在这样放前面」）。理由和考核页那边一样：这一段还剩什么是这一屏的重点，
          // 做完的那些只需要"还查得到"，不需要一直占着版面。
          body.push(h('div', { key: 'tasks', style: { display: 'flex', flexDirection: 'column' } }, open.map(oneTask)));
          if (finished.length > 0) {
            body.push(h('details', { key: 'done-tasks', style: { borderTop: '1px solid var(--gw-line-soft, #efeae2)', marginTop: '4px' } }, [
              h('summary', { key: 's', style: { ...S.fine, cursor: 'pointer', padding: '8px 0' } },
                `已完成 ${String(finished.length)} 项${open.length > 0 ? '（折起来，点开看）' : ''}`),
              h('div', { key: 'body', style: { display: 'flex', flexDirection: 'column', paddingBottom: '6px' } }, finished.map(oneTask)),
            ]));
          }
        }
        kids.push(h('div', { key: `phase-${String(index)}`, style: S.card }, body));
      });

      if (plan.selfCheck.length > 0) {
        kids.push(h('div', { key: 'selfcheck', style: S.card }, [
          // 「只有题目」也是画外音，而且下一行已经说了「答案由你给」—— 同一件事说两遍。
          h('h3', { key: 't', style: S.h3 }, `考核自查（${String(plan.selfCheck.length)} 题）`),
          h('div', { key: 'note', style: S.meta }, '考核时抽 2-3 题现场作答，答案由你给。'),
          // 16 行平铺是一面墙。折叠之后扫一遍标题就知道会被问什么，展开才看到它属于哪个阶段、
          // 考哪一项能力 —— 这两样正是「为什么问这一题」的答案。
          ...plan.selfCheck.map((item) => h('details', { key: item.id, style: { borderTop: '1px solid var(--gw-line-soft, #efeae2)', padding: '11px 0' } }, [
            h('summary', { key: 's', style: { cursor: 'pointer', fontSize: '13.5px', display: 'flex', gap: '10px', alignItems: 'baseline' } }, [
              h('span', { key: 'id', style: { ...S.chipPlain, flex: '0 0 auto' } }, item.id),
              h('span', { key: 'q' }, item.question),
            ]),
            h('div', { key: 'a', style: { ...S.fine, margin: '9px 0 0 34px' } },
              `能力项 ${item.capability}　·　阶段「${item.phase}」`),
          ])),
        ]));
      }

      if (plan.portfolio.length > 0) {
        kids.push(h('div', { key: 'portfolio', style: S.card }, [
          h('h3', { key: 't', style: S.h3 }, '作品集清单'),
          h('div', { key: 'note', style: S.meta }, `${String(plan.portfolio.length)} 项，每项都有最低版本 —— 做不完完整版时先交最低版本。`),
          // 这里原先读的是 item.phase / item.item —— 两个字段在数据里根本不存在，
          // 于是四项全都渲染成「（这一项缺说明）」。真实字段是 name / description /
          // minimumVersion / capability。
          h('div', { key: 'grid', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' } },
            plan.portfolio.map((item, index) => h('div', { key: `p${String(index)}`, style: { border: '1px solid var(--gw-line-soft, #efeae2)', borderRadius: '14px', padding: '15px 16px', background: '#fff' } }, [
              h('div', { key: 'n', style: { fontSize: '13.5px', fontWeight: '600' } }, item.name ?? '（这一项缺名称）'),
              item.description ? h('div', { key: 'd', style: { ...S.fine, marginTop: '6px' } }, item.description) : null,
              item.minimumVersion ? h('div', { key: 'm', style: { ...S.fine, marginTop: '8px', color: 'var(--gw-teal, #2f7d74)' } }, `最低版本　${item.minimumVersion}`) : null,
              item.capability ? h('div', { key: 'c', style: { ...S.fine, marginTop: '6px' } }, `能力项 ${item.capability}`) : null,
            ]))),
        ]));
      }

      return h('div', { style: S.stack }, kids);
    }

    // ---------------------------------------------------------------- 考核

    /**
     * 四维趋势图。手写 SVG —— 本仓库不依赖任何库（含图表库），而它需要的很少：
     * 一条网格、四条折线、每轮几个点。
     *
     * x 用轮次序号，不用日期：同一天可以有两轮，按日期画会叠在一起。日期标在轴下。
     * 只画考核轮：自评轮的读数是「缺口」，与这里的「得分」量纲不同，混在一张图里
     * 会让人以为它们可比。
     */
    const TREND_SERIES = [
      { key: '完成率', color: '#e56b55' },
      { key: '证据质量', color: '#2f7d74' },
      { key: '作品达标度', color: '#d59b3f' },
      { key: '知识考核', color: '#718096' },
    ];

    function TrendChart({ rounds }) {
      if (rounds.length === 0) return null;
      const W = 640
      const H = 220
      const LEFT = 34
      const RIGHT = 14
      const TOP = 14
      const BOTTOM = 36
      const plotW = W - LEFT - RIGHT
      const plotH = H - TOP - BOTTOM
      const x = (index) => (rounds.length === 1 ? LEFT + plotW / 2 : LEFT + (plotW * index) / (rounds.length - 1))
      const y = (score) => TOP + plotH * (1 - score / 25)
      const kids = []

      for (const tick of [0, 5, 10, 15, 20, 25]) {
        kids.push(h('line', {
          key: `grid-${String(tick)}`,
          x1: LEFT, x2: W - RIGHT, y1: y(tick), y2: y(tick),
          stroke: tick === 0 ? 'var(--gw-line, #d9d0c4)' : 'var(--gw-line-soft, #eee9e1)',
          strokeWidth: 1,
        }))
        kids.push(h('text', {
          key: `tick-${String(tick)}`,
          x: LEFT - 8, y: y(tick) + 4, textAnchor: 'end',
          style: { fontSize: '11px', fill: 'var(--gw-muted, #718096)' },
        }, [String(tick)]))
      }

      // 折线先画，点后画 —— 否则线会盖住点。
      for (const series of TREND_SERIES) {
        const points = rounds
          .map((entry, index) => ({ index, score: Number(entry.scores?.[series.key]) }))
          .filter((point) => Number.isFinite(point.score))
        if (points.length > 1) {
          kids.push(h('polyline', {
            key: `line-${series.key}`,
            fill: 'none', stroke: series.color, strokeWidth: 2,
            strokeLinejoin: 'round', strokeLinecap: 'round',
            points: points.map((point) => `${String(x(point.index))},${String(y(point.score))}`).join(' '),
          }))
        }
        for (const point of points) {
          kids.push(h('circle', {
            key: `dot-${series.key}-${String(point.index)}`,
            cx: x(point.index), cy: y(point.score), r: 3.5,
            fill: '#fffdf9', stroke: series.color, strokeWidth: 2,
          }, [
            h('title', { key: 'tip' }, [`${series.key}　${rounds[point.index].date}：${String(point.score)} 分`]),
          ]))
        }
      }

      // 日期：轮次多了就隔几个标一个，最后两轮一定标 —— 最近的两个点最该看得清。
      const stride = Math.max(1, Math.ceil(rounds.length / 7))
      rounds.forEach((entry, index) => {
        if (index % stride !== 0 && index < rounds.length - 2) return
        kids.push(h('text', {
          key: `date-${String(index)}`,
          x: x(index), y: H - BOTTOM + 18, textAnchor: 'middle',
          style: { fontSize: '11px', fill: 'var(--gw-muted, #718096)' },
        }, [entry.date.slice(5)]))
      })
      kids.push(h('text', {
        key: 'axis-y', x: LEFT - 8, y: TOP - 4, textAnchor: 'end',
        style: { fontSize: '11px', fill: 'var(--gw-muted, #718096)' },
      }, ['得分']))

      const legend = TREND_SERIES.map((series) => {
        const latest = rounds
          .map((entry) => Number(entry.scores?.[series.key]))
          .filter((value) => Number.isFinite(value))
          .pop()
        return h('span', {
          key: series.key,
          style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--gw-muted, #718096)' },
        }, [
          h('span', { key: 'swatch', style: { width: '10px', height: '10px', borderRadius: '3px', background: series.color, flex: '0 0 auto' } }),
          h('span', { key: 'name' }, [latest === undefined ? series.key : `${series.key} ${String(latest)}`]),
        ])
      })

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, [
        h('div', { key: 'plot', style: { overflowX: 'auto' } }, [
          h('svg', {
            viewBox: `0 0 ${String(W)} ${String(H)}`,
            width: '100%',
            role: 'img',
            'aria-label': `四维趋势：最近 ${String(rounds.length)} 轮考核的四项得分（各 0-25）`,
            style: { display: 'block', minWidth: '460px', height: 'auto' },
          }, kids),
        ]),
        h('div', { key: 'legend', style: { display: 'flex', gap: '14px', flexWrap: 'wrap' } }, legend),
        rounds.length > 1 ? null : h('div', { key: 'one', style: S.fine }, '再有一次考核，这些点才连得成线。'),
      ])
    }

    /**
     * 一道题配一个能力项。缺口榜（priorities）里带分、带缺口、带权重；不在榜上的项只有自评分 ——
     * 那就不编缺口出来，编一个就是假数据。
     */
    function examItem(state, id) {
      const known = (state.metrics.priorities ?? []).find((entry) => entry.id === id);
      if (known !== undefined) return known;
      const role = state.catalog.activeRole;
      const item = role === null || role === undefined ? undefined : role.items.find((entry) => entry.id === id);
      const score = (state.profile.selfAssessment?.scores ?? {})[id];
      return {
        id,
        name: item === undefined ? '' : item.name,
        score: score === undefined ? 0 : score,
        shortfall: null,
        weight: null,
      };
    }

    /**
     * 考卷的题目池。两档出题只差排序依据：
     *  - **节点小考**：按加权缺口 —— 差得多的先考；
     *  - **阶段大考**：按**高权重项** —— 阶段大考评的本来就是完整的高权重项集。
     * 两档都要**跳过没有对应题的项**：16 道自查题覆盖 A1/A2/A3/A5、B1–B4、C1–C4、D1–D4，
     * 而 A4、B5、B6 没有题。不跳过的话考卷会静默地少出一道。
     * 池子末尾接上其余自查题（按原顺序），所以「换一张」能一直换下去。
     */
    function examPool(state, tier) {
      const questions = state.plan.selfCheck ?? [];
      const pool = [];
      const take = (id) => {
        const question = questions.find((entry) => entry.capability === id);
        if (question === undefined) return;
        if (pool.some((entry) => entry.question.id === question.id)) return;
        pool.push({ item: examItem(state, id), question });
      };
      if (tier === 'phase') for (const id of state.catalog.highWeightIds ?? []) take(id);
      else for (const entry of state.metrics.priorities ?? []) take(entry.id);
      for (const question of questions) take(question.capability);
      return pool;
    }

    /** 一张考卷几道题。用户答得完，AI 也核得过来。 */
    const PAPER_SIZE = 3;

    /**
     * 周次数字。
     *
     * 计划里的 `weeks[].week` **可能是数字，也可能是「第3周（15-21天）」这种标签** —— 真实计划两种
     * 都出现过。不认标签的话 `(week - 1) * 7 + 1` 会算出 NaN，于是每一周都被判成「待完成」——
     * 一个不会报错、只会让目录整体说错话的坑（它一直在这儿，只是目录加上按钮之后才显眼）。
     */
    function weekNumberOf(week, fallback) {
      if (Number.isInteger(week?.week)) return week.week;
      const matched = /第\s*(\d+)\s*周/.exec(String(week?.week ?? ''));
      return matched === null ? fallback : Number(matched[1]);
    }

    /**
     * 该考的卷子有哪些 —— **目录、页头读数、考卷弹窗共用这一份计算**（一处算，三处显示，
     * 不会各说一套话）。
     *
     * 每一条：`{ key, tier, scope, phaseIndex, state }`
     *   · `done`     已考（带 `takenAt`）
     *   · `open`     待完成（现在就能考）
     *   · `missed`   待补考（那一段已经过去，却没留下记录）
     *   · `upcoming` 阶段还没走完 —— 大考要等阶段交割，现在开考只会考出一个假的低分
     *   · `locked`   还没走到（未解锁）
     *
     * `key` 同时是草稿的键（`assessments.drafts[key]`）：换个说法，**一张卷子一个键，卷面稳定**，
     * 所以「下次打开接着答」才有意义。
     */
    function examSlots(state) {
      const phases = state.plan.phases;
      const rounds = (state.history ?? []).filter((entry) => entry.kind === 'review');
      const currentIndex = state.metrics.phaseIndex;
      const day = state.metrics.day;
      const slots = [];
      phases.forEach((phase, index) => {
        const locked = currentIndex < 0 || index > currentIndex;
        const finished = typeof day === 'number' && day > phase.days[1];
        const bigRound = rounds.filter((entry) => entry.coverage === '全量' && entry.day >= phase.days[0] && entry.day <= phase.days[1]).at(-1);
        slots.push({
          key: `阶段-${String(index + 1)}`,
          tier: 'phase',
          scope: `阶段${String(index + 1)}「${phase.name}」（第 ${String(phase.days[0])}–${String(phase.days[1])} 天）`,
          phaseIndex: index,
          state: bigRound !== undefined ? 'done' : (finished ? 'open' : (locked ? 'locked' : 'upcoming')),
          takenAt: bigRound?.date ?? '',
        });
        // **只排到天的阶段没有 `weeks`** —— 但节点不是"写了周主题的阶段才有"：阶段里每 7 天一个。
        // 少了这一步，正在走的那一段（通常正是排到天的第一段）在目录上一条节点都看不到 ——
        // 用户就是这么发现的：「阶段1 … 1–14 天，目录没有看到第二周」。
        const weeks = (phase.weeks ?? []).length > 0
          ? phase.weeks
          : Array.from(
            { length: Math.max(1, Math.ceil((phase.days[1] - phase.days[0] + 1) / 7)) },
            (_, offset) => ({ week: Math.floor((phase.days[0] - 1) / 7) + 1 + offset, theme: '' }),
          );
        weeks.forEach((week, weekIndex) => {
          const number = weekNumberOf(week, weekIndex + 1);
          const weekStart = (number - 1) * 7 + 1;
          const weekEnd = weekStart + 6;
          const taken = rounds.find((entry) => entry.day >= weekStart && entry.day <= weekEnd);
          slots.push({
            key: `节点-${String(number)}`,
            tier: 'node',
            scope: `节点 第 ${String(number)} 周`,
            phaseIndex: index,
            week: number,
            theme: week.theme ?? '',
            state: taken !== undefined ? 'done' : (locked ? 'locked' : (day !== null && day > weekEnd ? 'missed' : 'open')),
            takenAt: taken?.date ?? '',
          });
        });
      });
      return slots;
    }

    /**
     * 考卷（弹窗）：从「考核目录」上点「打开考卷」才出来；答完交卷，交给对话里的 AI 打分。
     *
     * 与上一版的三点不同，都是"这份卷子要能停能续"逼出来的：
     *   · **答案存得住**：失焦存一题、每 15 秒补存一次、关掉也先存 —— 草稿落在宿主侧
     *     （`assessments.drafts[key]`），刷新、切页签、第二天再打开都还在。
     *   · **卷面固定**：原先那个「换一张考卷」会顺次换一批题；"接着答"要求卷面稳定，两者不能
     *     共存（换了题，旧答案就对不上了），所以撤掉。
     *   · **交卷后清草稿**：答案已经作为一整轮交出去，留着只会在目录上多出一个假的"继续作答"。
     */
    function PaperModal({ state, post, slot, onClose }) {
      const key = slot.key;
      const take = examPool(state, slot.tier).slice(0, PAPER_SIZE);
      const [answers, setAnswers] = useState(() => ({ ...(state.drafts?.[key]?.answers ?? {}) }));
      const [dirty, setDirty] = useState({});
      const [savedAt, setSavedAt] = useState(state.drafts?.[key]?.updated ?? '');
      const [phase, setPhase] = useState('idle');
      const pending = useRef({});

      const filled = take.filter((entry) => (answers[entry.question.id] ?? '').trim().length > 0).length;
      const ready = take.length > 0 && filled === take.length;
      const day = state.metrics.day;

      /** 存的是 ISO（UTC），显示要本地时间 —— 否则东八区会看到八小时前的钟点。 */
      const clockOf = (iso) => {
        const at = new Date(iso);
        if (Number.isNaN(at.getTime())) return '';
        return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
      };

      /** 落盘：只发动过的那几题 —— 按题合并，定时器那次与失焦那次不会互相吃掉。 */
      const flush = useCallback(async (patch) => {
        if (Object.keys(patch).length === 0) return;
        for (const id of Object.keys(patch)) delete pending.current[id];
        const reply = await post('/draft', { key, answers: patch });
        if (reply.ok === true) {
          setDirty((current) => {
            const next = { ...current };
            for (const id of Object.keys(patch)) delete next[id];
            return next;
          });
          setSavedAt(new Date().toISOString());
        }
      }, [post, key]);

      const record = (id, text) => {
        setAnswers((current) => ({ ...current, [id]: text }));
        pending.current[id] = text;
        setDirty((current) => ({ ...current, [id]: text }));
      };

      // 15 秒补一次：用户可能一直待在输入框里，那样"失焦即存"就不会发生。
      useEffect(() => {
        const timer = setInterval(() => { void flush({ ...pending.current }); }, 15000);
        return () => clearInterval(timer);
      }, [flush]);

      // 关掉（Esc / 点遮罩 / 关闭按钮）也先把没存的存掉 —— 关掉不等于丢掉。
      const close = useCallback(() => {
        void flush({ ...pending.current });
        onClose();
      }, [flush, onClose]);

      const send = async () => {
        if (!ready || phase === 'sent') return;
        setPhase('sent');
        const lines = take.map((entry, index) => [
          `${String(index + 1)}）能力项 ${entry.item.id}${entry.item.name === '' ? '' : ` ${entry.item.name}`}（自评 ${String(entry.item.score)} 分，缺口 ${String(entry.item.shortfall)}）`,
          `题目：${entry.question.question}`,
          `我的回答：${answers[entry.question.id]}`,
        ].join('\n'));
        try {
          await askAgent(`我的考核作答（${day === null || day === undefined ? '计划还没开始' : `计划第 ${String(day)} 天`}，${state.metrics.phaseName || '未进入阶段'}）—— 本次是${slot.tier === 'phase' ? '阶段大考' : '节点小考'}（${slot.scope}），coverage 请用「${slot.tier === 'phase' ? '全量' : '定向'}」：\n\n${lines.join('\n\n')}\n\n请按 rubric 打四维分，并用 growth_save_assessment 把这一轮写进历史。`);
          // 交出去了：草稿清掉，目录上不要再留一个「继续作答」。
          await post('/draft', { key, clear: true });
        } catch (failure) {
          setPhase('idle');
        }
      };

      return h(Modal, { label: '考核考卷', onClose: close, className: 'gw-paper-modal' }, [
        h('div', { key: 'mast', className: 'gw-masthead', style: { padding: '24px 32px 0' } }, [
          h('div', { key: 't', className: 't' }, slot.tier === 'phase' ? '阶段大考' : '节点小考'),
          h('div', { key: 'right', style: { display: 'flex', alignItems: 'baseline', gap: '16px' } }, [
            // 刊头印的是**计划第 N 天对应的日期**（动态算），不是"今天"：这张卷子属于哪一段，
            // 由进度天决定。真实日期在记录里（考核历史那一栏），两者回答的不是同一个问题。
            h('div', { key: 'd', className: 'd' }, state.planDate || state.today),
          ]),
        ]),
        h('div', { key: 'strap', className: 'gw-strap', style: { margin: '14px 32px 0' } }, [
          h('span', { key: 'scope' }, slot.scope),
          h('span', { key: 'role' }, `方向 ${state.plan.role || '—'}`),
          h('span', { key: 'n' }, `共 ${String(take.length)} 题`),
          // 草稿存在哪儿、什么时候存的 —— 用户要能确认"我写的东西没丢"。
          h('span', { key: 'saved' }, savedAt.length > 0 ? `草稿已保存 · ${clockOf(savedAt)}` : '草稿会自动保存'),
        ]),
        h('div', { key: 'body', style: { flex: '1 1 auto', overflowY: 'auto', minHeight: '0', padding: '18px 32px 6px', display: 'flex', flexDirection: 'column' } },
          take.map((entry, index) => h('div', { key: entry.question.id, className: 'gw-eq' }, [
            h('div', { key: 'head', className: 'head' }, [
              h('span', { key: 'no', className: 'no' }, String(index + 1)),
              h('span', { key: 'text', className: 'text' }, entry.question.question),
              h('span', { key: 'cap', className: 'cap' }, `${entry.item.id}${entry.item.name === '' ? '' : ` ${entry.item.name}`}`),
            ]),
            h('div', { key: 'why', className: 'why' },
              `阶段「${entry.question.phase}」的自查题 · 当前自评 ${String(entry.item.score)} 分`
              + (entry.item.shortfall === null ? '' : ` · 缺口 ${String(entry.item.shortfall)}`)
              + (entry.item.weight === null ? '' : `（权重 ${String(entry.item.weight)}）`)),
            h('textarea', {
              key: 'a',
              placeholder: '在这里作答 —— 用具体判断，不要只写概念',
              value: answers[entry.question.id] ?? '',
              onChange: (event) => record(entry.question.id, event.target.value),
              // 失焦就存这一题：点别处、切页签、直接关掉，答案都不会丢。
              onBlur: () => { void flush({ [entry.question.id]: answers[entry.question.id] ?? '' }); },
            }),
          ]))),
        h('div', { key: 'foot', className: 'foot', style: { padding: '10px 32px 20px', borderTop: '1px solid var(--gw-line-soft, #efeae2)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' } }, [
          h('button', {
            key: 'send',
            type: 'button',
            disabled: !ready || phase === 'sent',
            style: { ...S.button, ...S.buttonOn, ...(ready && phase !== 'sent' ? {} : { opacity: '.45', cursor: 'default' }) },
            onClick: () => { void send(); },
          }, phase === 'sent' ? '已交卷 · 等 AI 打分' : '交卷 · 交给 AI 打分'),
          // **关闭按钮必须有**：撤掉"点遮罩关"之后，如果这里不留一个，这一页就只能靠 Esc 出去了
          // （用户就是这么发现的：「考卷弹窗没有关闭按钮」）。关掉会先把没存的草稿存下来。
          h('button', { key: 'close', type: 'button', style: S.button, onClick: close }, '关闭'),
          h('span', { key: 'note', style: { ...S.meta, flex: '1 1 260px' } }, phase === 'sent'
            ? '已交卷 —— AI 正在你当前的对话里打分，结果会自动写回这一页。'
            : ready
              ? `${String(take.length)} 题都答完了。交卷后 AI 会在「成长工作台」那个对话里打分 —— 你写的每一个字它都看得见。`
              : `还差 ${String(take.length - filled)} 题没答。中途关掉没关系：草稿存着，回来接着答。`),
        ]),
      ]);
    }

    /**
     * 考核目录：阶段 → 节点（阶段里的周），每个节点标出它的考核状态。
     *
     * 这张表回答的是「什么时候该考核」—— 原先只能从主角区那句话里猜。状态全部由已有数据算出来：
     *   · 已考   —— 那一周里有过任一轮考核（轮次带 day，落在周的区间里）
     *   · 待完成 —— 你正走在这一周，还没考
     *   · 待补考 —— 那一周已经过去，却没留下考核记录
     *   · 未解锁 —— 还没走到那一段
     * 阶段自己那一行看的是**全量轮**（阶段大考），节点看的是任意轮（小考）。
     */
    /**
     * 把 Agent 写的那份报告排出行读的层次。
     *
     * 它以「一、二、三、」分节、用 `-` 起条目。原先整段 `<pre>` 摊在页面上 —— 用户的原话是
     * 「这个也是没有重点，一大片」。这里不做 markdown（这个仓库没有依赖），只认它自己的写法：
     * 小节行加粗、`-` 条目成列、行长收在 68 个字符左右（超过这个宽度眼睛要来回找行首）。
     */
    function ReportBody({ text }) {
      const lines = String(text ?? '').split('\n');
      return h('div', { style: { maxWidth: '68ch', display: 'flex', flexDirection: 'column' } },
        lines.map((line, index) => {
          const trimmed = line.trim();
          const key = String(index);
          if (trimmed.length === 0) return h('div', { key, style: { height: '7px' } });
          if (/^[一二三四五六七八九十]+、/.test(trimmed)) {
            return h('div', { key, style: { fontSize: '13.5px', fontWeight: '700', marginTop: '10px', color: 'var(--gw-ink, #1f2933)' } }, trimmed);
          }
          if (trimmed.startsWith('-')) {
            return h('div', { key, style: { display: 'flex', gap: '9px', fontSize: '13px', lineHeight: '1.8', color: 'var(--gw-ink-2, #3d4a54)' } }, [
              h('span', { key: 'b', style: { flex: '0 0 auto', color: 'var(--gw-muted-2, #9aa7b1)' } }, '·'),
              h('span', { key: 't', style: { flex: '1 1 auto', minWidth: '0' } }, trimmed.replace(/^-\s*/, '')),
            ]);
          }
          return h('div', { key, style: { fontSize: '13px', lineHeight: '1.85', color: 'var(--gw-ink-2, #3d4a54)' } }, trimmed);
        }));
    }

    /**
     * 考核目录：阶段 → 节点（阶段里的周），每一行说清「考过没有」，**能考的直接给一个入口**。
     *
     * 这一页的主角就是它（用户：「考核页面是不是直接展示考核目录，不直接展示考卷」）——
     * 考卷是点按钮才打开的弹窗；要考的小考/大考在这里显示成「打开考卷 / 补考 / 继续作答」。
     * 状态全部由 `examSlots` 算出来，不另存。
     */
    function ExamSyllabus({ state, onOpen }) {
      const phases = state.plan.phases;
      if (phases.length === 0) return null;
      const slots = examSlots(state);
      const rounds = (state.history ?? []).filter((entry) => entry.kind === 'review');

      /** 这一行的右端：考过就给日期，能考就给按钮，其余的如实说为什么不能考。 */
      const actionFor = (slot) => {
        if (slot.state === 'done') {
          return h('span', { key: 'st', style: { flex: '0 0 auto', fontSize: '12px', fontWeight: '600', color: 'var(--gw-teal, #2f7d74)', whiteSpace: 'nowrap' } }, `已考 ${slot.takenAt}`);
        }
        if (slot.state === 'locked') {
          return h('span', { key: 'st', style: { flex: '0 0 auto', fontSize: '12px', color: 'var(--gw-muted-2, #9aa7b1)', whiteSpace: 'nowrap' } }, '未解锁');
        }
        if (slot.state === 'upcoming') {
          return h('span', { key: 'st', style: { flex: '0 0 auto', fontSize: '12px', color: 'var(--gw-muted-2, #9aa7b1)', whiteSpace: 'nowrap' } }, '阶段走完再考');
        }
        const drafted = (state.drafts ?? {})[slot.key] !== undefined;
        return h('button', {
          key: 'go',
          type: 'button',
          style: { ...S.button, ...S.buttonOn, flex: '0 0 auto', padding: '6px 12px', minHeight: '34px', fontSize: '12.5px' },
          onClick: () => onOpen(slot),
        }, slot.state === 'missed' ? '补考' : (drafted ? '继续作答' : '打开考卷'));
      };

      const row = (slot, label, theme) => h('div', { key: slot.key, style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0 7px 26px', borderTop: '1px solid var(--gw-line-soft, #efeae2)' } }, [
        h('span', { key: 'k', style: { ...S.chipPlain, flex: '0 0 auto', fontFamily: 'var(--gw-mono, monospace)' } }, label),
        h('span', { key: 'th', style: { flex: '1 1 auto', minWidth: '0', fontSize: '13px', color: slot.state === 'locked' ? 'var(--gw-muted-2, #9aa7b1)' : 'inherit' } }, theme),
        actionFor(slot),
      ]);

      const kids = [
        h('div', { key: 'head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap' } }, [
          h('h3', { key: 't', style: S.h3 }, '考核目录'),
          h('span', { key: 'n', style: S.meta }, `阶段 ${String(phases.length)} 个 · 节点 ${String(slots.filter((slot) => slot.tier === 'node').length)} 个 · 已考 ${String(rounds.length)} 轮`),
          // 这张表和下面那叠记录是什么关系 —— 不写出来，读者只能自己猜。
          h('div', { key: 'note', style: { ...S.meta, flexBasis: '100%' } }, '这张表回答「一共几场、考过哪些、还欠哪几场」；点「打开考卷」当场作答，交卷后 AI 打分，记录落在下面「考核历史」里。'),
        ]),
      ];

      phases.forEach((phase, index) => {
        const phaseSlot = slots.find((slot) => slot.phaseIndex === index && slot.tier === 'phase');
        const weekSlots = slots.filter((slot) => slot.phaseIndex === index && slot.tier === 'node');
        kids.push(h('div', { key: phase.name, style: { marginTop: '14px' } }, [
          h('div', { key: 'p', style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } }, [
            h('span', { key: 'n', style: { fontSize: '14px', fontWeight: '600', color: phaseSlot.state === 'locked' ? 'var(--gw-muted-2, #9aa7b1)' : 'inherit' } }, `阶段${String(index + 1)} ${phase.name}`),
            h('span', { key: 'd', style: { fontFamily: 'var(--gw-mono, monospace)', fontSize: '11.5px', color: 'var(--gw-muted-2, #9aa7b1)' } }, `${String(phase.days[0])}–${String(phase.days[1])} 天`),
            h('span', { key: 'big', style: { marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '10px' } }, [
              h('span', { key: 'l', style: { fontSize: '12px', color: 'var(--gw-muted-2, #9aa7b1)' } }, '大考'),
              actionFor(phaseSlot),
            ]),
          ]),
          weekSlots.length === 0 ? null : h('div', { key: 'weeks' }, weekSlots.map((slot) => row(slot, `第 ${String(slot.week)} 周`, slot.theme))),
        ]));
      });
      return h('div', { style: S.card }, kids);
    }

    /**
     * 一轮考核考的是哪一段：小考按周、大考按阶段 —— **与目录同一套说法**。
     *
     * 原先历史里写的是「第 7 天」，而目录里说的是「第 1 周」：同一件事两种叫法，读者要自己换算
     * （用户的疑问就是「第 7 天 这个不是第一周？」）。
     */
    function roundScope(entry, plan) {
      if (entry.coverage === '全量') {
        const phase = (plan.phases ?? []).find((item) => entry.day >= item.days[0] && entry.day <= item.days[1]);
        return phase === undefined ? '阶段大考' : `阶段${String((plan.phases ?? []).indexOf(phase) + 1)}「${phase.name}」`;
      }
      return `节点 第 ${String(Math.floor((entry.day - 1) / 7) + 1)} 周`;
    }

    /** The review tab: 目录 → 考卷（弹窗）→ 历史与趋势。The page never scores. */
    function ReviewTabBody({ state, post }) {
      const [openSlot, setOpenSlot] = useState(null);
      const history = state.history;
      const reviews = history.filter((entry) => entry.kind === 'review');
      const curve = state.curve;
      const slots = examSlots(state);
      // 「要答的」= 现在能考的和欠着的。顶部只回答这一件事（用户：「顶部 完成今天的最小动作
      // 这些不在考核这里显示，可以改成 有多少个考卷要答，或者暂无需要考的」）。
      const owed = slots.filter((slot) => slot.state === 'open' || slot.state === 'missed');
      const notYet = slots.filter((slot) => slot.state === 'locked' || slot.state === 'upcoming').length;


      const entryCard = (entry, key) => {
        const head = [
          // 「考的是哪一段」用目录那套说法（节点 第 N 周 / 阶段N），日期另说 —— 原先写「第 7 天」，
          // 与目录里的「第 1 周」是同一件事的两种叫法，读者得自己换算。
          h('span', { key: 'date', style: { fontFamily: 'var(--gw-mono, monospace)', fontSize: '12.5px', color: 'var(--gw-muted-2, #9aa7b1)' } }, entry.date),
          h('span', { key: 'scope', style: { ...S.chip, marginLeft: '8px' } }, roundScope(entry, state.plan)),
          h('span', { key: 'cov', style: { ...S.fine, marginLeft: '8px' } }, entry.coverage === '全量' ? '全量' : '定向'),
        ];
        // 自评轮**不进这张表**：它没有四维分、量纲也不同（它回答的是"你自己觉得差多少"），
        // 列在这里只会让人问"这行有啥意义"（用户的原话）。自评的读数在「画像 → 能力自评」那一步
        // 是活的（gap 与补强优先级）—— 这一页的历史 = **考核轮**（`reviews`，下面 map 的就是它）。
        head.push(h('span', { key: 'scores', style: { marginLeft: '8px' } },
          Object.entries(entry.scores ?? {}).map(([dimension, value]) => `${dimension} ${String(value)}`).join(' / ')));
        if (entry.total !== undefined && entry.total !== null) {
          head.push(h('span', { key: 'total', style: { marginLeft: '8px', fontWeight: '600' } }, `总分 ${String(entry.total)}（${entry.grade}）`));
        }
        // 等级章只给打过分的轮次（自评轮没有等级，硬盖一个就成了装饰）。颜色按等级分：
        // 优/良 青绿、及格 琥珀、需努力 用印章默认的珊瑚。
        const tone = entry.grade === '优' || entry.grade === '良' ? 'teal' : (entry.grade === '及格' ? 'amber' : undefined);
        const seal = entry.total === undefined || entry.total === null
          ? null
          : h(Seal, { key: 'grade', tone, round: true, label: entry.grade, sub: `${String(entry.total)} 分` });
        const lines = [h('div', { key: 'head', style: { fontSize: '14px' } }, head)];
        if ((entry.unsubmitted ?? []).length > 0) {
          lines.push(h('div', { key: 'unsub', style: S.meta }, `未提交（按 0 计）：${entry.unsubmitted.join('、')}　补上对应数据可重评这几维`));
        }
        if (entry.gradeAction) lines.push(h('div', { key: 'action', style: S.meta }, `定级动作：${entry.gradeAction}`));
        if (entry.attribution) lines.push(h('div', { key: 'attr', style: S.meta }, `归因：${entry.attribution}（只有「计划问题」允许改任务定义）`));
        // 报告按行分节排（见 `ReportBody`）—— 原先整段 `<pre>` 摊着，用户的原话是
        // 「这个也是没有重点，一大片」。
        if (entry.report) lines.push(h('div', { key: 'report', style: { marginTop: '10px' } }, [h(ReportBody, { key: 'b', text: entry.report })]));
        if ((entry.adjustments ?? []).length > 0) {
          lines.push(h('div', { key: 'adj', style: { fontSize: '13px' } }, [
            h('div', { key: 'label', style: S.meta }, '接下来 7 天的调整版任务：'),
            ...entry.adjustments.map((item, index) => h('div', { key: `a${String(index)}`, style: { padding: '2px 0' } },
              `${item['任务标识'] ?? item.id ?? '—'}　${item['一句话动作'] ?? item.action ?? ''}　→ ${item['改了什么'] ?? item.why ?? ''}`)),
          ]));
        }
        // 一轮 = 一行（日期 · 考的是哪一段 · 四维 · 总分），**点开才摊出细节** —— 原先每轮都把
        // 四维、归因、整篇报告和调整项全铺在页面上，一屏读不完也找不到重点。
        return h('details', { key, style: { borderTop: '1px solid var(--gw-line-soft, #efeae2)' } }, [
          h('summary', { key: 's', style: { cursor: 'pointer', padding: '10px 0', display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap', fontSize: '13.5px' } }, head),
          h('div', { key: 'body', style: { padding: '2px 0 16px', display: 'flex', gap: '18px', alignItems: 'flex-start' } }, [
            h('div', { key: 'lines', style: { flex: '1 1 auto', minWidth: '0' } }, lines.slice(1)),
            seal,
          ]),
        ]);
      };

      return h('div', { style: S.stack }, [
        // 顶部只回答一件事：**现在有几张卷子要答**（或暂无）。
        h('div', { key: 'owed', style: S.card }, [
          h('h3', { key: 't', style: S.h3 }, owed.length > 0 ? `有 ${String(owed.length)} 张卷子要答` : '暂无需要考的'),
          h('div', { key: 'list', style: { ...S.meta, marginTop: '6px' } }, owed.length > 0
            ? owed.map((slot) => slot.scope).join('　·　')
            : (notYet > 0 ? '后面还有没解锁的场次 —— 下面「考核目录」里看得到全部。' : '全部考完了。')),
          owed.length === 0 ? null : h('div', { key: 'act', style: { ...S.inline, marginTop: '13px' } },
            owed.slice(0, 2).map((slot) => h('button', {
              key: slot.key,
              type: 'button',
              style: { ...S.button, ...S.buttonOn },
              onClick: () => setOpenSlot(slot),
            }, slot.tier === 'phase' ? '打开大考' : `打开小考 · 第 ${String(slot.week)} 周`))),
        ]),
        h(ExamSyllabus, { key: 'syllabus', state, onOpen: setOpenSlot }),
        h('div', { key: 'trend', style: S.card }, [
          h('h3', { key: 't', style: S.h3 }, '考核历史与趋势'),
          h('div', { key: 'counts', style: S.meta }, `考核 ${String(reviews.length)} 轮 · 点任意一行看那一轮的细节`),
          h(TrendChart, { key: 'chart', rounds: reviews }),
          reviews.length === 0 ? null : h('div', { key: 'chartNote', style: S.meta }, '四维得分，各 0-25。自评轮读的是缺口，量纲不同，不进这张图。'),
          h('div', { key: 'note', style: S.meta }, `逐项曲线点 ${String(curve.length)} 个：能力项各自的自评读数，和上面那张四维图不是一回事。`),
          // 这一页的历史 = **考核轮**；自评轮不进这张表（见 `entryCard` 上面那条注释）。
          ...(reviews.length === 0
            ? [h('div', { key: 'empty', style: S.empty }, '还没有考核记录 —— 上面目录里点「打开考卷」开始第一场。')]
            : reviews.slice().reverse().map((entry, index) => entryCard(entry, `${entry.date}-${String(index)}`))),
        ]),
        openSlot === null ? null : h(PaperModal, { key: 'paper', state, post, slot: openSlot, onClose: () => setOpenSlot(null) }),
      ]);
    }

    // ---------------------------------------------------------------- 画像

    /** Step ①: direction — the catalog, plus a free-text one. */
    function DirectionForm({ state, post, draft, setDraft, commit, onCollapse }) {
      const { catalog, profile } = state;
      const active = catalog.roles.find((entry) => entry.slug === profile.targetRoleSlug);
      const isCustom = profile.targetRoleSlug === catalog.customSlug;
      // 「正在自己起一个名字」是这一屏的两种状态之一：打字时下面的目录不再高亮，
      // 这样「从目录里选」和「自己填」才是互斥的二选一，而不是两个都像被选中。
      const typing = draft.trim().length > 0;

      const kids = [
        h(OpenModuleHead, { key: 't', label: '目标岗位', onCollapse }),
        h('div', { key: 'pick', style: S.meta }, '从目录里选'),
        h('div', { key: 'choices', style: S.wrap }, catalog.roles.map((entry) => h('button', {
          key: entry.slug,
          type: 'button',
          // 选中的那枚是珊瑚实底，而它的边框也是珊瑚色 —— 边和底同色，看起来就像
          // 「点击之后边框消失了」。给它一条更深的珊瑚边：填充 + 清晰的轮廓，
          // 才读得出是「选中」，而不是「掉了边框」。
          style: { ...S.button, ...(!typing && profile.targetRoleSlug === entry.slug ? { ...S.buttonOn, borderColor: 'var(--gw-coral-deep, #a64132)' } : {}) },
          title: catalog.roleStatus[entry.status]?.note ?? '',
          onClick: () => { setDraft(''); commit(entry.slug, undefined); },
        }, entry.name))),
        h('div', { key: 'or', style: S.meta }, '或者，自己填写一个岗位名'),
        h('div', { key: 'custom', style: S.inline }, [
          h('input', {
            key: 'input',
            style: { ...S.input, maxWidth: '260px' },
            placeholder: '输入岗位名称',
            value: draft,
            'aria-label': '自定义岗位',
            onChange: (event) => setDraft(event.target.value),
          }),
        ]),
      ];

      // 这一行必须说**实际情况**：方向有没有模型、模型是谁给的，catalog.activeRoleSource
      // 一并带过来了。曾经这里给「自己填的方向」硬写 beta 的说明 —— 于是 AI 已经把模型建好、
      // 自评都能逐项打分了，这一屏还在说「还没有能力模型」。
      const pickNote = catalog.roleStatus[catalog.activeRoleSource]?.note ?? '';
      kids.push(h('div', { key: 'note2', style: S.meta }, active === undefined && !isCustom
        ? '还没选方向。'
        : pickNote));
      if (isCustom && profile.positioning.length > 0) {
        kids.push(h('div', { key: 'pos', style: S.meta }, profile.positioning));
      }
      return h('div', { 'data-anchor': 'direction', style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, kids);
    }

    /** Step ②: the growth choices, with route first. */
    function IntakeForm({ state, post, bgDraft, setBgDraft, onCollapse }) {
      const { catalog, profile } = state;
      const intake = profile.intake ?? {};
      const choose = (key, value) => {
        void post('/intake', {
          roleSlug: profile.targetRoleSlug === catalog.customSlug ? undefined : profile.targetRoleSlug,
          roleName: profile.targetRoleSlug === catalog.customSlug ? profile.targetRole : undefined,
          intake: { ...intake, [key]: value },
          route: profile.route || undefined,
        });
      };
      return h('div', { 'data-anchor': 'intake', style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
        h(OpenModuleHead, { key: 't', label: '你的条件', onCollapse }),
        h(RouteForm, { key: 'route-first', state, post }),
        ...catalog.questions.map((question) => h('div', { key: question.key, style: { display: 'flex', flexDirection: 'column', gap: '5px' } }, [
          h('div', { key: 'title', style: { fontSize: '13px', fontWeight: '600' } }, `${question.title}${intake[question.key] === undefined ? '（未答）' : ' ✓'}`),
          h('div', { key: 'options', style: S.wrap }, question.options.map((option) => h('button', {
            key: option.value,
            type: 'button',
            style: { ...S.button, ...(intake[question.key] === option.value ? S.buttonOn : {}) },
            title: option.hint,
            onClick: () => choose(question.key, option.value),
          }, option.label))),
        ])),
        // 追问跟着第一题「你的身份」变，所以它就长在这四题下面：选完身份，问题原地
        // 出现，不必再走一次「确认并继续」的折叠循环。
        h(BackgroundForm, { key: 'follow-ups', state, post, draft: bgDraft, setDraft: setBgDraft }),
      ]);
    }
    /**
     * The follow-ups inside ②: the questions the 你的身份 answer earns.
     *
     * These are the only source the 可迁移底盘 and a generated capability model
     * can be derived from, so the form says what each answer feeds rather than
     * collecting it silently.
     */
    function BackgroundForm({ state, post, draft, setDraft }) {
      const { catalog, profile } = state;
      const questions = catalog.followUps;

      if (questions === null) return null;

      const set = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }));

      // 它现在长在 ② 的卡片里，所以不再自己套一层卡片，也不用模块级标题：
      // 一条分隔线加一个小标签，读起来就是同一张卡里的下一段。
      return h('div', { 'data-anchor': 'background', style: { display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--gw-line-soft, #eee9e1)', marginTop: '2px', paddingTop: '14px' } }, [
        h('div', { key: 't', style: { fontSize: '13px', fontWeight: '600' } }, '当前状态'),
        h('div', { key: 'why', style: S.meta }, questions.why),
        ...questions.fields.map((field) => h('div', { key: field.key, style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, [
          h('div', { key: 'label', style: { fontSize: '13px', fontWeight: '600' } },
            `${field.label}${field.required === true ? '　*必填' : ''}${field.feed === 'skills' ? '' : ''}`),
          field.options === undefined
            ? h('input', {
              key: 'input',
              style: S.input,
              placeholder: field.placeholder ?? '',
              value: draft[field.key] ?? '',
              'aria-label': field.label,
              onChange: (event) => set(field.key, event.target.value),
              // 离开输入框就落盘：切页签会让这个组件卸载，草稿跟着没。只有点 ② 的确认才保存的话，
              // 去别的页签看一眼再回来，打过的字就没了。
              onBlur: () => {
                if ((draft[field.key] ?? '') === ((profile.background ?? {})[field.key] ?? '')) return;
                void post('/background', { background: draft });
              },
            })
            : h('div', { key: 'options', style: S.wrap }, field.options.map((option) => h('button', {
              key: option,
              type: 'button',
              style: { ...S.button, ...(draft[field.key] === option ? S.buttonOn : {}) },
              onClick: () => { set(field.key, option); void post('/background', { background: { ...draft, [field.key]: option } }); },
            }, option))),
        ])),
        h('div', { key: 'note', style: S.fine }, '这些答案用来生成底盘候选和能力模型；「希望提升什么」还会定计划的总目标。离开输入框就会保存。'),
        catalog.missingBackground.length === 0
          ? null
          : h('div', { key: 'missing', style: S.meta }, `还差必填项：${catalog.missingBackground.join('、')}`),
      ]);
    }

    /** Step ③: the route, with its tradeoff spelled out. */
    function RouteForm({ state, post }) {
      const { catalog, profile } = state;
      const active = catalog.routes.find((route) => route.name === profile.route);
      return h('div', { 'data-anchor': 'route', style: { display: 'flex', flexDirection: 'column', gap: '5px' } }, [
        // 与下面四个选择题同构：同一个标题字号字重、同样带（未答）/ ✓ 标记。路线本来
        // 就是这一屏里的第五个选择，之前它自己套了一层卡片、而且没有标题。
        h('div', { key: 'title', style: { fontSize: '13px', fontWeight: '600' } }, '成长路线' + (profile.route ? ' ✓' : '（未答）')),
        h('div', { key: 'choices', style: S.wrap }, catalog.routes.map((route) => h('button', {
          key: route.name,
          type: 'button',
          style: { ...S.button, ...(profile.route === route.name ? S.buttonOn : {}) },
          title: `${route.fit}｜${route.tradeoff}`,
          onClick: () => { void post('/intake', { roleSlug: profile.targetRoleSlug === catalog.customSlug ? undefined : profile.targetRoleSlug, roleName: profile.targetRole, intake: profile.intake ?? {}, route: route.name }); },
        }, route.name))),
        active === undefined ? null : h('div', { key: 'note', style: S.meta }, `${active.fit}｜${active.tradeoff}`),
      ]);
    }

    /**
     * Step ④: the 可迁移底盘 — proposed from the user's own background, confirmed
     * one item at a time.
     *
     * This used to be a fixed table. It is not one any more, because a fixed
     * table is wrong for everyone it was not written for: an 在校生 has no
     * "复现" to confirm, and a 自由职业者 recognises none of it. What ships
     * instead is a proposal derived from ②'s follow-ups, which the user checks
     * off — so every line in `verifiedFacts` is something they said yes to.
     */
    function TransferableForm({ state, post, onCollapse }) {
      const { catalog, profile } = state;
      const confirmed = profile.verifiedFacts ?? [];
      const suggestions = profile.transferableSuggestions ?? [];
      const busy = useAgentBusy();
      const line = (item) => `${item.name}：${item.text}`;

      const confirm = (text) => {
        const next = confirmed.includes(text) ? confirmed.filter((item) => item !== text) : [...confirmed, text];
        void post('/transferable', { facts: next });
      };
      const dismiss = (text) => { void post('/transferable', { dismissed: [text] }); };

      const kids = [
        h(OpenModuleHead, { key: 't', label: '可迁移能力', onCollapse }),
        h('div', { key: 'note', style: S.meta }, '下面是根据你的经历生成的候选。做过哪些就勾上，没做过点「没做过」。'),
      ];

      if (catalog.followUps === null) {
        kids.push(h('div', { key: 'need', style: S.meta }, catalog.transferableNote.needsBackground));
      } else if (catalog.missingBackground.length > 0) {
        kids.push(h('div', { key: 'need', style: S.meta }, `先补完「当前状态」里的：${catalog.missingBackground.join('、')}`));
      } else if (suggestions.length === 0) {
        kids.push(busy
          ? h('div', { key: 'empty', style: { ...S.empty, display: 'flex', alignItems: 'center', gap: '8px' } }, [
            h('span', { key: 'dot', style: { width: '8px', height: '8px', borderRadius: '50%', background: 'var(--gw-coral, #e56b55)' } }),
            '智能生成中…',
          ])
          : h('div', { key: 'empty', style: S.empty }, '还没有候选 —— 确认「你的条件」时会自动生成一份；也可以在对话里说一句「帮我看看我有什么底子」。'));
      } else {
        const onCount = suggestions.filter((item) => confirmed.includes(line(item))).length;
        kids.push(h('div', { key: 'tally', style: S.meta }, `已确认 ${String(onCount)} / ${String(suggestions.length)} 条`));
        kids.push(h('div', { key: 'list' }, suggestions.map((item) => {
          const text = line(item);
          const on = confirmed.includes(text);
          return h('div', { key: item.id, className: 'gw-tf', style: { ...S.row, padding: '10px 6px' } }, [
            h('label', { key: 'label', style: { display: 'flex', gap: '10px', alignItems: 'flex-start', flex: '1 1 auto', cursor: 'pointer', minWidth: '0' } }, [
              // 原生 checkbox 只用 accentColor 跟一次配色：自己画一个既要重做键盘与无障碍，
              // 也会和宿主应用自己的控件风格打架。
              h('input', { key: 'box', type: 'checkbox', checked: on, 'data-tf': text, onChange: () => confirm(text),
                style: { width: '16px', height: '16px', marginTop: '2px', flex: '0 0 auto', cursor: 'pointer', accentColor: 'var(--gw-coral, #e56b55)' } }),
              // 名称在上、解释在下：名称是扫读用的锚点，和解释同样粗细就白写了。
              h('div', { key: 'copy', style: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' } }, [
                h('span', { key: 'name', style: { fontSize: '14px', fontWeight: '600', ...(on ? { color: 'var(--gw-coral-deep, #a64132)' } : {}) } }, item.name),
                h('span', { key: 'body', style: S.fine }, item.text),
              ]),
            ]),
            h('button', {
              key: 'no',
              type: 'button',
              title: '我没做过这个',
              className: 'gw-tf-no',
              style: { ...S.button, ...S.small, flex: '0 0 auto' },
              'data-tf-no': text,
              onClick: () => dismiss(text),
            }, '没做过'),
          ]);
        })));
        // 「重新生成」是反复发生的动作（候选已经在了，没法用「存在与否」判断完成），所以不带 `done`：
        // 点完等它跑，冷却之后再可用。与 ⑤ 的「重新生成模型」对称。
        kids.push(h('div', { key: 'rebuild', style: S.inline }, [
          h(AskButton, { key: 'btn', text: '帮我看看我有什么底子', label: '重新生成候选', style: S.small,
            hint: '不满意就直接说哪一条不对 —— 它会重新读你的追问。' }),
        ]));
      }

      const confirmedOnly = confirmed.filter((text) => !suggestions.some((item) => line(item) === text));
      if (confirmedOnly.length > 0) {
        kids.push(h('div', { key: 'kept' }, [
          h('div', { key: 'label', style: S.meta }, '已确认：'),
          ...confirmedOnly.map((text) => h('div', { key: text, style: S.fine }, `· ${text}`)),
        ]));
      }

      // 这份清单由 Agent 从追问答案推（和底盘同一次提议）。还没推出来时整块不渲染 ——
      // 留一个只有标题、下面空着的区块，读起来像坏了。
      if (catalog.transferableGaps.length > 0) {
        kids.push(
          h('div', { key: 'gapTitle', style: S.meta }, '需要补齐的目标岗位能力：'),
          ...catalog.transferableGaps.map((text, index) => h('div', { key: `gap${String(index)}`, style: S.fine }, `· ${text}`)),
        );
      }
      return h('div', { 'data-anchor': 'transferable', style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, kids);
    }


    /** Step ⑤: the self-assessment — every item with its anchors on screen, one click each. */
    function SelfAssessmentForm({ state, post, scores, setScores, onCollapse }) {
      const { catalog, profile } = state;
      const role = catalog.activeRole;
      const busy = useAgentBusy();
      // 打开时落在「第一个还没答完的组」，而不是永远第一组。
      const [currentGroup, setCurrentGroup] = useState(() => {
        if (role === null || role === undefined) return 0;
        const index = role.groups.findIndex((group) => role.items.some((item) => item.group === group.key && scores[item.id] === undefined));
        return index < 0 ? 0 : index;
      });


      // 没有模型就没有逐项锚点 —— 没有锚点的自评是 20 个互不可比的数，所以这里
      // 不退化成一个通用问卷，而是把"去生成一份"这条路指出来。
      if (role === null || role === undefined) {
        const canBuild = catalog.missingBackground.length === 0 && profile.targetRole.length > 0;
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
        h(OpenModuleHead, { key: 't', label: '能力自评', onCollapse }),
          h('div', { key: 'note', style: S.empty },
            `${profile.targetRole || '当前方向'}还没有能力模型，所以现在还没法逐项打分。`),
          busy
            ? h('div', { key: 'why', style: S.meta }, 'AI 正在生成这个方向的能力模型 —— 完成后这里会自动变成逐项打分，不用回上一步。')
            : h('div', { key: 'why', style: S.fine }, '确认「可迁移能力」时会自动生成一份；生成后这里就能逐项打分，每项带 1/3/5 锚点原文。一直没生成的话，在对话里说一句「帮我建这个方向的能力模型」。'),
          canBuild ? null : h('div', { key: 'block', style: S.meta },
            '先选定方向，并补完「当前状态」里的追问。'),
        ]);
      }

      const source = catalog.activeRoleSource;
      const sourceNote = catalog.roleStatus[source] ?? null;


      const gap = state.metrics.gap;
      // 用函数式更新：连续点几下时，闭包里的 `scores` 是同一份旧值，
      // 普通写法会让最后一次点选覆盖掉前面几次。
      const set = (id, value) => {
        setScores((previous) => {
          const next = { ...previous };
          if (value === null) delete next[id];
          else next[id] = value;
          return next;
        });
      };

      const kids = [
        h(OpenModuleHead, { key: 't', label: '能力自评', onCollapse }),
        h('div', { key: 'source', style: S.fine }, `模型：${role.name} · ${String(role.groups.length)} 组 / ${String(role.items.length)} 项`),
        // 生成的模型与预置模型可信度不同，这个区别必须在打分的地方说明，而不是藏在别处。
        sourceNote === null || source === 'preset' ? null
          : h('div', { key: 'uncal', style: S.warn }, `${sourceNote.note}`),
        h('div', { key: 'note', style: S.meta },
          '带锚点打分：每项先给你 1 / 3 / 5 的原文，再选分数。'
          + '拿不准的项就点它 —— 这一项不进缺口计算，也不会被当成 0 分；随时可以回来补。'),
      ];
      if (source !== 'preset') {
        // 「重新生成」是反复发生的动作（这份模型已经在了，没法用"存在与否"判断完成），
        // 所以不带 `done`：点完等它跑，冷却之后再可用。
        kids.push(h('div', { key: 'rebuild', style: S.inline }, [
          h(AskButton, { key: 'btn', text: '帮我建这个方向的能力模型', label: '重新生成模型', style: S.small,
            hint: '锚点不合适的项，直接在对话里说哪一项、哪里不对。' }),
        ]));
      }

      // 四组做成四个页签：19 项排成一列时「还剩多少」看不见，而页签把进度直接写在标签上。
      const groupItems = (group) => role.items.filter((item) => item.group === group.key);
      const scoredIn = (group) => groupItems(group).filter((item) => scores[item.id] !== undefined).length;
      const current = role.groups[Math.min(currentGroup, role.groups.length - 1)];
      const currentItems = current === undefined ? [] : groupItems(current);

      kids.push(h('div', { key: 'tabs', style: { display: 'flex', gap: '7px', flexWrap: 'wrap' } },
        role.groups.map((group, index) => h('button', {
          key: group.key,
          type: 'button',
          style: { ...S.button, ...S.small, ...(index === currentGroup ? S.buttonOn : {}) },
          onClick: () => setCurrentGroup(index),
        }, `${group.key} ${group.name}`, h('span', { key: 'n', style: { opacity: '.72', marginLeft: '6px' } }, `${String(scoredIn(group))}/${String(groupItems(group).length)}`)))));

      kids.push(h('div', { key: 'groupHead', style: S.meta },
        `本组 ${String(currentItems.length)} 项，已评 ${String(scoredIn(current))} 项　·　组权重 ${String(current.weight)}%`));
      // 一组还剩多少，条比数字快 —— 这是原型里那组进度条落地的那一半（另一半在计划页的总目标卡里）。
      kids.push(h('div', { key: 'groupBar', style: { ...S.bar, maxWidth: '260px', margin: '4px 0 10px' } }, [
        h('i', {
          key: 'fill',
          style: {
            ...S.barFill,
            width: `${String(currentItems.length === 0 ? 0 : Math.round((scoredIn(current) / currentItems.length) * 100))}%`,
            background: scoredIn(current) === currentItems.length && currentItems.length > 0 ? 'var(--gw-teal, #2f7d74)' : 'var(--gw-coral, #e56b55)',
          },
        }),
      ]));

      kids.push(h('div', { key: 'items', style: { display: 'flex', flexDirection: 'column' } },
        currentItems.map((item) => h('div', { key: item.id, style: { ...S.row, flexDirection: 'column', alignItems: 'stretch', gap: '8px' } }, [
          h('div', { key: 'name', style: { fontSize: '14px', fontWeight: '600' } }, `${item.id} ${item.name}`),
          // 先标准、后选项：分数要对着原文选，而不是先选完再回头对标准。
          h('div', { key: 'anchors', style: { display: 'flex', flexDirection: 'column', gap: '3px' } },
            (item.anchors ?? []).map((text, index) => {
              const level = [1, 3, 5][index] ?? index + 1;
              const on = scores[item.id] === level;
              return h('div', { key: `a${String(level)}`, style: { ...S.fine, display: 'flex', gap: '8px', alignItems: 'flex-start', ...(on ? { color: 'var(--gw-coral-deep, #a64132)', fontWeight: '600' } : {}) } }, [
                h('span', { key: 'lv', style: { flex: '0 0 auto', minWidth: '15px', fontWeight: '700' } }, String(level)),
                h('span', { key: 'tx', style: { flex: '1 1 auto' } }, text),
              ]);
            })),
          h('div', { key: 'choose', style: { ...S.inline, gap: '8px' } }, [
            ...[1, 2, 3, 4, 5].map((value) => h('button', {
              key: `v${String(value)}`,
              type: 'button',
              'data-item': item.id,
              'data-value': String(value),
              style: { ...S.button, ...S.small, ...(scores[item.id] === value ? S.buttonOn : {}) },
              onClick: () => {
                set(item.id, value);
                // 刚把这一组答满、又不是最后一组 → 自动切下一组。放在点击里而不是 effect 里，
                // 是为了让「手动切回已答完的组」不会被立刻推走。
                const rest = currentItems.filter((other) => other.id !== item.id && scores[other.id] === undefined);
                if (rest.length === 0 && currentGroup < role.groups.length - 1) setCurrentGroup(currentGroup + 1);
              },
            }, String(value))),
            h('button', {
              key: 'unknown',
              type: 'button',
              'data-item': item.id,
              'data-value': 'unknown',
              title: '1/3/5 之间拿不准，或者对这一项不熟悉 —— 两种情况都算',
              // 不按「未答」高亮：选「拿不准」会删掉那个键，所以「没答过」与「答了拿不准」在数据上
              // 是同一个状态 —— 把未答画成已选，会让 19 项看起来全都答完了。
              style: { ...S.button, ...S.small },
              onClick: () => set(item.id, null),
            }, '拿不准'),
          ]),
        ]))));

      // 提交入口不在这里：④ 的「确认能力自评」负责落盘。这里只留读数 —— 它是上一次已提交
      // 自评的结果，不是这份草稿的。
      if (gap !== null) {
        const label = gapLabel(gap);
        kids.push(h('div', { key: 'gap', style: S.meta }, `${label.cap} ${label.value} ${label.unit}（每项 3 分算达标）`));
      }
      if (state.metrics.priorities.length > 0) {
        kids.push(h('div', { key: 'prio' }, [
          h('div', { key: 'label', style: S.meta }, '补强优先级（差得多、又重要的排前面）：'),
          ...state.metrics.priorities.slice(0, 6).map((item) => h('div', { key: item.id, style: { fontSize: '13px' } },
            `${item.id} ${item.name}：${String(item.score)} 分（缺口 ${String(item.shortfall)}，权重 ${String(item.weight)}）`)),
        ]));
      }
      if (state.metrics.unansweredGroups.length > 0) {
        kids.push(h('div', { key: 'unanswered', style: S.meta },
          `缺口只按已打分的组算：${state.metrics.unansweredGroups.join('、')} 组还没打分。`));
        // 只有真的有过上一轮，比较才是一句可执行的话。
        if ((state.history ?? []).length > 1) {
          kids.push(h('div', { key: 'basis', style: S.meta }, '所以它和上一轮的数字不好直接比 —— 两轮覆盖的组不一样。'));
        }
      }

      return h('div', { 'data-anchor': 'self', style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, kids);
    }

    /** 深链锚点 → 它落在哪一步。route 与 background 都在 ② 里面。 */
    const ANCHOR_STEP = {
      direction: 'direction', intake: 'intake', route: 'intake',
      background: 'intake', transferable: 'transferable', self: 'self',
    }

    function ProfileFlow({ state, post, onNavigate, focusAnchor }) {
      const profile = state.profile;
      // 深链指到哪一步就先展开哪一步 —— 折叠状态下锚点不在 DOM 里，滚动会扑空。
      useEffect(() => {
        if (focusAnchor === null || focusAnchor === undefined) return;
        const step = ANCHOR_STEP[focusAnchor.anchor];
        if (step !== undefined) setOpen(step);
      }, [focusAnchor]);
      // 折叠行左侧那个点：填色 = 这一步已经产出了东西，空心 = 还没有。
      // 口径是「这一步自己的产出有没有」，不是「表单是不是每一项都填满了」。
      const done = {
        direction: (profile.targetRole ?? '').length > 0,
        intake: (profile.route ?? '').length > 0
          && ['q1', 'q2', 'q3', 'q4'].every((key) => (profile.intake ?? {})[key] !== undefined)
          && state.catalog.missingBackground.length === 0
          && Object.values(profile.background ?? {}).some(Boolean),
        transferable: (profile.verifiedFacts ?? []).length > 0,
        self: Object.keys(profile.selfAssessment?.scores ?? {}).length > 0,
      };
      // 进来时展开第一个「还没做完」的必填步骤，其余保持折叠。切页签会让这个组件卸载，
      // 切回来重新初始化 —— 已经填好的卡片不该每次进来又被推开一次。
      // ④ 能力自评不参与：打分是可选的，它不该每次自动弹开。
      const [open, setOpen] = useState(() => {
        if (!done.direction) return 'direction';
        if (!done.intake) return 'intake';
        if (!done.transferable) return 'transferable';
        // 能力模型建好、还没打过分时，自评就是下一步 —— 它不该被跳过（见下面的 planReady）。
        if (!done.self && state.catalog.activeRole !== null) return 'self';
        return '';
      });
      // 自定义岗位名的草稿与提交都放在这里：表单里已经没有自己的提交按钮了，
      // 提交它的是模块的「确认目标岗位，继续 →」，所以草稿必须两个组件共用。
      const [roleDraft, setRoleDraft] = useState(profile.targetRoleSlug === state.catalog.customSlug ? profile.targetRole : '');
      // 追问草稿同样上提：它现在长在 ② 里面，提交它的是 ② 的「确认并继续」——
      // 打完字直接点确认的话，草稿会随折叠被丢掉，而底盘还会拿旧答案去推。
      const [bgDraft, setBgDraft] = useState(() => ({ ...(profile.background ?? {}) }));
      useEffect(() => { setBgDraft({ ...(profile.background ?? {}) }); }, [profile.intake?.q1]);
      // 自评草稿同样上提：提交它的是 ④ 的「确认能力自评」，两个组件必须共用同一份。
      // 同步只在 selfAssessment.date 变化时触发 —— 保存失败不会改日期，所以草稿不会被冲掉。
      const [scoresDraft, setScoresDraft] = useState(() => ({ ...(profile.selfAssessment?.scores ?? {}) }));
      useEffect(() => { setScoresDraft({ ...(profile.selfAssessment?.scores ?? {}) }); }, [profile.selfAssessment?.date]);
      // 折叠行显示人话，不是 `B` 这种选项代码 —— 代码是题库与存储的东西：用户填进去的是
      // 「在职同方向」，不是「B」。选项代码会随题库调整而变，直接显示它等于把内部标识
      // 漏到界面上。
      const answerLabel = (key) => {
        const question = state.catalog.questions.find((entry) => entry.key === key);
        const value = (profile.intake ?? {})[key];
        return question?.options.find((option) => option.value === value)?.label ?? '';
      };
      const summary = {
        direction: profile.targetRole || '未选择',
        intake: [profile.route, answerLabel('q1'), answerLabel('q2'), answerLabel('q3'), answerLabel('q4')].filter(Boolean).join(' · ') || '未完成',

        transferable: (profile.verifiedFacts ?? []).length > 0 ? `${String(profile.verifiedFacts.length)} 项已确认` : '等待确认',
        self: Object.keys(profile.selfAssessment?.scores ?? {}).length > 0 ? `${String(Object.keys(profile.selfAssessment.scores).length)} 项已完成` : '未开始',
      };

      // 计划的输入条件与「计划」页空状态里的 ready 保持同一口径（方向 + 追问齐全 + 有模型），
      // 另外还要等自评做完：缺口与补强优先级是打分产出的，而它们决定计划该补哪几项能力。
      // 少了这一条，卡片会在自评还没做的时候就催用户去生成计划。
      const busy = useAgentBusy();
      const planReady = state.plan.phases.length === 0
        && state.profile.targetRole.length > 0
        && state.catalog.missingBackground.length === 0
        && state.catalog.activeRole !== null
        && done.self;
      const confirm = (next, action) => { setOpen(next); if (action) action(); };
      const saveRole = (slug, name) => {
        void post('/intake', {
          roleSlug: slug ?? (slug === state.catalog.customSlug ? undefined : profile.targetRoleSlug),
          roleName: name,
          intake: profile.intake ?? {},
          route: profile.route || undefined,
        });
      };
      // 先落草稿再前进：否则打完名字直接点确认，名字会被静默丢掉。
      const confirmRole = () => {
        const name = roleDraft.trim();
        if (name.length > 0) { saveRole(state.catalog.customSlug, name); setRoleDraft(''); }
        confirm('intake');
      };
      const bgFields = state.catalog.followUps?.fields;
      const bgDirty = (bgFields ?? []).some((field) => (bgDraft[field.key] ?? '') !== ((profile.background ?? {})[field.key] ?? ''));
      const bgComplete = Array.isArray(bgFields)
        && bgFields.every((field) => field.required !== true || String(bgDraft[field.key] ?? '').trim().length > 0);
      // 先落草稿再前进 —— 与 ① 的自定义岗位名同样的道理：不落盘就等于没填。
      const confirmIntake = () => {
        const flush = bgDirty ? post('/background', { background: bgDraft }) : Promise.resolve();
        void flush.then(() => {
          // 答案齐了、而且还没有候选，才自动提一次；其余情况用户点 ③ 的按钮。
          const shouldAsk = bgComplete && (profile.transferableSuggestions ?? []).length === 0;
          confirm('transferable', shouldAsk ? () => { void askAgent('帮我看看我有什么底子'); } : undefined);
        });
      };
      const savedScores = profile.selfAssessment?.scores ?? {};
      const scoresDirty = (() => {
        const keys = new Set([...Object.keys(savedScores), ...Object.keys(scoresDraft)]);
        for (const key of keys) if (savedScores[key] !== scoresDraft[key]) return true;
        return false;
      })();
      // 先落盘再折叠：与 ① 的自定义岗位名、② 的追问同一套处理。
      const confirmSelf = () => {
        if (scoresDirty) void post('/self-assessment', { scores: scoresDraft });
        setOpen('');
      };
      const scoredCount = Object.keys(scoresDraft).length;
      const selfLabel = state.catalog.activeRole === null
        ? '确认能力自评'
        : `确认能力自评（已确认 ${String(scoredCount)} / ${String(state.catalog.activeRole.items.length)} 项）`;
      const startCapabilityModel = () => {
        if (state.catalog.activeRole === null) void askAgent('帮我建这个方向的能力模型');
      };
      return h('div', { style: S.stack }, [
        h(ProfileModule, { key: 'direction', label: '目标岗位', summary: summary.direction, done: done.direction, open: open === 'direction', onOpen: () => setOpen('direction'), onConfirm: confirmRole, children: h(DirectionForm, { state, post, draft: roleDraft, setDraft: setRoleDraft, commit: saveRole, onCollapse: () => setOpen('') }) }),
        h(ProfileModule, { key: 'intake', label: '你的条件', summary: summary.intake, done: done.intake, open: open === 'intake', onOpen: () => setOpen('intake'), onConfirm: confirmIntake, children: h(IntakeForm, { state, post, bgDraft, setBgDraft, onCollapse: () => setOpen('') }) }),
        h(ProfileModule, { key: 'transferable', label: '可迁移能力', summary: summary.transferable, done: done.transferable, open: open === 'transferable', onOpen: () => setOpen('transferable'), onConfirm: () => confirm('self', startCapabilityModel), children: h(TransferableForm, { state, post, onCollapse: () => setOpen('') }) }),
        h(ProfileModule, { key: 'self', label: '能力自评', summary: summary.self, done: done.self, open: open === 'self', onOpen: () => setOpen('self'), onConfirm: confirmSelf, confirmLabel: selfLabel, children: h(SelfAssessmentForm, { state, post, scores: scoresDraft, setScores: setScoresDraft, onCollapse: () => setOpen('') }) }),
        planReady ? h('div', { key: 'handoff', style: { ...S.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' } }, [
          h('div', { key: 'copy' }, [
            h('div', { key: 't', style: { fontSize: '14px', fontWeight: '700' } }, '画像齐了，下一步是 90 天计划'),
            h('div', { key: 's', style: { ...S.fine, marginTop: '3px' } }, '按你的方向、可用的时间和路线生成；生成期间页面会自动刷新。'),
          ]),
          h(AskButton, { key: 'go', text: '帮我生成成长计划', label: busy ? 'AI 正在生成计划…' : '让 AI 生成计划', style: S.buttonOn,
            done: state.plan.phases.length > 0,
            hint: '生成后会自动切到「计划」页，你能看到它逐段落下来。',
            onSent: () => { if (typeof onNavigate === 'function') onNavigate('plan'); } }),
        ]) : null,
      ]);
    }

    /** The left page: a tab bar over the four bodies. */
    function Panel() {
      const { state, error, post, reload } = useWorkbench();
       const [tab, setTab] = useState('today');
       // 深链落到画像时先让那一步展开 —— 折叠状态下锚点不在 DOM 里，滚动会扑空。
       // 存对象而不是字符串：连点同一个目标时也要能重新触发。
       const [focusAnchor, setFocusAnchor] = useState(null);

       const navigate = useCallback((targetTab, anchor) => {
         setTab(targetTab);
         if (targetTab === 'profile' && typeof anchor === 'string' && anchor.length > 0) {
           setFocusAnchor({ anchor, at: Date.now() });
         }
         setTimeout(() => {
           if (typeof document === 'undefined' || !anchor) return;
           const node = document.querySelector(`[data-anchor="${anchor}"]`) || document.querySelector(`[data-task-id="${anchor.replace('task-', '')}"]`);
           node?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
         }, 160);
       }, []);

      if (state === null) {
        return h('div', { style: S.page }, h('div', { style: S.body }, [
          h('div', { key: 'loading', style: S.empty }, '载入中…'),
          error.length > 0 ? h('div', { key: 'error', style: S.error }, error) : null,
        ]));
      }

      const bodies = {
        today: () => h(TodayBody, { state, post, reload, compact: false }),
        plan: () => h(PlanTabBody, { state, post }),
        review: () => h(ReviewTabBody, { state, post }),
        profile: () => h(ProfileFlow, { key: 'profile-flow', state, post, onNavigate: navigate, focusAnchor }),
      };

      return h('div', { style: S.page, className: 'gw-root' }, [
        h('div', { key: 'tabs', className: 'gw-tabbar', style: S.tabbar }, TABS.map((entry) => h('button', {
          key: entry.id,
          type: 'button',
          style: { ...S.tab, ...(tab === entry.id ? S.tabOn : {}) },
          onClick: () => setTab(entry.id),
        }, entry.label))),
         h('div', { key: 'body', style: S.body }, h('div', { style: S.inner }, [
           error.length > 0 ? h('div', { key: 'error', style: S.error }, error) : null,
           h(WorkbenchHeader, { key: 'header', state, post, onNavigate: navigate, hideNext: tab === 'profile' || tab === 'review', currentTab: tab }),
           bodies[tab](),
           // 状态与设置放最下面，而且**各归各页**（见 `WorkbenchFoot`）—— 顶部留给"我现在要做什么"。
           h(WorkbenchFoot, { key: 'foot', state, post, tab }),
         ])),
      ]);
    }

    /** Compact execution card for the narrow right sidebar. */
    /**
     * 右栏那一张任务卡 —— **只负责版式**：窄栏里的顺序与密度。
     *
     * 交互件（勾选、证据阅读态、写作弹窗、图片、完成印章）全部来自共用组件，所以这一版和
     * 左页不会再有"右边落后一版"的问题。它自己也不再另写证据输入 —— 那正是它上一次漂掉的地方
     * （一行 input + 原生 select + 自己一套档位措辞，于是只有走右栏的人拿不到弹窗和图片）。
     */
    function RightTaskCard({ task, entry, post, reload, tiers }) {
      const done = entry?.done === true;
      const save = (patch) => post('/checkin', { taskId: task.id, ...patch });
      return h('div', { 'data-task-id': task.id, style: { display: 'flex', flexDirection: 'column', gap: '12px', padding: '15px', borderRadius: '16px', background: done ? 'var(--gw-teal-soft, rgba(47,125,116,.12))' : '#fffdf9', border: `1px solid ${done ? 'rgba(47,125,116,.28)' : '#e5dfd5'}`, boxShadow: '0 8px 18px rgba(54,42,32,.05)' } }, [
        h('div', { key: 'eyebrow', style: { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' } }, [
          h('span', { key: 'ref', style: { fontSize: '12px', fontFamily: 'var(--gw-mono, monospace)', color: 'var(--gw-coral-deep, #a64132)' } }, `${task.id} / ${task.ref}`),
          h('span', { key: 'done', style: { fontSize: '13px', fontWeight: '700', color: done ? 'var(--gw-teal, #2f7d74)' : 'var(--gw-muted, #718096)' } }, `${done ? '已完成' : '未完成'} · ${String(task.minutes)} 分钟`),
        ]),
        h('div', { key: 'title', style: { display: 'flex', gap: '11px', alignItems: 'flex-start' } }, [
          h(TaskCheck, { key: 'box', task, done, onToggle: () => { void save({ done: !done }); } }),
          h('span', { key: 'text', style: { fontSize: '15px', fontWeight: '600', lineHeight: '1.45', textDecoration: done ? 'line-through' : 'none', opacity: done ? '.6' : '1', cursor: 'pointer' }, onClick: () => { void save({ done: !done }); } }, task.action),
        ]),
        // 印章放在一行里 —— 直接挂在列容器下会被拉伸成通栏大框（窄栏里尤其明显）。
        done ? h('div', { key: 'markRow', style: { display: 'flex' } }, [h(Seal, { key: 'mark', tone: 'teal', label: '已完成', stamp: true })]) : null,
        h('div', { key: 'minimum', style: { padding: '10px 11px', borderRadius: '10px', background: '#f3efe8', fontSize: '13px', lineHeight: '1.55', color: '#59645f' } }, [
          h('strong', { key: 'label', style: { color: '#253b39' } }, '最低完成版本'),
          ` ${task.minimumVersion}`,
        ]),
        h(TaskEvidenceLine, { key: 'evidence', task, entry, post, reload, tiers }),
      ]);
    }

    /** The right sidebar is a glanceable execution surface, not a shrunken main page. */
    function TodayTab() {
      const { state, error, post, reload } = useWorkbench();
      const [activity, setActivity] = useState(agentActivity);
      useEffect(() => subscribeActivity(setActivity), []);
      if (state === null) return h('div', { style: { padding: '16px', fontSize: '14px', color: 'var(--gw-muted, #718096)' } }, error.length > 0 ? error : '正在载入今日…');
      const task = state.focus.tasks[0];
      const done = state.metrics.completion.total > 0 ? Math.round((state.metrics.completion.done / state.metrics.completion.total) * 100) : 0;
      return h('div', { className: 'gw-root', style: { height: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: '16px 14px 22px', display: 'flex', flexDirection: 'column', gap: '14px', background: 'linear-gradient(180deg, #f8f6f1 0%, #f3eee7 100%)', color: 'var(--gw-ink, #1f2933)' } }, [
        h('div', { key: 'head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' } }, [
          h('div', { key: 'copy' }, [
            h('div', { key: 'eyebrow', style: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--gw-coral-deep, #a64132)' } }, 'Today'),
            h('div', { key: 'title', style: { fontFamily: 'var(--gw-display, Calistoga, Georgia, serif)', fontSize: '24px', lineHeight: '1.15', marginTop: '5px' } }, state.profile.targetRole ? `向 ${state.profile.targetRole} 走` : '今天，先走一步'),
          ]),
          h('span', { key: 'day', style: { ...S.chip, fontFamily: 'var(--gw-mono, monospace)', whiteSpace: 'nowrap' } }, dayInfo(state.metrics.day).chip),
        ]),
        // 和左边用同一套读数语言：等宽大数字 + 大写间距标签 + 印章，不是两个自己画的方盒子。
        h('div', { key: 'metrics', style: { ...S.card, padding: '14px 16px', gap: '10px' } }, [
          h('div', { key: 'row', style: { display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end' } }, [
            h(Readout, { key: 'done', first: true, value: String(done), unit: '%', cap: '完成' }),
            h(Readout, { key: 'streak', value: String(state.metrics.streak), cap: '连续打卡' }),
          ]),
          state.metrics.streak > 0 ? h('div', { key: 'sealRow', style: { display: 'flex' } }, [h(Seal, { key: 'seal', tone: 'teal', label: `连续 ${String(state.metrics.streak)} 天`, sub: '不间断' })]) : null,
          h('div', { key: 'phase', style: S.fine }, state.metrics.phaseName || '尚未开始'),
        ]),
        activity === null ? null : h('div', { key: 'activity', role: 'status', 'aria-live': 'polite', style: { padding: '11px 12px', borderRadius: '12px', fontSize: '13px', lineHeight: '1.5', background: activity.status === 'completed' ? 'var(--gw-teal-soft, rgba(47,125,116,.12))' : activity.status === 'error' ? '#fff0ed' : '#eef2f0', border: `1px solid ${activity.status === 'completed' ? 'rgba(47,125,116,.28)' : activity.status === 'error' ? '#f3c5be' : '#d5e0da'}` } }, activity.status === 'completed'
          ? (activity.wrote === true ? 'AI 已返回，今日面板已自动更新。' : 'AI 跑完了，这次没有改动数据。')
          : activity.status === 'error' ? `AI 处理失败：${activity.error}` : 'AI 正在处理，完成后这里会自动更新。'),
        task === undefined ? h(NextActionCard, {
          key: 'empty',
          action: state.nextAction,
          style: { padding: '16px', borderRadius: '16px' },
          // 只在真有下一步时指路 —— 没有动作时那句会回退成「去…「今日」页」，
          // 而这张卡本身就在今日这一侧，等于让人去他已经站着的地方。
          note: state.nextAction === null || state.nextAction === undefined ? null
            : h('div', { key: 'where', style: { fontSize: '12.5px', opacity: '.72', marginTop: '7px' } },
              `去左侧「成长工作台」的「${(TABS.find((entry) => entry.id === state.nextAction?.targetTab) ?? {}).label ?? '今日'}」页`),
        }) : h(RightTaskCard, { key: task.id, task, entry: state.progress.tasks?.[task.id], post, reload, tiers: state.catalog.tiers }),
        error.length > 0 ? h('div', { key: 'error', style: S.error }, error) : null,
        // 三档，不是两档：没有排定任务分两种 ——「有接下来要做的」和「压根还没有排到天的任务」。
        // 原先的 else 一律说「先接着完成这一项」，而后者上面一项都没有，那句话就是假的。
        h('div', { key: 'foot', style: { ...S.fine, textAlign: 'center', paddingTop: '2px' } },
          state.focus.scheduled ? '这是今天排定的最小动作'
            : task === undefined ? '计划还只排到周 —— 去左侧「计划」页让 AI 细化到天'
              : '今天没有排定任务，先接着完成这一项'),
      ]);
    }


    /** The row icon: a rising step, drawn in `currentColor`. */
    function PanelIcon(props) {
      const size = props !== null && typeof props === 'object' && typeof props.size === 'number' ? props.size : 17;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
      }, [
        h('path', { key: 'a', d: 'M4 19h16' }),
        h('path', { key: 'b', d: 'M7 19v-5' }),
        h('path', { key: 'c', d: 'M12 19V9' }),
        h('path', { key: 'd', d: 'M17 19V5' }),
      ]);
    }

    /** The right-sidebar tab type. A page type: opened by kind, no resource patterns. */
    function definition() {
      return {
        id: TAB_ID,
        kind: TAB_KIND,
        priority: 'extension',
        title: () => '今日',
        guide: [{ order: 30, title: () => '今日任务', description: () => '成长工作台：今天该做什么' }],
      };
    }

    /**
     * **只写真正必需的服务。**
     *
     * `slots` 是页面能渲染的前提（任何 web profile 都有它）。而右侧栏那两个
     * （`sidebarRightTabs` / `sidebarRight`）**不能写进这里**：别的机器上没装右侧栏那一套的话，
     * 插件会一直停在 pending，整个 web boot 报「1 entry did not activate」——
     * 用户在自己的另一台电脑上就撞上了，报错原文是
     * `pending (waiting for services: sidebarRightTabs, sidebarRight)`。
     *
     * 右栏是**加分项**：没有它只是少一个「今日」窄栏，左菜单与整页照常能用。
     * 所以它改成运行时 `ctx.get`，拿不到就跳过（并在控制台说一句），不拖垮整个插件。
     */
    const inject = ['slots'];

    /** Reveal the right tab once the sidebar seat is mounted. */
    function revealTabWhenReady(rightPane) {
      let attempts = 0;
      let timer;
      const tick = () => {
        timer = undefined;
        if (attempts >= 40) return;
        attempts += 1;
        try {
          rightPane.openTab(TAB_KIND);
        } catch {
          timer = setTimeout(tick, 500);
        }
      };
      tick();
      return () => { if (timer !== undefined) clearTimeout(timer); };
    }

    /**
     * Contribute the left menu.
     *
     * The page is deliberately **not** selected on boot: selecting a main panel
     * replaces the conversation, and a workbench must not hijack the screen.
     */
    function registerLeftMenu(ctx) {
      ctx.effect(
        () => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
          { name: 'sidebar.panellist', id: PANEL_ID, order: 50, label: LABEL },
          PanelIcon,
        )),
        'dsh-growth-workbench: left menu row',
      );
      ctx.effect(
        () => ctx.slots.inject('main', () => ctx.slots.register(
          { name: 'main', key: PANEL_ID },
          Panel,
        )),
        'dsh-growth-workbench: left menu page',
      );
    }

    /** Client plugin body. Every contribution is disposed with the plugin. */
    function apply(ctx) {
      // 组件拿到的是 props，拿不到 ctx —— 而"让 AI 来做"那几个按钮需要它才能找到
      // 当前会话。所以在这里存一份，而不是给每个表单都穿一个 ctx 参数。
      rootCtx = ctx;

      // 插件卸载（换 profile、页面走了）：把我们占着的主视图放开 —— 新版 API 里那个引用是
      // 有生命周期的，留着不放等于替用户一直开着一个会话的窗口。
      ctx.effect(() => () => { releaseMainView(); }, 'dsh-growth-workbench: main view reference');

      registerLeftMenu(ctx);

      // 右栏那两件：**不写进 inject**（别的机器上没有它们，写进去插件会一直 pending、整个 boot
      // 报「1 entry did not activate」），但也**不能在 apply 当下就断言"没有"** —— 去掉 inject
      // 之后 apply 是**立刻**跑的，那一刻它们很可能只是还没挂上来。
      // 我上一版就是一次性的检查，于是"等它"变成了"假设它不在"：右侧那个「今日」窄栏直接消失。
      // 现在改成**轮询等**，等到了再注册；一直等不到才跳过（另一台机器上的正常退让）。
      const serviceOf = (name) => {
        try {
          return typeof ctx.get === 'function' ? ctx.get(name) : ctx[name];
        } catch {
          return ctx[name];
        }
      };
      let stopped = false;
      let attempts = 0;
      const registerRightPane = () => {
        if (stopped === true) return;
        const tabs = serviceOf('sidebarRightTabs');
        if (tabs === undefined || tabs === null) {
          attempts += 1;
          if (attempts === 1) console.warn('[dsh-growth-workbench] 右侧栏（sidebarRightTabs）还没挂上，先等着；一直等不到就只少一个「今日」窄栏。');
          if (attempts < 60) setTimeout(registerRightPane, 300);
          return;
        }
        ctx.effect(() => tabs.register(definition()), 'dsh-growth-workbench: tab type');
        ctx.effect(
          () => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
            name: 'sidebar.right.pane.tab',
            key: TAB_ID,
          }, TodayTab)),
          'dsh-growth-workbench: tab body',
        );
        const rightPane = serviceOf('sidebarRight');
        if (rightPane !== undefined && rightPane !== null && typeof rightPane.openTab === 'function') {
          ctx.effect(() => revealTabWhenReady(rightPane), 'dsh-growth-workbench: reveal the tab');
        }
      };
      ctx.effect(
        () => { registerRightPane(); return () => { stopped = true; }; },
        'dsh-growth-workbench: right pane',
      );
    }

    return { apply, inject };
  },
});
