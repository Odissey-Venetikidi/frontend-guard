#!/usr/bin/env node
// frontend-guard PROJECT installer — wire the kit into one project (committable,
// works for the whole team / without Claude Code via the git hook).
// For a single global install across ALL your projects, use setup.mjs instead.
//
//   node /path/to/frontend-guard/install.mjs [targetDir]   (default: cwd)
//
// Idempotent; nothing is overwritten without telling you. Installs:
//   1. <target>/.frontend-guard/        (guard.mjs, hooks, guide)
//   2. <target>/.claude/skills/frontend-guard/SKILL.md   (so /frontend-guard works here)
//   3. <target>/guard.config.json       (from the example, if missing)
//   4. .claude/settings.json            (PreToolUse + SessionStart hooks merged)
//   5. .git/hooks/pre-commit            (if a git repo)
//   6. package.json "lint:ui"           (if present)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const KIT = path.dirname(fileURLToPath(import.meta.url))
const TARGET = path.resolve(process.argv[2] || process.cwd())
const ok = (m) => console.log('  ✓ ' + m)
const warn = (m) => console.log('  ! ' + m)

if (TARGET === KIT) { console.error('Refusing to install into the kit itself. Pass a target project dir.'); process.exit(1) }
if (!fs.existsSync(TARGET) || !fs.statSync(TARGET).isDirectory()) { console.error('Target is not a directory: ' + TARGET); process.exit(1) }
console.log(`frontend-guard -> ${TARGET}\n`)

// 1) engine + hooks + guide -> .frontend-guard/
const dest = path.join(TARGET, '.frontend-guard')
fs.mkdirSync(path.join(dest, 'hooks'), { recursive: true })
for (const f of ['guard.mjs', 'AGENT_FRONTEND_GUIDE.md', 'hooks/claude-pretooluse.mjs', 'hooks/session-start.mjs', 'hooks/pre-commit']) {
  const src = path.join(KIT, f)
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dest, f)); else warn(`missing in kit: ${f}`)
}
for (const h of ['claude-pretooluse.mjs', 'session-start.mjs', 'pre-commit']) { try { fs.chmodSync(path.join(dest, 'hooks', h), 0o755) } catch {} }
try { fs.chmodSync(path.join(dest, 'guard.mjs'), 0o755) } catch {}
ok('.frontend-guard/ copied')

// 2) skill discovery
const skillDir = path.join(TARGET, '.claude', 'skills', 'frontend-guard')
fs.mkdirSync(skillDir, { recursive: true })
if (fs.existsSync(path.join(KIT, 'SKILL.md'))) { fs.copyFileSync(path.join(KIT, 'SKILL.md'), path.join(skillDir, 'SKILL.md')); ok('.claude/skills/frontend-guard/SKILL.md installed') }

// 3) guard.config.json (do not clobber)
const cfgPath = path.join(TARGET, 'guard.config.json')
if (fs.existsSync(cfgPath)) ok('guard.config.json already present (kept)')
else { fs.copyFileSync(path.join(KIT, 'guard.config.example.json'), cfgPath); ok('guard.config.json created from example — run "node .frontend-guard/guard.mjs --init" to auto-detect, then review') }

// 4) merge hooks into .claude/settings.json
const settingsPath = path.join(TARGET, '.claude', 'settings.json')
const PRE = 'node "${CLAUDE_PROJECT_DIR}/.frontend-guard/hooks/claude-pretooluse.mjs"'
const SS = 'node "${CLAUDE_PROJECT_DIR}/.frontend-guard/hooks/session-start.mjs"'
let settings = {}
if (fs.existsSync(settingsPath)) {
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) }
  catch { warn('.claude/settings.json is not valid JSON — add hooks manually (see settings.snippet.json)'); settings = null }
}
if (settings !== null) {
  settings.hooks = settings.hooks || {}
  settings.hooks.PreToolUse = settings.hooks.PreToolUse || []
  settings.hooks.SessionStart = settings.hooks.SessionStart || []
  if (JSON.stringify(settings.hooks.PreToolUse).includes('frontend-guard/hooks/claude-pretooluse.mjs')) ok('PreToolUse hook already present (kept)')
  else { settings.hooks.PreToolUse.push({ matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command: PRE }] }); ok('PreToolUse hook added') }
  if (JSON.stringify(settings.hooks.SessionStart).includes('frontend-guard/hooks/session-start.mjs')) ok('SessionStart hook already present (kept)')
  else { settings.hooks.SessionStart.push({ hooks: [{ type: 'command', command: SS }] }); ok('SessionStart hook added') }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
}

// 5) git pre-commit
const gitDir = path.join(TARGET, '.git')
if (fs.existsSync(gitDir)) {
  const hookPath = path.join(gitDir, 'hooks', 'pre-commit')
  fs.mkdirSync(path.dirname(hookPath), { recursive: true })
  if (!fs.existsSync(hookPath)) { fs.copyFileSync(path.join(KIT, 'hooks/pre-commit'), hookPath); fs.chmodSync(hookPath, 0o755); ok('git pre-commit installed') }
  else {
    const ex = fs.readFileSync(hookPath, 'utf8')
    if (ex.includes('frontend-guard') || ex.includes('guard.mjs')) ok('git pre-commit already wired (kept)')
    else warn('git pre-commit exists — add:  node "$(git rev-parse --show-toplevel)/.frontend-guard/guard.mjs" --staged')
  }
} else warn('not a git repo — skipped pre-commit (run "git init" then re-run to add it)')

// 6) package.json lint script
const pkgPath = path.join(TARGET, 'package.json')
if (fs.existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    pkg.scripts = pkg.scripts || {}
    if (pkg.scripts['lint:ui']) ok('package.json "lint:ui" already present (kept)')
    else { pkg.scripts['lint:ui'] = 'node .frontend-guard/guard.mjs'; fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n'); ok('package.json "lint:ui" added') }
  } catch { warn('package.json not valid JSON — add "lint:ui": "node .frontend-guard/guard.mjs" manually') }
} else warn('no package.json — run the linter directly: node .frontend-guard/guard.mjs')

console.log(`
Next steps:
  1. node .frontend-guard/guard.mjs --init   -> auto-detect & write guard.config.json (then review).
  2. Run the /frontend-guard skill to onboard (asks the §0 Profile questions + audits).
  3. Restart Claude Code so the hooks load.
  4. Try it:  node .frontend-guard/guard.mjs --audit
`)
