/**
 * `dsh-growth-workbench` — host half.
 *
 * Contributes three things to the Harness process:
 *
 *  1. the seven `growth_*` tools, so the agent reads and writes the same documents
 *     the page does;
 *  2. a JSON endpoint under `/gw/api`, which the page uses;
 *  3. nothing else — the page's data lives in `$DSH_HOME/growth-workbench/`, and
 *     both halves reach it through `./store.mjs`.
 *
 * The data lives beside the process rather than inside a browser, so there is
 * exactly one copy of it and both halves read that copy. Nothing has to be
 * exported, relocated, reformatted or pasted for the agent to see the data.
 *
 * @module dsh-growth-workbench
 */
import { API_PREFIX, handleApi } from './api.mjs'
import { ensureWorkspaceDir, rememberWorkspaceId, workspaceDir } from './store.mjs'
import { TOOLS } from './tools.mjs'

/**
 * 把工作区目录注册成一个 DSH 工作区，并记下它的 id。
 *
 * **为什么非做不可**：用户在侧栏点「重建一个」建出来的对话挂在「未分组」下。查过才知道——
 * 侧栏分组读的是**工作区注册表**，不是会话的 cwd：会话文件确实落在我们那个目录里（日志的
 * `cwd` 字段可以作证），但那个目录没注册成工作区，于是它归「未分组」。`session.create`
 * 也接受 `workspaceId`，而只给 `cwd` 时**不会**顺手注册。
 *
 * 三条要点：
 *  - `workspaceRegistry.create()` 对同一个路径是幂等的（重复挂载不会造出第二个工作区），并且
 *    内部会 `realpath` + `stat`，所以**必须排在 `ensureWorkspaceDir()` 之后**（目录得先存在）。
 *  - 用 `ctx.get` 而不是 `inject`：某些 profile 不挂工作区服务（离线自检里根本没有 Harness），
 *    把它写进 `inject` 会让整个插件静默不挂载。拿不到就退回只带 `cwd`——能用，只是分组差一点。
 *  - 挂载时刻可能在服务初始化之前，所以失败重试一次；两次都不成就如实说，页面照旧工作。
 *
 * @param ctx - 宿主插件上下文。
 * @returns 记下的工作区 id（空串 = 没注册上）。
 */
async function registerWorkspace(ctx) {
  const registry = typeof ctx?.get === 'function' ? ctx.get('workspaceRegistry') : undefined
  if (registry === undefined || registry === null || typeof registry.create !== 'function') return ''
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const workspace = await registry.create(workspaceDir(), '成长工作台')
      return rememberWorkspaceId(typeof workspace?.id === 'string' ? workspace.id : '')
    } catch (failure) {
      if (attempt === 1) {
        ctx?.logger?.warn?.(`dsh-growth-workbench: 工作区注册失败，会话会归在「未分组」下：${String(failure)}`)
      } else {
        await new Promise((resolve) => { setTimeout(resolve, 1000) })
      }
    }
  }
  return rememberWorkspaceId('')
}

/**
 * Plugin name. Also the `cordis.patch.yml` row id and the package name, so a log
 * line, a profile row and a `node_modules` entry all read the same.
 */
export const name = 'dsh-growth-workbench'

/** `tools` receives the seven tool definitions; `webServer` carries the page endpoint. */
export const inject = ['tools', 'webServer']

/**
 * Plugin body: mount the endpoint and register the tools.
 *
 * Both go through `ctx.effect`, so a profile that unloads the plugin also removes
 * the route and every tool with it.
 * @param ctx - the context carrying the tool registry and the web server.
 */
export function apply(ctx) {
  // 那个专属会话要把这里当工作区，所以先建目录、再把它注册成工作区（两件都是幂等的）。
  // 建目录是**宿主**的事：页面只拿到路径与 id，它不碰磁盘。
  ctx.effect(
    () => {
      ensureWorkspaceDir()
      // 注册是异步的，但挂载不等它：拿不到注册表时页面会退回 `cwd`，不该让整个插件卡在这儿。
      void registerWorkspace(ctx)
      return () => {}
    },
    'dsh-growth-workbench: workspace dir',
  )
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler: handleApi }),
    'dsh-growth-workbench: JSON endpoint',
  )
  for (const tool of TOOLS) {
    ctx.effect(
      () => ctx.tools.register(tool),
      `dsh-growth-workbench: ${tool.name} tool`,
    )
  }
}
