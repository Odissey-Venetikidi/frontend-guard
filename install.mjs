#!/usr/bin/env node
// frontend-guard PROJECT installer — wire the kit into one project (committable,
// works for the whole team / without Claude Code via the git hook).
// For a single global install across ALL your projects, use setup.mjs instead.
//
//   node /path/to/frontend-guard/install.mjs [targetDir]   (default: cwd)
//
// Idempotent; nothing is overwritten without telling you. Everything Claude-related goes
// UNDER .claude/ (only .mcp.json stays at the project root). Installs:
//   1. <target>/.claude/frontend-guard/            (guard.mjs, scaffold, hooks, guide)
//   2. <target>/.claude/skills/frontend-guard/SKILL.md   (so /frontend-guard works here)
//   3. <target>/.claude/guard.config.json          (from the example, if missing)
//   4. <target>/.claude/settings.json              (PreToolUse + SessionStart hooks merged)
//   5. .git/hooks/pre-commit + prepare-commit-msg  (if a git repo)
//   6. package.json "lint:ui"                      (if present)
// Also migrates a legacy ROOT layout (.frontend-guard/, root guard.config.json, memory-bank/).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scaffold } from './scaffold.mjs'

const KIT = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const noScaffold = argv.includes('--no-scaffold')
const TARGET = path.resolve(argv.find((a) => !a.startsWith('-')) || process.cwd())
const ok = (m) => console.log('  ✓ ' + m)
const warn = (m) => console.log('  ! ' + m)

if (TARGET === KIT) { console.error('Refusing to install into the kit itself. Pass a target project dir.'); process.exit(1) }
if (!fs.existsSync(TARGET) || !fs.statSync(TARGET).isDirectory()) { console.error('Target is not a directory: ' + TARGET); process.exit(1) }
console.log(`frontend-guard -> ${TARGET}\n`)

// 0) migrate a legacy ROOT layout into .claude/ (older installs put these at the project root)
const claudeDir = path.join(TARGET, '.claude')
fs.mkdirSync(claudeDir, { recursive: true })
for (const [from, to, label] of [
  ['guard.config.json', path.join('.claude', 'guard.config.json'), 'guard.config.json'],
  ['memory-bank', path.join('.claude', 'memory-bank'), 'memory-bank/'],
]) {
  const src = path.join(TARGET, from), dst = path.join(TARGET, to)
  if (fs.existsSync(src) && !fs.existsSync(dst)) { try { fs.renameSync(src, dst); ok(`migrated ${label} -> .claude/`) } catch {} }
}
const legacyEngine = path.join(TARGET, '.frontend-guard')
if (fs.existsSync(legacyEngine)) { try { fs.rmSync(legacyEngine, { recursive: true, force: true }); ok('removed legacy root .frontend-guard/ (engine now lives in .claude/)') } catch {} }

// 1) engine + hooks + guide -> .claude/frontend-guard/
const dest = path.join(claudeDir, 'frontend-guard')
fs.mkdirSync(path.join(dest, 'hooks'), { recursive: true })
for (const f of ['guard.mjs', 'scaffold.mjs', 'AGENT_FRONTEND_GUIDE.md', 'hooks/claude-pretooluse.mjs', 'hooks/session-start.mjs', 'hooks/pre-commit', 'hooks/prepare-commit-msg']) {
  const src = path.join(KIT, f)
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dest, f)); else warn(`missing in kit: ${f}`)
}
for (const h of ['claude-pretooluse.mjs', 'session-start.mjs', 'pre-commit', 'prepare-commit-msg']) { try { fs.chmodSync(path.join(dest, 'hooks', h), 0o755) } catch {} }
try { fs.chmodSync(path.join(dest, 'guard.mjs'), 0o755) } catch {}
ok('.claude/frontend-guard/ copied')

// 2) skill discovery
const skillDir = path.join(TARGET, '.claude', 'skills', 'frontend-guard')
fs.mkdirSync(skillDir, { recursive: true })
if (fs.existsSync(path.join(KIT, 'SKILL.md'))) { fs.copyFileSync(path.join(KIT, 'SKILL.md'), path.join(skillDir, 'SKILL.md')); ok('.claude/skills/frontend-guard/SKILL.md installed') }

// 2.5) scaffold the canonical CLAUDE architecture (.claude/ brain, CLAUDE.md,
//      memory-bank/, .mcp.json, statusline.sh, settings skeleton) — idempotent.
if (noScaffold) ok('CLAUDE scaffold skipped (--no-scaffold)')
else {
  const r = scaffold(TARGET, { quiet: true })
  ok(`CLAUDE architecture scaffolded (${r.created} created, ${r.kept} kept) — .claude/ + CLAUDE.md + memory-bank/`)
}

// 3) guard.config.json -> .claude/ (do not clobber; a legacy root one was migrated above)
const cfgPath = path.join(claudeDir, 'guard.config.json')
if (fs.existsSync(cfgPath) || fs.existsSync(path.join(TARGET, 'guard.config.json'))) ok('guard.config.json already present (kept)')
else { fs.copyFileSync(path.join(KIT, 'guard.config.example.json'), cfgPath); ok('.claude/guard.config.json created from example — run "node .claude/frontend-guard/guard.mjs --init" to auto-detect, then review') }

// 4) merge hooks into .claude/settings.json
const settingsPath = path.join(claudeDir, 'settings.json')
const PRE = 'node "${CLAUDE_PROJECT_DIR}/.claude/frontend-guard/hooks/claude-pretooluse.mjs"'
const SS = 'node "${CLAUDE_PROJECT_DIR}/.claude/frontend-guard/hooks/session-start.mjs"'
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
    else warn('git pre-commit exists — add:  node "$(git rev-parse --show-toplevel)/.claude/frontend-guard/guard.mjs" --staged')
  }
  // prepare-commit-msg: auto-fill an empty commit message with a Russian change summary
  const pcmPath = path.join(gitDir, 'hooks', 'prepare-commit-msg')
  if (!fs.existsSync(pcmPath)) { fs.copyFileSync(path.join(KIT, 'hooks/prepare-commit-msg'), pcmPath); fs.chmodSync(pcmPath, 0o755); ok('git prepare-commit-msg installed (auto-fills commits in Russian)') }
  else {
    const ex = fs.readFileSync(pcmPath, 'utf8')
    if (ex.includes('frontend-guard')) ok('git prepare-commit-msg already wired (kept)')
    else warn('git prepare-commit-msg exists — keeping yours (frontend-guard auto-fill not added)')
  }
} else warn('not a git repo — skipped git hooks (run "git init" then re-run to add them)')

// 6) package.json lint script
const pkgPath = path.join(TARGET, 'package.json')
if (fs.existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    pkg.scripts = pkg.scripts || {}
    if (pkg.scripts['lint:ui']) ok('package.json "lint:ui" already present (kept)')
    else { pkg.scripts['lint:ui'] = 'node .claude/frontend-guard/guard.mjs'; fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n'); ok('package.json "lint:ui" added') }
  } catch { warn('package.json not valid JSON — add "lint:ui": "node .claude/frontend-guard/guard.mjs" manually') }
} else warn('no package.json — run the linter directly: node .claude/frontend-guard/guard.mjs')

console.log(`
Next steps:
  1. Fill .claude/CLAUDE.md (project rules) — the .claude/ architecture is scaffolded with examples.
  2. node .claude/frontend-guard/guard.mjs --init   -> auto-detect & write .claude/guard.config.json (then review).
  3. Run the /frontend-guard skill to onboard (asks the §0 Profile questions + audits).
  4. Restart Claude Code so the hooks load.
  5. Try it:  node .claude/frontend-guard/guard.mjs --audit
`)
