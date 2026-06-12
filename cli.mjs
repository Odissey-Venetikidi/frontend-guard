#!/usr/bin/env node
// frontend-guard CLI entry (npm "bin"). Lets `npx github:<owner>/frontend-guard`
// run the global setup in one command, and routes the other actions.
//
//   frontend-guard            -> global setup (~/.claude, all projects)
//   frontend-guard install [d]-> per-project install (default: cwd)
//   frontend-guard scaffold [d]-> create the CLAUDE architecture in a project (default: cwd)
//   frontend-guard uninstall  -> remove global hooks (--purge to delete skill dir)
//   frontend-guard audit      -> audit the current project

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const [cmd, ...rest] = process.argv.slice(2)
const run = (script, args = []) => spawnSync(process.execPath, [path.join(DIR, script), ...args], { stdio: 'inherit' }).status ?? 0

let code = 0
switch (cmd) {
  case undefined:
  case 'setup': code = run('setup.mjs', rest); break
  case 'install': code = run('install.mjs', rest); break
  case 'scaffold': code = run('scaffold.mjs', rest); break
  case 'uninstall': code = run('setup.mjs', ['--uninstall', ...rest]); break
  case 'audit': code = run('guard.mjs', ['--audit', ...rest]); break
  case '-h': case '--help': case 'help':
    console.log('frontend-guard — usage:\n  frontend-guard            global setup (all projects)\n  frontend-guard install [d]  per-project install (+ CLAUDE scaffold)\n  frontend-guard scaffold [d] create the CLAUDE architecture in a project\n  frontend-guard uninstall    remove global hooks (--purge to delete skill dir)\n  frontend-guard audit        audit current project'); break
  default:
    console.error(`Unknown command: ${cmd}\nRun "frontend-guard --help".`); code = 1
}
process.exit(code)
