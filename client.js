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
        + '@media (prefers-reduced-motion:reduce){.gw-step,.gw-step .gw-step-edit,.gw-tf,.gw-tf .gw-tf-no{transition:none}.gw-step:active{transform:none}}';
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
     * @returns `{ queued }` — whether the session was already busy when it landed.
     */
    async function askAgent(text) {
      if (rootCtx === undefined) throw new Error('工作台还没挂载完成，稍后重试');
      // 幂等：同一条指令还在跑（或已排进队列、结果还没落盘）时不再发第二条。
      // 模块确认按钮上的自动触发是直接调这里的，绕过了 AskButton 那道 sendInFlight 闸 ——
      // 连点两下确认就是两次 Agent 运行，而它们要写的是同一份候选。
      if (agentActivity !== null && agentActivity !== undefined
        && (agentActivity.status === 'running' || agentActivity.status === 'queued')
        && agentActivity.text === text) return { queued: true };
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
          setNote(outcome.queued ? '已排进对话（前面还有一条在跑，跑完就到它）' : '已发进对话 —— 切过去就能看到它开始干活');
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
      page: { '--gw-paper': '#f8f6f1', '--gw-ink': '#1f2933', '--gw-muted': '#718096', '--gw-line': '#e5dfd5', '--gw-line-soft': '#eee9e1', '--gw-coral': '#e56b55', '--gw-coral-deep': '#a64132', '--gw-display': 'Calistoga, Georgia, serif', '--gw-body': 'Inter, system-ui, sans-serif', '--gw-mono': 'JetBrains Mono, ui-monospace, monospace', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', color: 'var(--gw-ink)', background: 'var(--gw-paper)', fontFamily: 'var(--gw-body)' },
      tabbar: { display: 'flex', gap: '6px', padding: '16px 30px 0', borderBottom: '1px solid var(--gw-line, #e5dfd5)', background: 'var(--gw-paper, #f8f6f1)', position: 'sticky', top: 0, zIndex: 2 },
      tab: { padding: '10px 14px 12px', fontSize: '14px', fontWeight: '600', font: 'inherit', cursor: 'pointer', color: 'var(--gw-muted, #718096)', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', borderRadius: '8px 8px 0 0', transition: 'color 180ms ease, border-color 180ms ease' },
      tabOn: { color: 'var(--gw-ink, #1f2933)', borderBottom: '2px solid var(--gw-coral, #e56b55)' },
      body: { flex: '1 1 auto', overflowY: 'auto', padding: '28px 30px 56px', background: 'radial-gradient(circle at 82% 8%, rgba(229,107,85,.12), transparent 28%), var(--gw-paper, #f8f6f1)' },
      inner: { maxWidth: '1060px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' },
      stack: { display: 'flex', flexDirection: 'column', gap: '20px' },
      card: { border: '1px solid var(--gw-line, #e5dfd5)', borderRadius: '18px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255,255,255,.78)', boxShadow: '0 12px 30px rgba(54,42,32,.06)' },
      h2: { margin: '0', fontFamily: 'var(--gw-display, Calistoga, Georgia, serif)', fontSize: '25px', lineHeight: '1.15', fontWeight: '400', letterSpacing: '-.02em' },
      h3: { margin: '0', fontSize: '16px', fontWeight: '700', letterSpacing: '.01em' },
      meta: { fontSize: '13px', color: 'var(--gw-muted, #718096)', lineHeight: '1.7' },
      fine: { fontSize: '12px', color: 'var(--gw-muted, #718096)', lineHeight: '1.6' },
      row: { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--gw-line-soft, #eee9e1)' },
      input: { flex: '1 1 auto', minWidth: '0', padding: '11px 14px', fontSize: '14px', font: 'inherit', color: 'inherit', background: '#fffdf9', borderRadius: '10px', border: '1px solid var(--gw-line, #e5dfd5)', outline: 'none' },
      button: { padding: '11px 16px', minHeight: '44px', fontSize: '14px', fontWeight: '600', font: 'inherit', cursor: 'pointer', color: 'var(--gw-ink, #1f2933)', background: '#fffdf9', borderRadius: '10px', border: '1px solid var(--gw-line, #d9d0c4)', transition: 'transform 150ms ease, background 150ms ease, border-color 150ms ease' },
      buttonOn: { borderColor: 'var(--gw-coral, #e56b55)', background: 'var(--gw-coral, #e56b55)', color: '#fff' },
      buttonLight: { borderColor: 'var(--gw-coral, #e56b55)', color: 'var(--gw-coral-deep, #a64132)' },
      small: { padding: '7px 12px', minHeight: '32px', fontSize: '13px' },
      select: { padding: '10px 12px', fontSize: '13px', font: 'inherit', color: 'inherit', background: '#fffdf9', borderRadius: '10px', border: '1px solid var(--gw-line, #d9d0c4)' },
      chip: { display: 'inline-block', padding: '4px 9px', fontSize: '12px', borderRadius: '999px', color: 'var(--gw-coral-deep, #a64132)', background: 'rgba(229,107,85,.11)', border: '1px solid rgba(229,107,85,.2)' },
      error: { fontSize: '13px', color: '#b33a2d', background: '#fff0ed', border: '1px solid #f3c5be', borderRadius: '10px', padding: '11px 14px' },
      warn: { fontSize: '13px', color: '#8a5a1f', background: '#fdf7e8', border: '1px solid #ecd9a8', borderRadius: '10px', padding: '11px 14px' },
      empty: { fontSize: '14px', color: 'var(--gw-muted, #718096)', padding: '14px 0' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px', display: 'block', overflowX: 'auto' },
      th: { textAlign: 'left', padding: '9px 8px', borderBottom: '1px solid var(--gw-line, #e5dfd5)', fontWeight: '700', whiteSpace: 'nowrap', color: 'var(--gw-muted, #718096)' },
      td: { padding: '9px 8px', borderBottom: '1px solid var(--gw-line-soft, #eee9e1)', verticalAlign: 'top', minWidth: '90px' },
      pre: { margin: '0', padding: '12px 14px', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f3efe8', borderRadius: '10px' },
      inline: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
      wrap: { display: 'flex', gap: '7px', flexWrap: 'wrap' },
      spread: { display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '14px' },
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

    function ProfileModule({ label, summary, done, open, onOpen, onConfirm, confirmLabel, children }) {
      if (!open) return h(CollapsedModule, { label, summary, done, onEdit: onOpen });
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, [
        children,
        h('div', { key: 'confirm', style: { display: 'flex', justifyContent: 'flex-end' } }, h('button', { type: 'button', style: { ...S.button, ...S.buttonOn }, onClick: onConfirm }, confirmLabel ?? `确认${label}，继续 →`)),
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
          h('input', {
            key: 'box',
            type: 'checkbox',
            checked: done,
            style: { marginTop: '3px', cursor: 'pointer' },
            'aria-label': task.action,
            onChange: (event) => { void save({ done: event.target.checked }); },
          }),
          h('div', { key: 'text', style: { flex: '1 1 auto', minWidth: '0' } }, [
            h('div', {
              key: 'action',
              style: {
                fontSize: '14px', lineHeight: '1.6', cursor: 'pointer', wordBreak: 'break-word',
                textDecoration: done ? 'line-through' : 'none', opacity: done ? '0.6' : '1',
              },
              onClick: () => { void save({ done: !done }); },
            }, `${task.id}（${task.ref}）${task.action}`),
            h('div', { key: 'meta1', style: { ...S.fine, marginTop: '2px' } },
              `能力项 ${task.capability}　预计 ${String(task.minutes)} 分钟　最低完成版本：${task.minimumVersion}`),
            h('div', { key: 'meta2', style: { ...S.fine, marginTop: '2px' } },
              `完成标准：${task.doneCriteria}　|　可接受证据：${task.acceptableEvidence}`),
          ]),
          h('span', { key: 'days', style: S.chip }, `打卡 ${String(days)} 天`),
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
          h('select', {
            key: 'select',
            style: S.select,
            value: tier,
            'aria-label': '证据档位',
            onChange: (event) => {
              setTier(event.target.value);
              void save({ tier: event.target.value === '' ? null : event.target.value });
            },
          }, [
            h('option', { key: 'none', value: '' }, '档位：未交证据'),
            h('option', { key: 'self', value: '自述' }, '自述（只有口头说明）'),
            h('option', { key: 'process', value: '过程' }, '过程（草稿 / 笔记）'),
            h('option', { key: 'result', value: '成果' }, '成果（链接 / 报告 / 截图）'),
          ]),
        ]),
      ]);
    }

    /** The metrics strip the page and the tab both show. */
    function Metrics({ state }) {
      const { metrics, focus } = state;
      const rate = metrics.completion.rate;
      const kids = [
        h('div', { key: 'numbers', style: S.spread }, [
          h('span', { key: 'day' }, `第 ${metrics.day === null ? '—' : String(Math.max(1, metrics.day))} 天`),
          h('span', { key: 'phase' }, `阶段：${metrics.phaseName || '—'}`),
          h('span', { key: 'rate' }, `完成率 ${String(metrics.completion.done)}/${String(metrics.completion.total)}${rate === null ? '' : `（${String(Math.round(rate * 100))}%）`}`),
          h('span', { key: 'streak' }, `连续打卡 ${String(metrics.streak)} 天`),
          h('span', { key: 'week' }, `本周完成率 ${metrics.weekRate === null ? '—' : `${String(Math.round(metrics.weekRate * 100))}%`}`),
        ]),
        h('div', { key: 'evidence', style: S.meta },
          `证据：成果 ${String(metrics.evidence.成果)} / 过程 ${String(metrics.evidence.过程)} / 自述 ${String(metrics.evidence.自述)} / 无 ${String(metrics.evidence.无证据)}`),
      ];
      if (state.plan.planStart === '') {
        kids.push(h('div', { key: 'warn', style: S.warn },
          '计划还没有起始日 —— 去「计划」页设定第 1 天。'));
      }
      if (focus !== undefined && focus.scheduled === false) {
        kids.push(h('div', { key: 'nosched', style: S.meta }, '今天没有排到天的任务，下面是接下来的未完成任务。'));
      }
      return h('div', { style: S.card }, kids);
    }

    /** Today's body, shared by the page tab and the right-sidebar tab. */
    function TodayBody({ state, post, compact }) {
      const kids = [];
      if (!compact) kids.push(h(Metrics, { key: 'metrics', state }));
      const rows = state.focus.tasks.length === 0
        ? [h('div', { key: 'empty', style: S.empty }, state.plan.phases.length === 0
          ? '还没有计划。完成「画像」后就能生成。'
          : '计划里没有待办任务。')]
        : state.focus.tasks.slice(0, 1).map((task) => h(TaskRow, { key: task.id, task, entry: state.progress.tasks?.[task.id], post }));
      kids.push(h('div', { key: 'card', style: S.card }, [
        h('h3', { key: 'title', style: S.h3 }, state.focus.scheduled ? '今天要做' : '接下来要做'),
        ...rows,
      ]));
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: compact ? '8px' : '18px' } }, kids);
    }

    function WorkbenchHeader({ state, onNavigate, hideNext }) {
      const action = state.nextAction;
      const [activity, setActivity] = useState(agentActivity);
      useEffect(() => subscribeActivity(setActivity), []);
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, [
        h('div', { key: 'intro', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' } }, [
          h('div', { key: 'copy' }, [
            h('div', { key: 'eyebrow', style: { ...S.fine, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--gw-coral-deep, #a64132)' } }, '成长手记'),
            h('h1', { key: 'title', style: { ...S.h2, fontSize: '34px', marginTop: '7px' } }, state.profile.targetRole ? `向 ${state.profile.targetRole} 走` : '把成长，变成下一步'),
            h('div', { key: 'sub', style: S.meta }, state.profile.positioning || '不是填表，而是把今天真正做成一小步。'),
          ]),
          h('div', { key: 'day', style: { ...S.chip, fontFamily: 'var(--gw-mono, monospace)' } }, state.metrics.day === null ? 'DAY --' : `DAY ${String(Math.max(1, state.metrics.day)).padStart(2, '0')}`),
        ]),
        action === undefined || hideNext === true ? null : h('div', { key: 'next', style: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', padding: '16px 18px', borderRadius: '15px', background: 'linear-gradient(100deg, #253b39, #36534d)', color: '#fff', boxShadow: '0 14px 28px rgba(37,59,57,.16)' } }, [
          h('div', { key: 'copy', style: { flex: '1 1 260px' } }, [
            h('div', { key: 'label', style: { fontSize: '12px', opacity: '.7', textTransform: 'uppercase', letterSpacing: '.12em' } }, '下一步'),
            h('div', { key: 'title', style: { fontSize: '17px', fontWeight: '700', marginTop: '4px' } }, action.label),
            h('div', { key: 'reason', style: { fontSize: '13px', opacity: '.78', marginTop: '4px', lineHeight: '1.5' } }, action.reason),
          ]),
          h('button', { key: 'go', type: 'button', style: { ...S.button, background: '#f3c26b', borderColor: '#f3c26b', color: '#253b39' }, onClick: () => onNavigate(action.targetTab, action.targetAnchor) }, '现在去做 →'),
        ]),
        activity === null ? null : h('div', { key: 'activity', role: 'status', 'aria-live': 'polite', style: { ...S.meta, padding: '9px 12px', borderRadius: '10px', background: activity.status === 'error' ? '#fff0ed' : activity.status === 'completed' ? '#edf7ef' : '#f3efe8' } }, activity.status === 'completed' ? 'AI 已返回结果，页面已自动更新。' : activity.status === 'error' ? `AI 处理失败：${activity.error}` : activity.status === 'queued' ? 'AI 已接手，页面会自动刷新结果，不需要守着对话。' : '正在把请求送进当前对话…'),
      ]);
    }


    /** The plan tab: goal, phases with their day intervals, the task contract, self-check, portfolio. */
    function PlanTabBody({ state, post }) {
      const plan = state.plan;
      const [startDraft, setStartDraft] = useState(plan.planStart ?? '');
      useEffect(() => { setStartDraft(plan.planStart ?? ''); }, [plan.planStart]);

      if (plan.phases.length === 0) {
        const ready = state.profile.targetRole.length > 0 && state.catalog.missingBackground.length === 0 && state.catalog.activeRole !== null;
        return h('div', { 'data-anchor': 'plan-empty', style: S.card }, [
          h('h2', { key: 't', style: S.h2 }, '还没有计划'),
          h('div', { key: 'a', style: S.meta }, '完成「画像」里的四项，就能让 AI 写计划了。'),
          h('div', { key: 'act', style: S.inline }, [
            h(AskButton, { key: 'btn', text: '帮我生成成长计划', label: '让 AI 生成计划', style: S.buttonOn,
              done: plan.phases.length > 0,
              hint: '它会读你的画像，写出总目标和分阶段任务。' }),
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
        h('h2', { key: 't', style: S.h2 }, plan.goal || '（未写总目标）'),
        h('div', { key: 'meta', style: S.meta }, `方向：${plan.role}　路线：${plan.route}`),
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
            style: S.button,
            type: 'button',
            onClick: () => { void post('/plan-start', { date: startDraft }); },
          }, '保存'),
          h('span', { key: 'note', style: S.meta }, '计划的第 1 天，决定「第几天」与周次。'),
        ]),
      ]));

      plan.phases.forEach((phase, index) => {
        const body = [
          h('h3', { key: 'title', style: S.h3 }, `阶段${String(index + 1)} ${phase.name}（第 ${String(phase.days[0])}-${String(phase.days[1])} 天）`),
          h('div', { key: 'goal', style: S.meta }, `阶段目标：${phase.goal}`),
          h('div', { key: 'project', style: S.meta }, `实战项目：${phase.project || '—'}`),
          h('div', { key: 'criteria', style: S.meta }, `考核标准：${phase.criteria || '—'}`),
        ];
        if (phase.tasks.length === 0) {
          const weeks = (phase.weeks ?? []).map((week) => `第${String(week.week ?? '?')}周：${week.theme ?? ''}`).join('；');
          body.push(h('div', { key: 'weeks', style: S.empty }, `只排到周，尚未细化到天。${weeks}`));
        } else {
          const columns = ['标识', '引用', '天', '一句话动作', '能力项', '预计', '最低完成版本', '完成标准', '可接受证据', '依赖'];
          const cells = (task) => [
            task.id, task.ref, task.day === null ? '—' : String(task.day), task.action, task.capability,
            String(task.minutes), task.minimumVersion, task.doneCriteria, task.acceptableEvidence, task.dependsOn,
          ].map((text, column) => h('td', { key: columns[column], style: S.td }, text));
          body.push(h('table', { key: 'table', style: S.table }, [
            h('thead', { key: 'head' }, h('tr', null, columns.map((label) => h('th', { key: label, style: S.th }, label)))),
            h('tbody', { key: 'body' }, phase.tasks.map((task) => h('tr', { key: task.id }, cells(task)))),
          ]));
        }
        kids.push(h('div', { key: `phase-${String(index)}`, style: S.card }, body));
      });

      if (plan.selfCheck.length > 0) {
        kids.push(h('div', { key: 'selfcheck', style: S.card }, [
          h('h3', { key: 't', style: S.h3 }, '考核自查（只有题目）'),
          h('div', { key: 'note', style: S.meta }, '考核时抽 2-3 题现场作答，答案由你给。'),
          ...plan.selfCheck.map((item) => h('div', { key: item.id, style: { fontSize: '14px', padding: '3px 0' } },
            `[${item.id}]（${item.phase}）${item.question}　→ 能力项 ${item.capability}`)),
        ]));
      }

      if (plan.portfolio.length > 0) {
        kids.push(h('div', { key: 'portfolio', style: S.card }, [
          h('h3', { key: 't', style: S.h3 }, '作品集清单'),
          ...plan.portfolio.map((item, index) => h('div', { key: `p${String(index)}`, style: { fontSize: '14px' } },
            `${item.phase ?? ''}　${item.item ?? JSON.stringify(item)}`)),
        ]));
      }

      return h('div', { style: S.stack }, kids);
    }

    // ---------------------------------------------------------------- 考核

    /** The review tab: history and trend from what the agent wrote, plus manual registration. */
    function ReviewTabBody({ state, post }) {
      const history = state.history;
      const reviews = history.filter((entry) => entry.kind === 'review');
      const curve = state.curve;
      const [draft, setDraft] = useState({ 完成率: 0, 证据质量: 0, 作品达标度: 0, 知识考核: 0 });

      const entryCard = (entry, key) => {
        const head = [
          `${entry.date}（第 ${String(entry.day)} 天）`,
          h('span', { key: 'kind', style: { ...S.chip, marginLeft: '8px' } }, entry.kind === 'review' ? '考核' : '自评'),
        ];
        if (entry.scores === null || entry.scores === undefined) {
          head.push(h('span', { key: 'gap', style: { ...S.fine, marginLeft: '8px' } },
            `gap ${entry.gap === null || entry.gap === undefined ? '—' : Number(entry.gap).toFixed(2)}，已确认 ${String(entry.answered ?? 0)} 项`));
        } else {
          head.push(h('span', { key: 'scores', style: { marginLeft: '8px' } },
            Object.entries(entry.scores).map(([dimension, value]) => `${dimension} ${String(value)}`).join(' / ')));
        }
        if (entry.total !== undefined && entry.total !== null) {
          head.push(h('span', { key: 'total', style: { marginLeft: '8px', fontWeight: '600' } }, `总分 ${String(entry.total)}（${entry.grade}）`));
        }
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
        return h('div', { key, style: { ...S.row, flexDirection: 'column', alignItems: 'stretch' } }, lines);
      };

      return h('div', { style: S.stack }, [
        h('div', { key: 'intro', style: S.card }, [
          h('h2', { key: 't', style: S.h2 }, '考核'),
          h('div', { key: 'note', style: S.meta }, '四维各 25 分：完成率 / 证据质量 / 作品达标度 / 知识考核。'),
          h('div', { key: 'act', style: S.inline }, [
            // 反复发生的动作 → 不带 `done`：点完冷却一会儿就重新可用。
            h(AskButton, { key: 'ask', text: '考核我', label: '让 AI 现在考核', style: S.buttonOn,
              hint: '它会读进度、打分、写回这一页，并给出接下来 7 天的调整版任务。' }),
          ]),
        ]),
        h('div', { key: 'trend', style: S.card }, [
          h('h3', { key: 't', style: S.h3 }, '趋势'),
          h('div', { key: 'counts', style: S.meta }, `历史 ${String(history.length)} 轮（其中考核 ${String(reviews.length)} 轮）　能力曲线点 ${String(curve.length)} 个`),
          h('div', { key: 'note', style: S.meta }, '只测了部分能力项的轮次会记进历史，但不画线。'),
          ...(history.length === 0
            ? [h('div', { key: 'empty', style: S.empty }, '还没有记录。')]
            : history.slice().reverse().map((entry, index) => entryCard(entry, `${entry.date}-${String(index)}`))),
        ]),
        h('div', { key: 'manual', style: S.card }, [
          h('h3', { key: 't', style: S.h3 }, '手工登记一次考核成绩'),
          h('div', { key: 'note', style: S.meta }, '如果 AI 已经把这次考核写进历史，这里不用再登记。'),
          h('div', { key: 'form', style: S.inline }, [
            ...['完成率', '证据质量', '作品达标度', '知识考核'].map((dimension) => h('label', {
              key: dimension,
              style: { fontSize: '13px', display: 'flex', gap: '4px', alignItems: 'center' },
            }, [
              dimension,
              h('input', {
                key: 'input',
                type: 'number',
                min: 0,
                max: 25,
                style: { ...S.input, width: '64px', flex: '0 0 auto', padding: '4px 6px' },
                value: draft[dimension],
                onChange: (event) => setDraft({ ...draft, [dimension]: Number(event.target.value) }),
              }),
            ])),
            h('button', {
              key: 'submit',
              style: S.button,
              type: 'button',
              onClick: () => { void post('/assessment', { scores: draft, day: Math.max(1, state.metrics.day ?? 1) }); },
            }, '登记'),
          ]),
        ]),
      ]);
    }

    // ---------------------------------------------------------------- 画像

    /** Step ①: direction — the catalog, plus a free-text one. */
    function DirectionForm({ state, post, draft, setDraft, commit }) {
      const { catalog, profile } = state;
      const active = catalog.roles.find((entry) => entry.slug === profile.targetRoleSlug);
      const isCustom = profile.targetRoleSlug === catalog.customSlug;
      // 「正在自己起一个名字」是这一屏的两种状态之一：打字时下面的目录不再高亮，
      // 这样「从目录里选」和「自己填」才是互斥的二选一，而不是两个都像被选中。
      const typing = draft.trim().length > 0;

      const kids = [
        h('h3', { key: 't', style: S.h3 }, '目标岗位'),
        h('div', { key: 'pick', style: S.meta }, '从目录里选'),
        h('div', { key: 'choices', style: S.wrap }, catalog.roles.map((entry) => h('button', {
          key: entry.slug,
          type: 'button',
          style: { ...S.button, ...(!typing && profile.targetRoleSlug === entry.slug ? S.buttonOn : {}) },
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
      return h('div', { 'data-anchor': 'direction', style: S.card }, kids);
    }

    /** Step ②: the growth choices, with route first. */
    function IntakeForm({ state, post, bgDraft, setBgDraft }) {
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
      return h('div', { 'data-anchor': 'intake', style: S.card }, [
        h('h3', { key: 't', style: S.h3 }, '你的条件'),
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
    function TransferableForm({ state, post }) {
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
        h('h3', { key: 't', style: S.h3 }, '可迁移能力'),
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
      return h('div', { 'data-anchor': 'transferable', style: S.card }, kids);
    }

    /**
     * One capability item's 1 / 3 / 5 anchors, as a single line.
     *
     * This was a call to a helper that was never defined anywhere: the first item threw
     * `ReferenceError` on render, so opening ⑤ with a model in force showed nothing at
     * all. The three anchors are the one thing that has to stay on screen while the
     * user scores — they are why the scoring happens on a page and not in a chat.
     */
    const anchorText = (item) => (item.anchors ?? [])
      .map((text, index) => `${String([1, 3, 5][index] ?? index + 1)}　${text}`)
      .join('　·　')

    /** Step ⑤: the self-assessment — every item with its anchors on screen, one click each. */
    function SelfAssessmentForm({ state, post }) {
      const { catalog, profile } = state;
      const role = catalog.activeRole;
      const busy = useAgentBusy();
      const [scores, setScores] = useState(() => ({ ...(profile.selfAssessment?.scores ?? {}) }));
      useEffect(() => {
        setScores({ ...(profile.selfAssessment?.scores ?? {}) });
      }, [profile.selfAssessment?.date]);

      // 没有模型就没有逐项锚点 —— 没有锚点的自评是 20 个互不可比的数，所以这里
      // 不退化成一个通用问卷，而是把"去生成一份"这条路指出来。
      if (role === null || role === undefined) {
        const canBuild = catalog.missingBackground.length === 0 && profile.targetRole.length > 0;
        return h('div', { style: S.card }, [
          h('h3', { key: 't', style: S.h3 }, '能力自评'),
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

      const answered = Object.keys(scores).length;
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
        h('h3', { key: 't', style: S.h3 }, '能力自评'),
        h('div', { key: 'source', style: S.fine }, `模型：${role.name} · ${String(role.groups.length)} 组 / ${String(role.items.length)} 项`),
        // 生成的模型与预置模型可信度不同，这个区别必须在打分的地方说明，而不是藏在别处。
        sourceNote === null || source === 'preset' ? null
          : h('div', { key: 'uncal', style: S.warn }, `${sourceNote.note}`),
        h('div', { key: 'note', style: S.meta },
          '带锚点打分：每项都给你 1 / 3 / 5 的原文。'
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

      for (const group of role.groups) {
        const items = role.items.filter((item) => item.group === group.key);
        kids.push(h('div', { key: group.key, style: { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' } }, [
          h('div', { key: 'title', style: { fontSize: '13px', fontWeight: '600' } }, `${group.key}. ${group.name}（组权重 ${String(group.weight)}%）`),
          ...items.map((item) => h('div', { key: item.id, style: { ...S.row, flexDirection: 'column', alignItems: 'stretch', gap: '4px' } }, [
            h('div', { key: 'choose', style: { ...S.inline, gap: '8px' } }, [
              h('span', { key: 'name', style: { fontSize: '14px', minWidth: '150px' } }, `${item.id} ${item.name}`),
              ...[1, 2, 3, 4, 5].map((value) => h('button', {
                key: `v${String(value)}`,
                type: 'button',
                'data-item': item.id,
                'data-value': String(value),
                style: { ...S.button, ...S.small, ...(scores[item.id] === value ? S.buttonOn : {}) },
                onClick: () => set(item.id, value),
              }, String(value))),
              h('button', {
                key: 'unknown',
                type: 'button',
                'data-item': item.id,
                'data-value': 'unknown',
                  title: '1/3/5 之间拿不准，或者对这一项不熟悉 —— 两种情况都算',
                // 不按"未答"高亮：选「拿不准」会删掉那个键，所以"没答过"与"答了拿不准"在数据上
                // 是同一个状态 —— 把未答画成已选，会让 19 项看起来全都答完了。
                style: { ...S.button, ...S.small },
                onClick: () => set(item.id, null),
              }, '拿不准'),
            ]),
            h('div', { key: 'anchors', style: S.fine }, anchorText(item)),
          ])),
        ]));
      }

      kids.push(h('div', { key: 'submit', style: S.inline }, [
        h('button', {
          key: 'go',
          style: { ...S.button, ...S.buttonOn },
          type: 'button',
          onClick: () => { void post('/self-assessment', { scores }); },
        }, `提交自评（已确认 ${String(answered)} / ${String(role.items.length)} 项）`),
        h('span', { key: 'gap', style: S.meta }, gap === null ? '还没法算' : `离达标线还差 ${gap.toFixed(2)} 分（每项 3 分算达标）`),
      ]));

      if (state.metrics.priorities.length > 0) {
        kids.push(h('div', { key: 'prio' }, [
          h('div', { key: 'label', style: S.meta }, '补强优先级（差得多、又重要的排前面）：'),
          ...state.metrics.priorities.slice(0, 6).map((item) => h('div', { key: item.id, style: { fontSize: '13px' } },
            `${item.id} ${item.name}：${String(item.score)} 分（缺口 ${String(item.shortfall)}，权重 ${String(item.weight)}）`)),
        ]));
      }
      if (state.metrics.unansweredGroups.length > 0) {
        kids.push(h('div', { key: 'unanswered', style: S.meta },
          `本读数不含 ${state.metrics.unansweredGroups.join('、')} 组，和上一轮比时留意口径不同。`));
      }

      return h('div', { 'data-anchor': 'self', style: S.card }, kids);
    }

    function ProfileFlow({ state, post, onNavigate }) {
      const profile = state.profile;
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
      const startCapabilityModel = () => {
        if (state.catalog.activeRole === null) void askAgent('帮我建这个方向的能力模型');
      };
      return h('div', { style: S.stack }, [
        h(ProfileModule, { key: 'direction', label: '目标岗位', summary: summary.direction, done: done.direction, open: open === 'direction', onOpen: () => setOpen('direction'), onConfirm: confirmRole, children: h(DirectionForm, { state, post, draft: roleDraft, setDraft: setRoleDraft, commit: saveRole }) }),
        h(ProfileModule, { key: 'intake', label: '你的条件', summary: summary.intake, done: done.intake, open: open === 'intake', onOpen: () => setOpen('intake'), onConfirm: confirmIntake, children: h(IntakeForm, { state, post, bgDraft, setBgDraft }) }),
        h(ProfileModule, { key: 'transferable', label: '可迁移能力', summary: summary.transferable, done: done.transferable, open: open === 'transferable', onOpen: () => setOpen('transferable'), onConfirm: () => confirm('self', startCapabilityModel), children: h(TransferableForm, { state, post }) }),
        h(ProfileModule, { key: 'self', label: '能力自评', summary: summary.self, done: done.self, open: open === 'self', onOpen: () => setOpen('self'), onConfirm: () => setOpen(''), confirmLabel: '确认能力自评', children: h(SelfAssessmentForm, { state, post }) }),
        planReady ? h('div', { key: 'handoff', style: { ...S.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' } }, [
          h('div', { key: 'copy' }, [
            h('div', { key: 't', style: { fontSize: '14px', fontWeight: '700' } }, '画像齐了，下一步是 90 天计划'),
            h('div', { key: 's', style: { ...S.fine, marginTop: '3px' } }, '按你的方向、可用的时间和路线生成；生成期间页面会自动刷新。'),
          ]),
          h(AskButton, { key: 'go', text: '帮我生成成长计划', label: '让 AI 生成计划', style: S.buttonOn,
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

       const navigate = useCallback((targetTab, anchor) => {
         setTab(targetTab);
         setTimeout(() => {
           if (typeof document === 'undefined' || !anchor) return;
           const node = document.querySelector(`[data-anchor="${anchor}"]`) || document.querySelector(`[data-task-id="${anchor.replace('task-', '')}"]`);
           node?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
         }, 50);
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
        review: () => h(ReviewTabBody, { state, post }),
        profile: () => h(ProfileFlow, { key: 'profile-flow', state, post, onNavigate: navigate }),
      };

      return h('div', { style: S.page }, [
        h('div', { key: 'tabs', style: S.tabbar }, TABS.map((entry) => h('button', {
          key: entry.id,
          type: 'button',
          style: { ...S.tab, ...(tab === entry.id ? S.tabOn : {}) },
          onClick: () => setTab(entry.id),
        }, entry.label))),
         h('div', { key: 'body', style: S.body }, h('div', { style: S.inner }, [
           error.length > 0 ? h('div', { key: 'error', style: S.error }, error) : null,
           h(WorkbenchHeader, { key: 'header', state, onNavigate: navigate, hideNext: tab === 'profile' }),
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
      return h('div', { 'data-task-id': task.id, style: { display: 'flex', flexDirection: 'column', gap: '12px', padding: '15px', borderRadius: '16px', background: done ? '#edf6ef' : '#fffdf9', border: `1px solid ${done ? '#c8dfcc' : '#e5dfd5'}`, boxShadow: '0 8px 18px rgba(54,42,32,.05)' } }, [
        h('div', { key: 'eyebrow', style: { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' } }, [
          h('span', { key: 'ref', style: { fontSize: '12px', fontFamily: 'var(--gw-mono, monospace)', color: 'var(--gw-coral-deep, #a64132)' } }, `${task.id} / ${task.ref}`),
          h('span', { key: 'done', style: { fontSize: '13px', fontWeight: '700', color: done ? '#3f9b63' : 'var(--gw-muted, #718096)' } }, `${done ? '已完成' : '未完成'} · ${String(task.minutes)} 分钟`),
        ]),
        h('label', { key: 'title', style: { display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' } }, [
          h('input', { key: 'box', type: 'checkbox', checked: done, style: { accentColor: 'var(--gw-coral, #e56b55)', width: '22px', height: '22px', marginTop: '2px', cursor: 'pointer', accentColor: done ? '#3f9b63' : 'var(--gw-coral, #e56b55)', filter: done ? 'drop-shadow(0 2px 4px rgba(63,155,99,.28))' : 'none' }, 'aria-label': task.action, onChange: (event) => { void save({ done: event.target.checked }); } }),
          h('span', { key: 'text', style: { fontSize: '15px', fontWeight: '700', lineHeight: '1.45', textDecoration: done ? 'line-through' : 'none', opacity: done ? '.6' : '1' } }, task.action),
        ]),
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
      return h('div', { style: { height: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: '16px 14px 22px', display: 'flex', flexDirection: 'column', gap: '14px', background: 'linear-gradient(180deg, #f8f6f1 0%, #f3eee7 100%)', color: 'var(--gw-ink, #1f2933)' } }, [
        h('div', { key: 'head', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' } }, [
          h('div', { key: 'copy' }, [
            h('div', { key: 'eyebrow', style: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--gw-coral-deep, #a64132)' } }, 'Today'),
            h('div', { key: 'title', style: { fontFamily: 'var(--gw-display, Calistoga, Georgia, serif)', fontSize: '24px', lineHeight: '1.15', marginTop: '5px' } }, state.profile.targetRole ? `向 ${state.profile.targetRole} 走` : '今天，先走一步'),
          ]),
          h('span', { key: 'day', style: { ...S.chip, fontFamily: 'var(--gw-mono, monospace)', whiteSpace: 'nowrap' } }, state.metrics.day === null ? 'DAY --' : `DAY ${String(Math.max(1, state.metrics.day)).padStart(2, '0')}`),
        ]),
        h('div', { key: 'metrics', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, [
          h('div', { key: 'progress', style: { padding: '11px', borderRadius: '12px', background: '#fffdf9', border: '1px solid #e5dfd5' } }, [h('div', { key: 'label', style: S.fine }, '计划完成'), h('strong', { key: 'value', style: { display: 'block', fontSize: '20px', marginTop: '4px' } }, `${String(done)}%`), h('div', { key: 'bar', style: { height: '4px', background: '#eee9e1', borderRadius: '99px', marginTop: '8px' } }, h('div', { style: { height: '100%', width: `${String(done)}%`, borderRadius: '99px', background: 'var(--gw-coral, #e56b55)' } }))]),
          h('div', { key: 'streak', style: { padding: '11px', borderRadius: '12px', background: '#fffdf9', border: '1px solid #e5dfd5' } }, [h('div', { key: 'label', style: S.fine }, '连续打卡'), h('strong', { key: 'value', style: { display: 'block', fontSize: '20px', marginTop: '4px' } }, `${String(state.metrics.streak)} 天`), h('div', { key: 'phase', style: { ...S.fine, marginTop: '8px' } }, state.metrics.phaseName || '尚未开始')]),
        ]),
        activity === null ? null : h('div', { key: 'activity', role: 'status', 'aria-live': 'polite', style: { padding: '11px 12px', borderRadius: '12px', fontSize: '13px', lineHeight: '1.5', background: activity.status === 'completed' ? '#edf6ef' : activity.status === 'error' ? '#fff0ed' : '#eef2f0', border: `1px solid ${activity.status === 'completed' ? '#c8dfcc' : activity.status === 'error' ? '#f3c5be' : '#d5e0da'}` } }, activity.status === 'completed' ? 'AI 已返回，今日面板已自动更新。' : activity.status === 'error' ? `AI 处理失败：${activity.error}` : 'AI 正在处理，完成后这里会自动更新。'),
        task === undefined ? h('div', { key: 'empty', style: { padding: '16px', borderRadius: '16px', background: '#253b39', color: '#fff' } }, [h('div', { key: 'label', style: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', opacity: '.65' } }, '下一步'), h('div', { key: 'title', style: { fontSize: '16px', fontWeight: '700', marginTop: '6px' } }, state.nextAction?.label ?? '今天没有待办'), h('div', { key: 'reason', style: { fontSize: '13px', lineHeight: '1.55', opacity: '.78', marginTop: '6px' } }, state.nextAction?.reason ?? '去成长工作台查看完整计划。')]) : h(RightTaskCard, { key: task.id, task, entry: state.progress.tasks?.[task.id], post }),
        error.length > 0 ? h('div', { key: 'error', style: S.error }, error) : null,
        h('div', { key: 'foot', style: { ...S.fine, textAlign: 'center', paddingTop: '2px' } }, state.focus.scheduled ? '这是今天排定的最小动作' : '今天没有排定任务，先接着完成这一项'),
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
