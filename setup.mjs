#!/usr/bin/env node
// frontend-guard GLOBAL setup — "drop in once, works on every project".
// Installs the kit + skill into ~/.claude/skills/frontend-guard/ and wires two
// user-level hooks into ~/.claude/settings.json:
//   - PreToolUse (Edit|Write|MultiEdit) -> blocks newly introduced violations
//   - SessionStart -> self-introduces / nudges onboarding on UI projects
// The hooks auto-detect each project's language & layout, so no per-project step
// is required (a project guard.config.json just makes the rules precise).
//
//   node setup.mjs               install for the current user
//   node setup.mjs --uninstall   remove hooks (and skill dir with --purge)
//   node setup.mjs --home <dir>  use a different HOME (for testing)

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const KIT = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = (f) => argv.includes(f)
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null }

const HOME = path.resolve(opt('--home') || os.homedir())
const SKILL_DIR = path.join(HOME, '.claude', 'skills', 'frontend-guard')
const SETTINGS = path.join(HOME, '.claude', 'settings.json')
const PRE_CMD = `node "${path.join(SKILL_DIR, 'hooks', 'claude-pretooluse.mjs')}"`
const SS_CMD = `node "${path.join(SKILL_DIR, 'hooks', 'session-start.mjs')}"`
const log = (m) => console.log(m)
const ok = (m) => console.log('  ✓ ' + m)

function copyRec(src, dst) {
  const st = fs.statSync(src)
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true })
    for (const n of fs.readdirSync(src)) copyRec(path.join(src, n), path.join(dst, n))
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(src, dst)
  }
}

function readSettings() {
  if (!fs.existsSync(SETTINGS)) return {}
  try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) }
  catch { console.error(`! ${SETTINGS} is not valid JSON — fix it or remove it, then re-run.`); process.exit(1) }
}
function backup() {
  if (fs.existsSync(SETTINGS)) {
    const bak = SETTINGS + '.frontend-guard.bak'
    if (!fs.existsSync(bak)) { fs.copyFileSync(SETTINGS, bak); ok('backed up settings.json -> ' + path.basename(bak)) }
  }
}
function writeSettings(s) {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true })
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n')
}
const hasCmd = (arr, needle) => JSON.stringify(arr || []).includes(needle)

function install() {
  log(`frontend-guard global setup -> ${HOME}/.claude/\n`)

  // 1) copy kit (skip the kit's own node_modules / vcs, none expected)
  fs.mkdirSync(SKILL_DIR, { recursive: true })
  for (const name of fs.readdirSync(KIT)) {
    if (name === 'node_modules' || name === '.git' || name.endsWith('.bak')) continue
    copyRec(path.join(KIT, name), path.join(SKILL_DIR, name))
  }
  for (const h of ['claude-pretooluse.mjs', 'session-start.mjs', 'pre-commit']) {
    try { fs.chmodSync(path.join(SKILL_DIR, 'hooks', h), 0o755) } catch {}
  }
  try { fs.chmodSync(path.join(SKILL_DIR, 'guard.mjs'), 0o755) } catch {}
  ok('skill + kit copied to ~/.claude/skills/frontend-guard/')

  // 2) merge hooks into settings.json
  backup()
  const s = readSettings()
  s.hooks = s.hooks || {}
  s.hooks.PreToolUse = s.hooks.PreToolUse || []
  s.hooks.SessionStart = s.hooks.SessionStart || []
  if (hasCmd(s.hooks.PreToolUse, 'frontend-guard/hooks/claude-pretooluse.mjs')) ok('PreToolUse hook already present (kept)')
  else { s.hooks.PreToolUse.push({ matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command: PRE_CMD }] }); ok('PreToolUse hook added') }
  if (hasCmd(s.hooks.SessionStart, 'frontend-guard/hooks/session-start.mjs')) ok('SessionStart hook already present (kept)')
  else { s.hooks.SessionStart.push({ hooks: [{ type: 'command', command: SS_CMD }] }); ok('SessionStart hook added') }
  writeSettings(s)

  log(`
Done. frontend-guard is now GLOBAL.

  • Restart Claude Code so the hooks load.
  • Every UI project (React/Vue/Svelte, Flutter, SwiftUI) is enforced automatically;
    SessionStart will nudge onboarding when a project has no guard.config.json.
  • Scaffold the CLAUDE architecture in a project (.claude/ + CLAUDE.md + memory-bank/):
      node ${path.join(SKILL_DIR, 'scaffold.mjs')} /path/to/project
  • Per-project precision: run the "frontend-guard" skill (or 'node ${path.join(SKILL_DIR, 'guard.mjs')} --init').
  • Uninstall:  node ${path.join(SKILL_DIR, 'setup.mjs')} --uninstall   (add --purge to also delete the skill dir)
`)
}

function uninstall() {
  log(`frontend-guard uninstall -> ${HOME}/.claude/\n`)
  if (fs.existsSync(SETTINGS)) {
    backup()
    const s = readSettings()
    if (s.hooks) {
      for (const evt of ['PreToolUse', 'SessionStart']) {
        if (Array.isArray(s.hooks[evt])) {
          const before = s.hooks[evt].length
          s.hooks[evt] = s.hooks[evt].filter((e) => !JSON.stringify(e).includes('frontend-guard/hooks/'))
          if (s.hooks[evt].length !== before) ok(`removed ${evt} hook`)
          if (!s.hooks[evt].length) delete s.hooks[evt]
        }
      }
      if (!Object.keys(s.hooks).length) delete s.hooks
    }
    writeSettings(s)
  }
  if (flag('--purge') && fs.existsSync(SKILL_DIR)) { fs.rmSync(SKILL_DIR, { recursive: true, force: true }); ok('removed skill dir') }
  else ok('hooks removed (skill dir kept — add --purge to delete it)')
  log('\nRestart Claude Code to apply.')
}

if (flag('--uninstall')) uninstall(); else install()
