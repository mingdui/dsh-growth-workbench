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
 * in the conversation you already have open** (`sessions.binding(current).session.prompt`).
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

    const messageOf = (failure) => (failure instanceof Error ? failure.message : String(failure));

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
     * Say one thing to the agent **in the conversation that is already open**.
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
      const sessions = typeof rootCtx.get === 'function' ? rootCtx.get('sessions') : undefined;
      if (sessions === undefined || sessions === null) throw new Error('当前环境没有会话服务，无法替你发消息 —— 请手动复制指令发到对话里');

      const current = sessions.list?.getSnapshot?.()?.current;
      if (typeof current !== 'string' || current.length === 0) {
        throw new Error('还没有打开的对话 —— 先新建或打开一个会话，再点这个按钮');
      }
      const binding = sessions.binding(current);
      if (binding === undefined || binding === null) throw new Error('当前对话还没准备好，稍后再试');

      const session = binding.session;
      const before = session.getSnapshot();
      // beginSubmission 会先在对话里放一条"提交中"的回声 —— 这就是用户期待看到的：
      // 这条指令像是他自己发的。
      const handle = session.beginSubmission({ mode: 'queue', text, attachments: [] });
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
      setAgentActivity({ status: 'queued', text, queued: before.running === true || (before.queue ?? []).length > 0, startedAt: Date.now() });
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
             if (previous?.revision && next.revision && previous.revision !== next.revision && agentActivity?.status === 'queued') {
               setAgentActivity({ ...agentActivity, status: 'completed', finishedAt: Date.now(), resultRevision: next.revision });
             }
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

      return { state, error, post };
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

    /** One task row: check it off, then say what evidence came out of it. */
    function TaskRow({ task, entry, post }) {
      const [evidence, setEvidence] = useState(entry?.evidence ?? '');
      const [tier, setTier] = useState(entry?.tier ?? '');

      // A reload wipes local edits only when the server value actually changed.
      useEffect(() => { setEvidence(entry?.evidence ?? ''); }, [entry?.evidence]);
      useEffect(() => { setTier(entry?.tier ?? ''); }, [entry?.tier]);

      const done = entry?.done === true;
      const days = (entry?.checkInDates ?? []).length;
      const save = (patch) => post('/checkin', { taskId: task.id, ...patch });

      return h('div', { 'data-task-id': task.id, style: { ...S.row, flexDirection: 'column', alignItems: 'stretch', gap: '6px' } }, [
        h('div', { key: 'head', style: { display: 'flex', alignItems: 'flex-start', gap: '8px' } }, [
          // A native checkbox can be neither filled nor stamped, and this one has to hold
          // the 完成 moment. Same contract as before: clicking toggles, aria-checked
          // carries the state, and the row is still the real touch target.
          h('button', {
            key: 'box',
            type: 'button',
            role: 'checkbox',
            'aria-checked': done,
            'aria-label': task.action,
            style: { marginTop: '1px', flex: '0 0 auto', width: '24px', height: '24px', padding: '0', display: 'grid', placeItems: 'center', borderRadius: '8px', cursor: 'pointer', transition: 'background 160ms ease, border-color 160ms ease, transform 120ms ease', border: `2px solid ${done ? 'var(--gw-teal, #2f7d74)' : 'var(--gw-line, #e5dfd5)'}`, background: done ? 'var(--gw-teal, #2f7d74)' : '#fff' },
            onClick: () => { void save({ done: !done }); },
          }, [
            done ? h('span', { key: 'tick', style: { width: '10px', height: '6px', borderLeft: '2px solid #fff', borderBottom: '2px solid #fff', transform: 'rotate(-45deg) translate(1px, -1px)' } }) : null,
          ]),
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
            h('div', { key: 'meta1', style: { ...S.fine, marginTop: '4px' } },
              `引用 ${task.ref}　能力项 ${task.capability}　预计 ${String(task.minutes)} 分钟　最低完成版本：${task.minimumVersion}`),
            h('div', { key: 'meta2', style: { ...S.fine, marginTop: '2px' } },
              `完成标准：${task.doneCriteria}　|　可接受证据：${task.acceptableEvidence}`),
          ]),
          h('span', { key: 'days', style: S.chip }, `打卡 ${String(days)} 天`),
          // 完成时落一枚印章。它只在 done 时挂载 —— 挂载即跑动画，所以勾下去就有
          // 「盖上去」的那一下；取消再勾会重来一次。
          done ? h(Seal, { key: 'mark', tone: 'teal', label: '已完成', stamp: true }) : null,
        ]),
        h('div', { key: 'evidence', style: { ...S.inline, paddingLeft: '22px' } }, [
          h('input', {
            key: 'input',
            style: { ...S.input, fontSize: '13px' },
            placeholder: '证据：链接 / 文件路径 / 一段心得（可留空）',
            value: evidence,
            onChange: (event) => setEvidence(event.target.value),
            onBlur: () => { if (evidence !== (entry?.evidence ?? '')) void save({ evidence }); },
          }),
          h('div', {
            key: 'tier',
            role: 'group',
            'aria-label': '证据档位',
            style: { display: 'inline-flex', border: '1px solid var(--gw-line, #e5dfd5)', borderRadius: '12px', overflow: 'hidden', background: '#fffdf9', flex: '0 0 auto' },
          }, [['', '未交'], ['自述', '自述'], ['过程', '过程'], ['成果', '成果']].map(([value, label], index) => h('button', {
            key: value === '' ? 'none' : value,
            type: 'button',
            'aria-pressed': tier === value,
            // 四格一眼看完，比下拉框少一次点击 —— 而档位是三档里选一个，本来就该看见全部选项。
            style: { appearance: 'none', font: 'inherit', fontSize: '12.5px', fontWeight: '500', padding: '8px 13px', border: '0', borderLeft: index === 0 ? '0' : '1px solid var(--gw-line, #e5dfd5)', background: tier === value ? 'var(--gw-teal-soft, rgba(47,125,116,.12))' : 'transparent', color: tier === value ? 'var(--gw-teal, #2f7d74)' : 'var(--gw-muted, #6f7c87)', cursor: 'pointer', transition: 'background 140ms ease, color 140ms ease' },
            onClick: () => {
              setTier(value);
              void save({ tier: value === '' ? null : value });
            },
          }, label))),
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

    function Metrics({ state }) {
      const { metrics } = state;
      const day = dayInfo(metrics.day);
      const week = metrics.weekRate === null ? undefined : String(Math.round(metrics.weekRate * 100));
      // gap 是加权缺口的**比例**（模型里断言的就是 180/1300 这种值），不是分数 ——
      // 所以这里印成百分比，而不是把它当"分"报出去。
      const gap = metrics.gap === null || metrics.gap === undefined ? undefined : String(Math.round(metrics.gap * 100));
      const kids = [
        h('div', { key: 'numbers', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' } }, [
          h('div', { key: 'strip', style: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', flex: '1 1 auto' } }, [
            h(Readout, { key: 'day', first: true, value: day.value, cap: day.cap }),
            h(Readout, { key: 'done', value: `${String(metrics.completion.done)}/${String(metrics.completion.total)}`, cap: '完成' }),
            h(Readout, { key: 'week', value: week === undefined ? '—' : week, unit: week === undefined ? undefined : '%', cap: '本周完成率' }),
            h(Readout, { key: 'gap', value: gap === undefined ? '—' : gap, unit: gap === undefined ? undefined : '%', cap: '距达标线' }),
          ]),
          metrics.streak > 0 ? h(Seal, { key: 'streak', tone: 'teal', label: `连续 ${String(metrics.streak)} 天`, sub: '不间断' }) : null,
        ]),
        h('div', { key: 'evidence', style: S.meta },
          `证据档位：成果 ${String(metrics.evidence.成果)} · 过程 ${String(metrics.evidence.过程)} · 自述 ${String(metrics.evidence.自述)} · 无 ${String(metrics.evidence.无证据)}　（过程与成果都算数，自述只作辅证）`),
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
    function TodayBody({ state, post, compact }) {
      const kids = [];
      if (!compact) kids.push(h(Metrics, { key: 'metrics', state }));
      // 空状态要说清「为什么空、下一步怎么办」。原先只有一句「计划里没有待办任务」，
      // 而下面这三种情况的原因完全不同 —— 用户看完还是不知道该做什么。
      const taskTotal = state.plan.phases.reduce((sum, phase) => sum + ((phase.tasks ?? []).length), 0);
      const rows = state.focus.tasks.length === 0
        ? [h('div', { key: 'empty', style: S.empty }, state.plan.phases.length === 0
          ? '还没有计划。完成「画像」后就能生成。'
          : taskTotal === 0
            // 这句话原来只说「让 AI 把计划细化到天」，却没有任何入口 —— 用户被告知去找 AI，
            // 而页面上没有能点的地方。入口就放在他被这句话拦住的地方。
            ? h('div', { key: 'toDays', style: { display: 'flex', flexDirection: 'column', gap: '11px', alignItems: 'flex-start' } }, [
              h('div', { key: 't' }, '计划目前只排到周，还没有排到天的任务 —— 让 AI 把它细化到天，这里就会出现今天该做的事。'),
              h(AskButton, {
                key: 'btn',
                text: '帮我把计划细化到天',
                label: '让 AI 细化到天',
                style: S.buttonOn,
                hint: '它会把每个阶段的周，拆成能排到某一天、并且能验收的任务。',
              }),
            ])
            : '计划里的任务都做完了 —— 该做一次考核，把成果沉淀下来。')]
        : state.focus.tasks.slice(0, 1).map((task) => h(TaskRow, { key: task.id, task, entry: state.progress.tasks?.[task.id], post }));
      kids.push(h('div', { key: 'card', style: S.card }, [
        h('div', { key: 'head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap' } }, [
          h('h3', { key: 'title', style: S.h3 }, state.focus.scheduled ? '今天要做' : '接下来要做'),
          // 全部做完才落这枚章 —— 它得是真的，否则就成了那种"永远在表扬你"的装饰。
          state.focus.tasks.length > 0 && state.focus.tasks.every((task) => state.progress.tasks?.[task.id]?.done === true)
            ? h(Seal, { key: 'all', tone: 'teal', label: '已全部完成', sub: `共 ${String(state.focus.tasks.length)} 件`, stamp: true })
            : null,
        ]),
        ...rows,
      ]));
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: compact ? '8px' : '18px' } }, kids);
    }

    function WorkbenchHeader({ state, onNavigate, hideNext, currentTab }) {
      const action = state.nextAction;
      // 下一步就落在用户正在看的这一页时，「现在去做 →」是让他去他已经站在的地方 ——
      // 考核那条的 targetTab 与 targetAnchor 都是 review，而页面上没有这个锚点，
      // 于是这个按钮完全空转。理由留着（它解释为什么是现在），按钮去掉：这一页自己的
      // 动作就在下面（考核页是「让 AI 现在考核」）。
      const onThisTab = action !== undefined && action !== null && action.targetTab === currentTab;
      const day = dayInfo(state.metrics.day);
      const [activity, setActivity] = useState(agentActivity);
      useEffect(() => subscribeActivity(setActivity), []);
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, [
        h('div', { key: 'intro', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' } }, [
          h('div', { key: 'copy' }, [
            h('div', { key: 'eyebrow', style: { ...S.fine, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--gw-coral-deep, #a64132)' } }, '成长手记'),
            h('h1', { key: 'title', style: { ...S.h2, fontSize: '40px', lineHeight: '1.08', marginTop: '8px' } }, state.profile.targetRole ? `向 ${state.profile.targetRole} 走` : '把成长，变成下一步'),
            h('div', { key: 'sub', style: S.meta }, state.profile.positioning || '不是填表，而是把今天真正做成一小步。'),
          ]),
          h('div', { key: 'day', style: { ...S.chip, fontFamily: 'var(--gw-mono, monospace)' } }, day.value === '—' ? 'DAY --' : (day.started ? `DAY ${String(day.value).padStart(2, '0')}` : `${day.value} 天后开始`)),
        ]),
        action === undefined || action === null || hideNext === true ? null : h('div', { key: 'next', style: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', padding: '16px 18px', borderRadius: '15px', background: 'linear-gradient(100deg, #253b39, #36534d)', color: '#fff', boxShadow: '0 14px 28px rgba(37,59,57,.16)' } }, [
          h('div', { key: 'copy', style: { flex: '1 1 260px' } }, [
            h('div', { key: 'label', style: { fontSize: '12px', opacity: '.7', textTransform: 'uppercase', letterSpacing: '.12em' } }, '下一步'),
            h('div', { key: 'title', style: { fontSize: '17px', fontWeight: '700', marginTop: '4px' } }, action.label),
            h('div', { key: 'reason', style: { fontSize: '13px', opacity: '.78', marginTop: '4px', lineHeight: '1.5' } }, action.reason),
          ]),
          onThisTab ? null : h('button', { key: 'go', type: 'button', style: { ...S.button, background: '#f3c26b', borderColor: '#f3c26b', color: '#253b39' }, onClick: () => onNavigate(action.targetTab, action.targetAnchor) }, '现在去做 →'),
        ]),
        activity === null ? null : h('div', { key: 'activity', role: 'status', 'aria-live': 'polite', style: { ...S.meta, padding: '9px 12px', borderRadius: '10px', background: activity.status === 'error' ? '#fff0ed' : activity.status === 'completed' ? '#edf7ef' : '#f3efe8' } }, activity.status === 'completed' ? 'AI 已返回结果，页面已自动更新。' : activity.status === 'error' ? `AI 处理失败：${activity.error}` : activity.status === 'queued' ? 'AI 已接手，页面会自动刷新结果，不需要守着对话。' : '正在把请求送进当前对话…'),
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
      const LEFT = 34
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
          h('div', { key: 'sub', style: S.meta }, '每周完成率，到本周为止。'),
          h(WeekTrendChart, { key: 'chart', rates: weekRates }),
          h('div', { key: 'note', style: S.fine }, '完成率 = 那一周排到天的任务里完成了多少；那一周没排到天的任务时不画柱子。'),
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
          body.push(h('div', { key: 'tasks', style: { display: 'flex', flexDirection: 'column' } },
            phase.tasks.map((task) => h('div', { key: task.id, style: { ...S.row, flexDirection: 'column', alignItems: 'stretch', gap: '4px' } }, [
              h('div', { key: 'head', style: { display: 'flex', gap: '9px', alignItems: 'baseline' } }, [
                h('span', { key: 'id', style: { ...S.chip, flex: '0 0 auto' } }, task.id),
                h('span', { key: 'action', style: { fontSize: '14px', fontWeight: '600' } }, task.action),
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
            ]))));
        }
        kids.push(h('div', { key: `phase-${String(index)}`, style: S.card }, body));
      });

      if (plan.selfCheck.length > 0) {
        kids.push(h('div', { key: 'selfcheck', style: S.card }, [
          h('h3', { key: 't', style: S.h3 }, `考核自查（${String(plan.selfCheck.length)} 题，只有题目）`),
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

    /**
     * 这次该考哪一档：页面不自己判 —— 上面那条优先级阶梯（nextActionFor）已经判过了，
     * 它给出的 id 就是答案。页面再算一遍只会和它分叉。
     */
    function examTier(state) {
      const action = state.nextAction;
      return action !== null && action !== undefined && action.id === 'review-phase' ? 'phase' : 'node';
    }

    /** 一张考卷几道题。用户答得完，AI 也核得过来。 */
    const PAPER_SIZE = 3;

    /**
     * 杂志版考卷：点进来就有卷子，当场作答，交卷把答案送进当前对话由 AI 打分。
     *
     * 「换一张」是顺次换窗（缺口第 1–3 位 → 第 4–6 位 → 换回），不是随机抽 —— 确定、可解释，
     * 而且换回去时草稿还在（每张卷子的窗口各自记自己的答案）。
     */
    function Paper({ state }) {
      const [tier, setTier] = useState(() => examTier(state));
      const pool = examPool(state, tier);
      const windows = Math.max(1, Math.ceil(pool.length / PAPER_SIZE));
      const [offset, setOffset] = useState(0);
      const [answers, setAnswers] = useState({});
      const [phase, setPhase] = useState('idle');
      const take = pool.slice(offset * PAPER_SIZE, offset * PAPER_SIZE + PAPER_SIZE);
      const filled = take.filter((entry) => (answers[entry.question.id] ?? '').trim().length > 0).length;
      const ready = take.length > 0 && filled === take.length;
      // 档位要和「这次考的是哪个」对得上：大考针对的是**已走完的那个阶段**，通常不是当前阶段
      // （原先这里一律写当前阶段，于是「阶段大考」旁边挂着另一个阶段的名字）。
      // 阶段那条由上面那条阶梯给出（nextAction.scope），单一来源；小考的周次页面自己就算得出。
      const action = state.nextAction;
      const week = state.metrics.day === null || state.metrics.day < 1 ? null : Math.floor((state.metrics.day - 1) / 7) + 1;
      const scope = tier === 'phase'
        ? (action !== null && action !== undefined && action.id === 'review-phase' && typeof action.scope === 'string'
          ? action.scope
          : (state.metrics.phaseName.length > 0 ? `阶段 ${state.metrics.phaseName}` : '还没进入阶段'))
        : (week === null ? '计划还没开始' : `节点 第 ${String(week)} 周`);
      // 不再 Math.max(1, …)：0 或负数要原样留着，标题与交卷文案都靠 dayInfo 判断该怎么写。
      const day = state.metrics.day;

      const send = async () => {
        if (!ready || phase === 'sent') return;
        setPhase('sent');
        const lines = take.map((entry, index) => [
          `${String(index + 1)}）能力项 ${entry.item.id}${entry.item.name === '' ? '' : ` ${entry.item.name}`}（自评 ${String(entry.item.score)} 分，缺口 ${String(entry.item.shortfall)}）`,
          `题目：${entry.question.question}`,
          `我的回答：${answers[entry.question.id]}`,
        ].join('\n'));
        try {
          await askAgent(`我的考核作答（${day === null || day === undefined ? '计划还没开始' : `计划第 ${String(day)} 天`}，${state.metrics.phaseName || '未进入阶段'}）—— 本次是${tier === 'phase' ? '阶段大考' : '节点小考'}，coverage 请用「${tier === 'phase' ? '全量' : '定向'}」：\n\n${lines.join('\n\n')}\n\n请按 rubric 打四维分，并用 growth_save_assessment 把这一轮写进历史。`);
        } catch (failure) {
          setPhase('idle');
        }
      };

      // 计划还没开始时没有可考的节点 —— 那就别摆一张卷子。原先页头写「考核 · 计划还没开始」，
      // 下面却摊着三张答题纸，自相矛盾。说清什么时候才有，比给一张空卷子有用。
      // 注意这个提前返回在所有 hook 之后 —— hook 不能有条件。
      if (state.metrics.day === null || state.metrics.day < 1) {
        const left = state.metrics.day === null ? null : 1 - state.metrics.day;
        return h('div', { key: 'notyet', style: S.card }, [
          h('h3', { key: 't', style: S.h3 }, '还没有可考的节点'),
          h('div', { key: 'n', style: S.meta }, left === null
            ? '还没设第 1 天 —— 去「计划」页设定之后，这里会出现第一场考核。'
            : `计划还有 ${String(left)} 天开始。到那天这里会出现第一张考卷（第 1 周那个节点的小考）。`),
        ]);
      }

      return h('div', { className: 'gw-paper', style: { ...S.card, padding: '30px 34px 26px' } }, [
        h('div', { key: 'mast', className: 'gw-masthead' }, [
          h('div', { key: 't', className: 't' }, dayInfo(state.metrics.day).started ? `考核 · 第 ${String(day)} 天` : '考核 · 计划还没开始'),
          h('div', { key: 'right', style: { display: 'flex', alignItems: 'baseline', gap: '16px' } }, [
            h('div', { key: 'd', className: 'd' }, state.today),
            h('button', {
              key: 'swap',
              className: 'swap',
              type: 'button',
              onClick: () => { setOffset((value) => (value + 1) % windows); },
            }, '换一张考卷'),
          ]),
        ]),
        h('div', { key: 'strap', className: 'gw-strap' }, [
          h('span', { key: 'role' }, `方向 ${state.plan.role || '—'}`),
          h('span', { key: 'scope' }, scope),
          // 两档都在这一页上，差别只是出题排序的依据：小考按缺口，大考按高权重项。
          // 切换时把「第几组」归零 —— 池子换了，原来的窗口号没有意义。
          h('span', { key: 'tier', style: { display: 'inline-flex', gap: '6px' } }, [
            h('button', {
              key: 'node',
              type: 'button',
              onClick: () => { setTier('node'); setOffset(0); },
              style: { ...S.chipPlain, fontFamily: 'inherit', cursor: 'pointer', ...(tier === 'node' ? { color: '#fff', background: 'var(--gw-coral, #e56b55)', borderColor: 'var(--gw-coral, #e56b55)' } : {}) },
            }, '节点小考'),
            h('button', {
              key: 'phase',
              type: 'button',
              onClick: () => { setTier('phase'); setOffset(0); },
              style: { ...S.chipPlain, fontFamily: 'inherit', cursor: 'pointer', ...(tier === 'phase' ? { color: '#fff', background: 'var(--gw-coral, #e56b55)', borderColor: 'var(--gw-coral, #e56b55)' } : {}) },
            }, '阶段大考'),
          ]),
          h('span', { key: 'n' }, `共 ${String(take.length)} 题 · 第 ${String(offset + 1)} / ${String(windows)} 组`),
          h('span', { key: 'draft' }, '草稿只在页面上，刷新会丢'),
        ]),
        ...take.map((entry, index) => h('div', { key: entry.question.id, className: 'gw-eq' }, [
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
            onChange: (event) => setAnswers({ ...answers, [entry.question.id]: event.target.value }),
          }),
        ])),
        h('div', { key: 'foot', className: 'foot' }, [
          h('button', {
            key: 'send',
            type: 'button',
            disabled: !ready || phase === 'sent',
            style: { ...S.button, ...S.buttonOn, ...(ready && phase !== 'sent' ? {} : { opacity: '.45', cursor: 'default' }) },
            onClick: () => { void send(); },
          }, phase === 'sent' ? '已交卷 · 等 AI 打分' : '交卷 · 交给 AI 打分'),
          h('span', { key: 'note', style: S.meta }, phase === 'sent'
            ? '已交卷 —— AI 正在你当前的对话里打分，结果会自动写回这一页。'
            : ready
              ? `${String(take.length)} 题都答完了。交卷后 AI 会在你当前的对话里打分 —— 你写的每一个字它都看得见。`
              : `还差 ${String(take.length - filled)} 题没答。答完交卷，AI 按 rubric 打四维分，并把结果与接下来 7 天的调整版任务写回这一页。`),
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
    function ExamSyllabus({ state }) {
      const phases = state.plan.phases;
      if (phases.length === 0) return null;
      const rounds = (state.history ?? []).filter((entry) => entry.kind === 'review');
      const currentIndex = state.metrics.phaseIndex;
      const day = state.metrics.day;
      const kids = [
        h('div', { key: 'head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap' } }, [
          h('h3', { key: 't', style: S.h3 }, '考核目录'),
          h('span', { key: 'n', style: S.meta }, `阶段 ${String(phases.length)} 个 · 节点 ${String(phases.reduce((sum, phase) => sum + ((phase.weeks ?? []).length), 0))} 个 · 已考 ${String(rounds.length)} 轮`),
          // 这张表和上面的卷子是什么关系 —— 不写出来，读者只能自己猜。
          h('div', { key: 'note', style: { ...S.meta, flexBasis: '100%' } }, '上面那张是「现在能考的这一场」；这张表是「一共几场、考过哪些、还欠哪几场」。'),
        ]),
      ];
      phases.forEach((phase, index) => {
        const locked = currentIndex < 0 || index > currentIndex;
        // 这里不摆段位章：段位是「计划」页那套语义（做完一个阶段拿一段），
        // 目录只回答「考过哪些、还欠哪几场」—— 混在一起只会多一层噪音。
        const bigExam = rounds.some((entry) => entry.coverage === '全量' && entry.day >= phase.days[0] && entry.day <= phase.days[1]);
        const rows = [];
        (phase.weeks ?? []).forEach((week) => {
          // 节点落在哪一周：按计划自己的周编号算，和节点的验收标准是同一把尺子。
          const weekStart = (week.week - 1) * 7 + 1;
          const weekEnd = weekStart + 6;
          const taken = rounds.find((entry) => entry.day >= weekStart && entry.day <= weekEnd);
          const state$ = taken !== undefined ? 'done' : (locked ? 'locked' : (day !== null && day > weekEnd ? 'missed' : 'open'));
          rows.push(h('div', { key: `w${String(week.week)}`, style: { display: 'flex', alignItems: 'baseline', gap: '10px', padding: '7px 0 7px 26px', borderTop: '1px solid var(--gw-line-soft, #efeae2)' } }, [
            h('span', { key: 'k', style: { ...S.chipPlain, flex: '0 0 auto', fontFamily: 'var(--gw-mono, monospace)' } }, `第 ${String(week.week)} 周`),
            h('span', { key: 'th', style: { flex: '1 1 auto', minWidth: '0', fontSize: '13px', color: state$ === 'locked' ? 'var(--gw-muted-2, #9aa7b1)' : 'inherit' } }, week.theme ?? ''),
            h('span', { key: 'st', style: { flex: '0 0 auto', fontSize: '12px', fontWeight: '600', color: state$ === 'done' ? 'var(--gw-teal, #2f7d74)' : (state$ === 'missed' ? '#8a5a1f' : 'var(--gw-muted-2, #9aa7b1)'), whiteSpace: 'nowrap' } },
              state$ === 'done' ? `已考 ${String(taken.date ?? '')}` : (state$ === 'missed' ? '待补考' : (state$ === 'locked' ? '未解锁' : '待完成'))),
          ]));
        });
        kids.push(h('div', { key: phase.name, style: { marginTop: '14px' } }, [
          h('div', { key: 'p', style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } }, [
            h('span', { key: 'n', style: { fontSize: '14px', fontWeight: '600', color: locked ? 'var(--gw-muted-2, #9aa7b1)' : 'inherit' } }, `阶段${String(index + 1)} ${phase.name}`),
            h('span', { key: 'd', style: { fontFamily: 'var(--gw-mono, monospace)', fontSize: '11.5px', color: 'var(--gw-muted-2, #9aa7b1)' } }, `${String(phase.days[0])}–${String(phase.days[1])} 天`),
            h('span', { key: 'big', style: { marginLeft: 'auto', fontSize: '12px', fontWeight: '600', color: bigExam ? 'var(--gw-teal, #2f7d74)' : (locked ? 'var(--gw-muted-2, #9aa7b1)' : '#8a5a1f'), whiteSpace: 'nowrap' } },
              bigExam ? '大考已做（全量）' : (locked ? '大考未解锁' : '大考待完成')),
          ]),
          rows.length === 0 ? null : h('div', { key: 'weeks' }, rows),
        ]));
      });
      return h('div', { style: S.card }, kids);
    }

    /** The review tab: history and trend from what the agent wrote. The page never scores. */
    function ReviewTabBody({ state }) {
      const history = state.history;
      const reviews = history.filter((entry) => entry.kind === 'review');
      const curve = state.curve;


      const entryCard = (entry, key) => {
        const head = [
          `${entry.date}（第 ${String(entry.day)} 天）`,
          h('span', { key: 'kind', style: { ...S.chip, marginLeft: '8px' } }, entry.kind === 'review' ? '考核' : '自评'),
        ];
        if (entry.scores === null || entry.scores === undefined) {
          head.push(h('span', { key: 'gap', style: { ...S.fine, marginLeft: '8px' } },
            entry.gap === null || entry.gap === undefined
              ? `已评 ${String(entry.answered ?? 0)} 项`
              : `距达标线 ${String(Math.round(Number(entry.gap) * 100))}% · 已评 ${String(entry.answered ?? 0)} 项`));
        } else {
          head.push(h('span', { key: 'scores', style: { marginLeft: '8px' } },
            Object.entries(entry.scores).map(([dimension, value]) => `${dimension} ${String(value)}`).join(' / ')));
        }
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
        if (entry.report) lines.push(h('pre', { key: 'report', style: S.pre }, entry.report));
        if ((entry.adjustments ?? []).length > 0) {
          lines.push(h('div', { key: 'adj', style: { fontSize: '13px' } }, [
            h('div', { key: 'label', style: S.meta }, '接下来 7 天的调整版任务：'),
            ...entry.adjustments.map((item, index) => h('div', { key: `a${String(index)}`, style: { padding: '2px 0' } },
              `${item['任务标识'] ?? item.id ?? '—'}　${item['一句话动作'] ?? item.action ?? ''}　→ ${item['改了什么'] ?? item.why ?? ''}`)),
          ]));
        }
        return h('div', { key, style: { ...S.row, gap: '18px', alignItems: 'flex-start' } }, [
          h('div', { key: 'body', style: { flex: '1 1 auto', minWidth: '0' } }, lines),
          seal,
        ]);
      };

      return h('div', { style: S.stack }, [
        h(Paper, { key: 'paper', state }),
        // 卷子在上面（现在要做的事），目录在下面（整张地图）—— 目录回答的是「还差哪几次」。
        h(ExamSyllabus, { key: 'syllabus', state }),
        h('div', { key: 'trend', style: S.card }, [
          h('h3', { key: 't', style: S.h3 }, '趋势'),
          h('div', { key: 'counts', style: S.meta }, `历史 ${String(history.length)} 轮（其中考核 ${String(reviews.length)} 轮）`),
          h(TrendChart, { key: 'chart', rounds: reviews }),
          reviews.length === 0 ? null : h('div', { key: 'chartNote', style: S.meta }, '四维得分，各 0-25。自评轮读的是缺口，量纲不同，不进这张图。'),
          h('div', { key: 'note', style: S.meta }, `逐项曲线点 ${String(curve.length)} 个：能力项各自的自评读数，和上面那张四维图不是一回事。`),
          ...(history.length === 0
            ? [h('div', { key: 'empty', style: S.empty }, '还没有记录。')]
            : history.slice().reverse().map((entry, index) => entryCard(entry, `${entry.date}-${String(index)}`))),
        ]),
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

      kids.push(h('div', { key: 'note2', style: S.meta }, active === undefined && !isCustom
        ? '还没选方向。'
        : isCustom
          ? catalog.roleStatus.beta.note
          : `${catalog.roleStatus[active.status]?.note ?? ''}`));
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
        h('div', { key: 'note', style: S.fine }, '这些答案只用来生成底盘候选和能力模型；离开输入框就会保存。'),
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
      if (gap !== null) kids.push(h('div', { key: 'gap', style: S.meta }, `距达标线 ${String(Math.round(gap * 100))}%（每项 3 分算达标）`));
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
      const { state, error, post } = useWorkbench();
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
        today: () => h(TodayBody, { state, post, compact: false }),
        plan: () => h(PlanTabBody, { state, post }),
        review: () => h(ReviewTabBody, { state }),
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
           h(WorkbenchHeader, { key: 'header', state, onNavigate: navigate, hideNext: tab === 'profile', currentTab: tab }),
           bodies[tab](),
         ])),
      ]);
    }

    /** Compact execution card for the narrow right sidebar. */
    function RightTaskCard({ task, entry, post }) {
      const done = entry?.done === true;
      const evidence = entry?.evidence ?? '';
      const tier = entry?.tier ?? '';
      const save = (patch) => post('/checkin', { taskId: task.id, ...patch });
      return h('div', { 'data-task-id': task.id, style: { display: 'flex', flexDirection: 'column', gap: '12px', padding: '15px', borderRadius: '16px', background: done ? 'var(--gw-teal-soft, rgba(47,125,116,.12))' : '#fffdf9', border: `1px solid ${done ? 'rgba(47,125,116,.28)' : '#e5dfd5'}`, boxShadow: '0 8px 18px rgba(54,42,32,.05)' } }, [
        h('div', { key: 'eyebrow', style: { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' } }, [
          h('span', { key: 'ref', style: { fontSize: '12px', fontFamily: 'var(--gw-mono, monospace)', color: 'var(--gw-coral-deep, #a64132)' } }, `${task.id} / ${task.ref}`),
          h('span', { key: 'done', style: { fontSize: '13px', fontWeight: '700', color: done ? 'var(--gw-teal, #2f7d74)' : 'var(--gw-muted, #718096)' } }, `${done ? '已完成' : '未完成'} · ${String(task.minutes)} 分钟`),
        ]),
        h('div', { key: 'title', style: { display: 'flex', gap: '11px', alignItems: 'flex-start' } }, [
          // 和左边同一套完成反馈：可填色的方框 + 白勾，完成时落一枚印章 ——
          // 原生 checkbox 既不能填色也不能盖章，而这一下正是最要紧的反馈。
          h('button', {
            key: 'box',
            type: 'button',
            role: 'checkbox',
            'aria-checked': done,
            'aria-label': task.action,
            style: { marginTop: '1px', flex: '0 0 auto', width: '24px', height: '24px', padding: '0', display: 'grid', placeItems: 'center', borderRadius: '8px', cursor: 'pointer', transition: 'background 160ms ease, border-color 160ms ease', border: `2px solid ${done ? 'var(--gw-teal, #2f7d74)' : 'var(--gw-line, #e5dfd5)'}`, background: done ? 'var(--gw-teal, #2f7d74)' : '#fff' },
            onClick: () => { void save({ done: !done }); },
          }, [
            done ? h('span', { key: 'tick', style: { width: '10px', height: '6px', borderLeft: '2px solid #fff', borderBottom: '2px solid #fff', transform: 'rotate(-45deg) translate(1px, -1px)' } }) : null,
          ]),
          h('span', { key: 'text', style: { fontSize: '15px', fontWeight: '600', lineHeight: '1.45', textDecoration: done ? 'line-through' : 'none', opacity: done ? '.6' : '1', cursor: 'pointer' }, onClick: () => { void save({ done: !done }); } }, task.action),
        ]),
        // 印章放在一行里 —— 直接挂在列容器下会被拉伸成通栏大框（窄栏里尤其明显）。
        done ? h('div', { key: 'markRow', style: { display: 'flex' } }, [h(Seal, { key: 'mark', tone: 'teal', label: '已完成', stamp: true })]) : null,
        h('div', { key: 'minimum', style: { padding: '10px 11px', borderRadius: '10px', background: '#f3efe8', fontSize: '13px', lineHeight: '1.55', color: '#59645f' } }, [
          h('strong', { key: 'label', style: { color: '#253b39' } }, '最低完成版本'),
          ` ${task.minimumVersion}`,
        ]),
        h('div', { key: 'evidence', style: { display: 'flex', flexDirection: 'column', gap: '7px' } }, [
          h('label', { key: 'label', style: { fontSize: '12px', color: 'var(--gw-muted, #718096)' } }, '做完后留一条证据'),
          h('input', { key: 'input', style: { ...S.input, width: '100%', boxSizing: 'border-box', fontSize: '13px' }, placeholder: '链接、文件名或一句结果', defaultValue: evidence, 'aria-label': '任务证据', onBlur: (event) => { if (event.target.value !== evidence) void save({ evidence: event.target.value }); } }),
          h('select', { key: 'select', style: { ...S.select, width: '100%' }, value: tier, 'aria-label': '证据档位', onChange: (event) => { void save({ tier: event.target.value || null }); } }, [
            h('option', { key: 'none', value: '' }, '选择证据档位'),
            h('option', { key: 'self', value: '自述' }, '自述：我完成了'),
            h('option', { key: 'process', value: '过程' }, '过程：草稿 / 笔记'),
            h('option', { key: 'result', value: '成果' }, '成果：链接 / 报告 / 截图'),
          ]),
        ]),
      ]);
    }

    /** The right sidebar is a glanceable execution surface, not a shrunken main page. */
    function TodayTab() {
      const { state, error, post } = useWorkbench();
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
        activity === null ? null : h('div', { key: 'activity', role: 'status', 'aria-live': 'polite', style: { padding: '11px 12px', borderRadius: '12px', fontSize: '13px', lineHeight: '1.5', background: activity.status === 'completed' ? 'var(--gw-teal-soft, rgba(47,125,116,.12))' : activity.status === 'error' ? '#fff0ed' : '#eef2f0', border: `1px solid ${activity.status === 'completed' ? 'rgba(47,125,116,.28)' : activity.status === 'error' ? '#f3c5be' : '#d5e0da'}` } }, activity.status === 'completed' ? 'AI 已返回，今日面板已自动更新。' : activity.status === 'error' ? `AI 处理失败：${activity.error}` : 'AI 正在处理，完成后这里会自动更新。'),
        task === undefined ? h('div', { key: 'empty', style: { padding: '16px', borderRadius: '16px', background: '#253b39', color: '#fff' } }, [h('div', { key: 'label', style: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', opacity: '.65' } }, '下一步'), h('div', { key: 'title', style: { fontSize: '16px', fontWeight: '700', marginTop: '6px' } }, state.nextAction?.label ?? '今天没有待办'), h('div', { key: 'reason', style: { fontSize: '13px', lineHeight: '1.55', opacity: '.78', marginTop: '6px' } }, state.nextAction?.reason ?? '去成长工作台查看完整计划。'),
            // 只在真有下一步时指路 —— 没有动作时那句会回退成「去…「今日」页」，
            // 而这张卡本身就在今日这一侧，等于让人去他已经站着的地方。
            state.nextAction === null || state.nextAction === undefined ? null
              : h('div', { key: 'where', style: { fontSize: '12.5px', opacity: '.72', marginTop: '7px' } },
                `去左侧「成长工作台」的「${(TABS.find((entry) => entry.id === state.nextAction?.targetTab) ?? {}).label ?? '今日'}」页`),
          ]) : h(RightTaskCard, { key: task.id, task, entry: state.progress.tasks?.[task.id], post }),
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

    /** Services this plugin needs: both registries, the slot registry, and panel navigation. */
    const inject = ['sidebarRightTabs', 'slots', 'sidebarRight'];

    /** Reveal the right tab once the sidebar seat is mounted. */
    function revealTabWhenReady(ctx) {
      let attempts = 0;
      let timer;
      const tick = () => {
        timer = undefined;
        if (attempts >= 40) return;
        attempts += 1;
        try {
          ctx.sidebarRight.openTab(TAB_KIND);
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

      registerLeftMenu(ctx);
      ctx.effect(() => ctx.sidebarRightTabs.register(definition()), 'dsh-growth-workbench: tab type');
      ctx.effect(
        () => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
        }, TodayTab)),
        'dsh-growth-workbench: tab body',
      );
      ctx.effect(() => revealTabWhenReady(ctx), 'dsh-growth-workbench: reveal the tab');
    }

    return { apply, inject };
  },
});
