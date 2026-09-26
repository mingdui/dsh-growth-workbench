import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dsh = process.env.DSH_BIN?.trim() || 'dsh'
const profile = process.env.DSH_PROFILE?.trim() || 'web'

function run(command, args) {
  console.log(`> ${command} ${args.join(' ')}`)
  execFileSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: false })
}

if (!existsSync(resolve(root, 'package.json'))) throw new Error('package.json not found')
run(process.execPath, ['selftest.mjs'])
try {
  run(dsh, ['plugin', '--profile', profile, 'update', 'dsh-growth-workbench'])
} catch {
  console.log('The installed CLI has no update subcommand; re-registering the local checkout.')
  run(dsh, ['plugin', '--profile', profile, 'add', root])
}
console.log(`Updated dsh-growth-workbench in profile ${profile}. Restart the DSH web process to load it.`)
