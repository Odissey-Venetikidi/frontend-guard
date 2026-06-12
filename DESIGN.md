# frontend-guard — design

Status: built 2026-06-12. Derived from the DEMETRA frontend discipline guide, made
portable and self-installing. A skill + engine + hooks that enforce the guide in any
project and any UI language.

## Goal

Drop in once → it works on every project and self-onboards. Turn the guide from a
passive doc into an enforced, portable, multi-language discipline with an onboarding
interview and an audit.

## Components & boundaries

- **`guard.mjs`** — single source of truth for *what is a violation*. Library
  (`lintText`, `loadConfig`/`buildAutoConfig`/`detectLanguage`, `diffIntroduced`,
  `isScanned`, `walkFiles`, `runAudit`) + CLI (`--audit`, `--init`, `--staged`).
  Zero deps, ESM, one self-contained file (packs inline so copying it never breaks
  relative imports). Behaviour is parameterized by `guard.config.json`.
- **Language rule packs** (inline in guard.mjs): `web`, `flutter`, `swiftui`, and an
  inert `generic`. Each pack declares extensions, a `detect()` predicate, dir hints,
  and declarative rules `{id, text, scope, patterns, default}`. Adding a language =
  adding a pack (or `customRules` in config). Principles are language-neutral; packs
  cover the mechanically detectable subset per language.
- **`guard.config.json`** — machine half of the guide's §0 Profile. Optional: if
  absent the engine auto-detects language + ui/api dirs. On a non-UI project the
  config is `_inert` and the engine does nothing (keeps the global hook safe).
- **`hooks/claude-pretooluse.mjs`** — Claude Code adapter. Reconstructs post-edit
  content (Write: `content`; Edit/MultiEdit: read disk + apply), lints, blocks via
  `exit 2` + stderr only on *introduced* errors. Fail-open. Imports guard.mjs.
- **`hooks/session-start.mjs`** — Claude Code SessionStart adapter. On a detected UI
  project, injects `additionalContext` that nudges onboarding (if no config) or
  confirms the rules are live. Silent on non-UI projects.
- **`hooks/pre-commit`** — git adapter (`guard.mjs --staged`). Works without Claude Code.
- **`SKILL.md`** — agent-facing onboarding procedure (gather data → ask Profile
  questions → write config + Profile → audit → enforce) and the ongoing usage rules.
- **`install.mjs`** — per-project wiring (committable). **`setup.mjs`** — global
  user-level wiring into `~/.claude/` (the "drop in once" path) + `--uninstall`.

Each unit is replaceable in isolation: rules in guard.mjs packs, project shape in
guard.config.json, enforcement points in the thin hook adapters, adoption in the two
installers, agent behaviour in SKILL.md.

## Key decisions

- **Auto-detect + inert fallback** so the global hook can run on *every* project yet
  only act on recognized UI projects (web/Flutter/SwiftUI). No per-project setup
  required; a config just makes it precise.
- **Delta enforcement** (block only *introduced* violations) — editing legacy files
  isn't trapped (guide §10). Full `--audit` still reports the whole backlog.
- **Fail-open** in the Claude hook: any internal error → allow. A guardrail must never
  break legitimate work.
- **Two sanitizer passes** (blank comments always; blank string contents for
  structural rules, keep them for content rules) to cut false positives.
- **Strict by default, globally** (user choice): structural rules are `error`; the
  heuristic per-language rules (hardcoded values, print, dialogs) default to `warn` to
  avoid false-blocking. `web` structural regexes are precise → `error`.
- **Global setup merges, never replaces** user `settings.json`; backs it up; idempotent;
  preserves unrelated hooks (e.g. claude-mem SessionStart); reversible via `--uninstall`.

## Verification (all green, 2026-06-12)

Web/Flutter/inert fixtures (correct flags, ui/api exempt, inert backend silent);
Claude hook (blocks introduced `<button>` via exit 2, allows clean + legacy-delta);
session-start (nudges not-onboarded, confirms onboarded, silent on backend);
project install (engine + skill + both hooks + git hook + npm script);
global setup in a sandbox HOME (copies, preserves a simulated claude-mem hook, backup,
idempotent re-run, clean uninstall keeping the foreign hook).

## Deliberate non-goals

No AST — regex over sanitized text; good for structural rules, heuristic ones stay
non-blocking. Does not enforce judgement parts (list contracts, commit discipline,
STOP-and-ask) — those stay with the agent/human; the guide remains the source of truth.
