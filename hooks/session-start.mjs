#!/usr/bin/env node
// Claude Code SessionStart hook — makes frontend-guard self-introduce.
// On a detected UI project it injects context so the agent (a) onboards the
// project if it isn't configured yet, and (b) knows the rules are live.
// Non-UI projects: silent (no context, no noise). Fail-open on any error.

import fs from 'node:fs'
import { loadConfig } from '../guard.mjs'

function emit(ctx) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx },
  }) + '\n')
  process.exit(0)
}

try {
  let cwd = process.cwd()
  try { const p = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); if (p.cwd) cwd = p.cwd } catch {}

  const cfg = loadConfig(cwd)
  if (cfg._inert || !cfg.language) process.exit(0) // not a UI project — stay quiet

  const onboarded = !!cfg._file
  if (!onboarded) {
    emit(
      `frontend-guard: this is a ${cfg.language} UI project and it is NOT onboarded yet (no guard.config.json). ` +
      `Proactively run the "frontend-guard" onboarding when frontend work begins: gather project data, ask the user the §0 Profile questions, ` +
      `write guard.config.json, run "node <kit>/guard.mjs --audit", then enforce. ` +
      `Meanwhile the guard auto-detects (ui=${cfg.uiDir}, api=${cfg.apiDir}) and BLOCKS newly introduced rule violations. ` +
      `Follow AGENT_FRONTEND_GUIDE.md: compose primitives, no styling/hardcoding outside the UI layer, all I/O via the typed client, STOP-and-ask when a primitive/token is missing.`
    )
  } else {
    emit(
      `frontend-guard active: ${cfg.language} (ui=${cfg.uiDir}, api=${cfg.apiDir}). ` +
      `The hooks block newly introduced violations of AGENT_FRONTEND_GUIDE.md §11. ` +
      `Compose primitives from the inventory (Profile §0.7); no styling/hardcoding outside the UI layer; all I/O via the typed client; STOP-and-ask when a primitive/token is missing.`
    )
  }
} catch { process.exit(0) }
