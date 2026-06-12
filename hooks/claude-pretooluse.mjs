#!/usr/bin/env node
// Claude Code PreToolUse hook (Edit | Write | MultiEdit).
// Lints the POST-edit content and BLOCKS (exit 2) only if the change INTRODUCES
// a new error-severity violation — so editing already-noncompliant legacy files
// is never trapped (guide §10). Fail-open: any internal error => allow (exit 0),
// a guardrail must never break legitimate work.
//
// Contract (verified against Claude Code hooks docs):
//   stdin  = { tool_name, tool_input, cwd, ... }
//   exit 0 = allow, exit 2 = block (stderr is shown to Claude as the reason).

import fs from 'node:fs'
import path from 'node:path'
import { loadConfig, lintText, diffIntroduced, isScanned } from '../guard.mjs'

const DEBUG = !!process.env.GUARD_DEBUG
const allow = () => process.exit(0)
const debug = (m) => { if (DEBUG) process.stderr.write('[guard] ' + m + '\n') }

function readStdin() {
  try { return fs.readFileSync(0, 'utf8') } catch { return '' }
}

function applyEdit(content, oldStr, newStr, replaceAll) {
  if (oldStr === '') return content + newStr // append semantics
  if (!content.includes(oldStr)) return null // can't reconstruct reliably -> caller fails open
  return replaceAll ? content.split(oldStr).join(newStr) : content.replace(oldStr, newStr)
}

function main() {
  const raw = readStdin()
  if (!raw.trim()) return allow()
  let payload
  try { payload = JSON.parse(raw) } catch { return allow() }

  const toolName = payload.tool_name
  const ti = payload.tool_input || {}
  const cwd = payload.cwd || process.cwd()
  if (!ti.file_path) return allow()

  const absFile = path.isAbsolute(ti.file_path) ? ti.file_path : path.resolve(cwd, ti.file_path)

  let cfg
  try { cfg = loadConfig(cwd) } catch (e) { debug('config: ' + e.message); return allow() }

  const rel = path.relative(cfg._dir, absFile).split(path.sep).join('/')
  if (!isScanned(rel, cfg)) { debug('not scanned: ' + rel); return allow() }

  const oldText = fs.existsSync(absFile) ? fs.readFileSync(absFile, 'utf8') : ''

  let newText
  if (toolName === 'Write') newText = String(ti.content ?? '')
  else if (toolName === 'Edit') newText = applyEdit(oldText, ti.old_string ?? '', ti.new_string ?? '', !!ti.replace_all)
  else if (toolName === 'MultiEdit') {
    newText = oldText
    for (const e of ti.edits || []) {
      newText = applyEdit(newText, e.old_string ?? '', e.new_string ?? '', !!e.replace_all)
      if (newText === null) break
    }
  } else return allow()
  if (newText === null) return allow() // edit won't apply cleanly -> let Claude Code surface the real error

  const introduced = diffIntroduced(lintText(oldText, rel, cfg), lintText(newText, rel, cfg))
    .filter((v) => v.severity === 'error')

  if (!introduced.length) return allow()

  const lines = introduced.map(
    (v) => `  [${v.rule}] line ${v.line}: ${v.message}\n    > ${v.snippet}`
  )
  process.stderr.write(
    `frontend-guard blocked this edit — it introduces ${introduced.length} rule violation(s):\n\n` +
    lines.join('\n') +
    `\n\nFix: use the matching primitive from the UI layer (see AGENT_FRONTEND_GUIDE.md §0 inventory and §2). ` +
    `If the primitive/token/icon does not exist yet, STOP and propose extending it — do NOT bypass with custom markup or inline styles (§1, §10).\n`
  )
  process.exit(2)
}

try { main() } catch (e) { debug('fatal: ' + (e && e.message)); allow() }
