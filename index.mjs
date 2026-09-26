/**
 * `dsh-growth-workbench` — host half.
 *
 * Contributes three things to the Harness process:
 *
 *  1. the six `growth_*` tools, so the agent reads and writes the same documents
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
import { TOOLS } from './tools.mjs'

/**
 * Plugin name. Also the `cordis.patch.yml` row id and the package name, so a log
 * line, a profile row and a `node_modules` entry all read the same.
 */
export const name = 'dsh-growth-workbench'

/** `tools` receives the six tool definitions; `webServer` carries the page endpoint. */
export const inject = ['tools', 'webServer']

/**
 * Plugin body: mount the endpoint and register the tools.
 *
 * Both go through `ctx.effect`, so a profile that unloads the plugin also removes
 * the route and every tool with it.
 * @param ctx - the context carrying the tool registry and the web server.
 */
export function apply(ctx) {
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
