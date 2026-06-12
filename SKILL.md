---
name: frontend-guard
description: Onboard and enforce frontend/UI engineering discipline (the AGENT_FRONTEND_GUIDE) in any project and any UI language. Use when setting up the guard in a project, when the frontend-guard folder/skill is added to a project, when starting UI work in a project that has no guard.config.json, or when the user asks to audit the frontend against the design-system rules. Works for web (React/Vue/Svelte/JS/TS), Flutter (Dart), SwiftUI (Swift), and falls back to guide-only review for other languages.
---

# frontend-guard — onboarding & enforcement

You enforce the discipline in `AGENT_FRONTEND_GUIDE.md` (model ЯДРО+ПРОФИЛЬ): UI is a
**composition of canonical primitives**, no styling/hardcoding outside the design
layer, one typed client for all I/O, and **STOP-and-ask** when a primitive/token/icon
is missing. The principles are language-neutral; the names live in the project Profile.

Locate the kit: the linter is `guard.mjs` next to this skill, or `.frontend-guard/guard.mjs`
if the project was installed per-project. Run it with `node <path>/guard.mjs ...`.

## A. ONBOARDING — run this when a project is not yet set up

Do these IN ORDER. Detect first, ask only the gaps, then write config, audit, enforce.

### Step 0 — Gather data (no questions yet)
- Run `node <kit>/guard.mjs --audit` from the project root. It reports the detected
  language, ui/api layer candidates, and current violations.
- Read the manifest: `package.json` (web), `pubspec.yaml` (Flutter), `Package.swift` /
  `*.xcodeproj` (SwiftUI). Note framework and dependencies.
- List likely design-system dirs (`ls` the ui-layer candidate) to learn the **primitive
  inventory** (the components that already exist).
- Look for a token/theme system (CSS `:root` variables, a `tokens`/`theme` file,
  Flutter `ThemeData`, SwiftUI asset catalog).

### Step 1 — Ask the user (AskUserQuestion), one focused batch, pre-filled from Step 0
Ask ONLY what you could not confidently detect. Suggested order:
1. **Stack/language** — confirm the detected language/framework (or correct it).
2. **UI layer dir** — the single place where styling/primitives live (confirm the
   detected candidate or pick the right one).
3. **API/client layer dir** — where all I/O goes through a typed client.
4. **Token convention** — how colors/spacing/typography are expressed (CSS vars prefix,
   utility classes, ThemeData, asset catalog…).
5. **Strictness** — keep defaults (structural rules = error, stylistic = warn) or adjust.
If everything was detected with high confidence, say so and skip straight to Step 2 with
a one-line confirmation instead of a full questionnaire.

### Step 2 — Write the config + fill the Profile
- Run `node <kit>/guard.mjs --init` to write `guard.config.json` from detection, then
  patch it with the user's answers (uiDir, apiDir, language, custom rules, severities).
- Fill **§0 Profile** in `AGENT_FRONTEND_GUIDE.md`: stack, ui/api dirs, token names,
  confirm/alert helper name, the **primitive inventory** (role → name, from Step 0),
  icon registry. The config is the machine half; the Profile is the human half — keep
  them consistent.

### Step 3 — Audit (present the current state)
- Re-run `node <kit>/guard.mjs --audit`. Present the report to the user:
  - whether the ui-layer and api-layer dirs exist (if missing, that is the first thing
    to create — they are load-bearing for every rule);
  - the violation backlog grouped by rule and the hotspot files.
- Frame the backlog as a **migration backlog, not a blocker**: the hooks only block
  NEW violations (delta). Migrating legacy is a separate, opt-in pass (guide §10).

### Step 4 — Enforce
- Per-project (committable, works for the whole team / without Claude Code):
  `node <kit>/install.mjs` — wires the Claude Code hook, git pre-commit, and `lint:ui`.
- Global (already active if the user ran `setup.mjs`): the user-level hooks enforce on
  every project automatically; just confirm `guard.config.json` is present so the rules
  are precise rather than auto-detected.

### Step 5 — Hand off
Summarize: language, ui/api dirs, what the hooks now block, the migration backlog size,
and the next action. From here, follow the guide for all UI work.

## B. ONGOING — every time you write UI in a guarded project

- **Compose primitives.** Before writing markup, check the inventory (Profile §0.7) and
  the ui-layer dir. Reuse; do not reinvent. (guide §1, §2, §10)
- **No styling outside the ui-layer.** No `<style>`/inline-style/style-bindings (web),
  no inline `Color()`/`TextStyle()` (Flutter), no inline color/font (SwiftUI) outside ui.
  Spacing between blocks is the parent's job, not the child's. (guide §3)
- **All I/O through the typed client** in the api/data layer — no raw `fetch`/`http`/
  `URLSession` in views. (guide §5)
- **Dialogs/icons/typography via the helpers/tokens**, never `window.confirm`, raw
  codepoints, or hardcoded sizes. (guide §2.3–§2.5)
- **STOP-and-ask** the moment a needed primitive/token/icon/variant does not exist —
  propose extending it, do NOT bypass with custom markup. Any urge to "temporarily
  hardcode" is the signal to stop. (guide §1, §10)
- The hooks enforce the **mechanical** §11 subset. You still own the judgement parts:
  list-endpoint contracts (§6), commit discipline (§9), Russian UI copy with a plain
  hyphen (§7), STOP-and-ask. Read `AGENT_FRONTEND_GUIDE.md` for the full contract.

## Languages without a rule pack
For languages other than web/Flutter/SwiftUI the linter is inert, but the **principles
still apply** — enforce them by review using the guide, run the structural audit, and
add `customRules` (regex) to `guard.config.json` for that language's native-element /
raw-I/O / hardcoded-style patterns.
