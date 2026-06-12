#!/usr/bin/env node
// frontend-guard — enforce the AGENT_FRONTEND_GUIDE discipline across ANY UI
// language. The PRINCIPLES are language-neutral (compose from primitives, no
// styling/hardcoding outside the design layer, one typed client for I/O,
// STOP-and-ask when something is missing). The automatable subset is enforced by
// per-language "rule packs"; languages without a pack still get the guide + the
// structural audit (principles enforced by review, not lint).
//
// Zero dependencies. Library + CLI. ESM. Single self-contained file (the kit is
// copied around, so packs live inline rather than as fragile relative imports).
//
// CLI:
//   node guard.mjs [paths...]   full scan        |  --staged   git delta (pre-commit)
//   node guard.mjs --audit      project audit    |  --init     write guard.config.json from detection
//   options: --config <p>  --json  --no-warn  --lang <pack>  --help

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

// ===========================================================================
// Path helpers
// ===========================================================================
const toPosix = (p) => p.split(path.sep).join('/')
const exists = (p) => { try { fs.accessSync(p); return true } catch { return false } }
const isDir = (p) => { try { return fs.statSync(p).isDirectory() } catch { return false } }
const PROJECT_MARKERS = ['package.json', 'pubspec.yaml', 'Package.swift', '.git']
const hasProjectMarker = (dir) => PROJECT_MARKERS.some((m) => exists(path.join(dir, m)))
const firstExistingDir = (root, cands) => cands.find((c) => isDir(path.join(root, c))) || null

function globToRe(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') { if (glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++ } else re += '[^/]*' }
    else if ('.+^${}()|[]\\'.includes(c)) re += '\\' + c
    else if (c === '?') re += '[^/]'
    else re += c
  }
  return new RegExp('^' + re + '$')
}
const inDir = (rel, dir) => { if (!dir) return false; const d = toPosix(dir).replace(/\/$/, ''); return rel === d || rel.startsWith(d + '/') }
const inAnyDir = (rel, dirs) => (dirs || []).some((d) => inDir(rel, d))

// ===========================================================================
// Rule helpers — reusable scope predicates so packs stay declarative
// ===========================================================================
const SCOPE = {
  all: () => true,
  nonUi: (rel, cfg) => !inDir(rel, cfg.uiDir),
  nonApi: (rel, cfg) => !inDir(rel, cfg.apiDir),
  nonUiNonChrome: (rel, cfg) => !inDir(rel, cfg.uiDir) && !isAppChrome(rel, cfg),
}
function isAppChrome(rel, cfg) {
  const base = path.basename(rel)
  const noExt = base.replace(/\.[^.]+$/, '')
  return (cfg.appChrome || []).some((a) => base === a || noExt === a)
}

// ===========================================================================
// Language rule packs
// ===========================================================================
// Each rule: { id, text:'code'|'nocomment', scope, patterns:[RegExp], message, default }
// severity = config.rules[id] ?? rule.default ; 'off' disables.

const PACKS = {
  web: {
    label: 'Web (React / Vue / Svelte / JS / TS)',
    extensions: ['.tsx', '.jsx', '.vue', '.svelte', '.ts', '.js', '.mjs', '.cjs'],
    detect: (root) => {
      const pkg = readJSON(path.join(root, 'package.json'))
      if (!pkg) return false
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
      return ['react', 'next', 'preact', 'solid-js', 'svelte', 'vue', 'nuxt', '@angular/core', 'astro'].some((d) => d in deps)
    },
    uiHints: ['src/ui', 'src/components/ui', 'components/ui', 'app/ui', 'src/lib/components', 'src/design'],
    apiHints: ['src/api', 'src/lib/api', 'src/services', 'app/api', 'src/lib/server', 'src/data'],
    enforcedHints: ['src', 'app', 'components', 'lib'],
    rules: [
      { id: 'no-native-interactive', text: 'code', scope: SCOPE.nonUi, default: 'error',
        patterns: [/<button(?=[\s/>])/g, /<select(?=[\s/>])/g, /<dialog(?=[\s/>])/g, /<input\b[^>]*\btype\s*=\s*["'`](?:checkbox|tel|date)["'`]/g],
        message: 'native interactive element — use a UI-layer primitive (guide §2.2)' },
      { id: 'no-styles-outside-ui', text: 'code', scope: SCOPE.nonUiNonChrome, default: 'error',
        patterns: [/<style(?=[\s>])/g, /(?:^|[\s{(])style\s*=\s*["'{]/g, /(?::|v-bind:)style\s*=/g],
        message: 'styles outside the UI layer — compose primitives, no <style>/style=/:style (guide §3)' },
      { id: 'no-window-dialog', text: 'code', scope: SCOPE.all, default: 'error',
        patterns: [/\bwindow\.(?:confirm|alert|prompt)\s*\(/g],
        message: 'window.confirm/alert/prompt — use the confirm/alert helper (guide §2.3)' },
      { id: 'no-raw-fetch-outside-api', text: 'code', scope: SCOPE.nonApi, default: 'error',
        patterns: [/(?<![\w.$])fetch\s*\(/g],
        message: 'raw fetch() outside the API layer — go through the typed client (guide §5)' },
      { id: 'no-hardcoded-style-values', text: 'code', scope: SCOPE.nonUiNonChrome, default: 'warn',
        patterns: [/\b(?:fontSize|fontWeight|lineHeight)\s*:\s*['"0-9]/g, /(?:^|[\s{;])(?:font-size|font-weight|line-height)\s*:/g, /(?:^|[\s{;])color\s*:\s*(?:#|rgb|hsl|['"]|\d)/g, /#[0-9a-fA-F]{3,8}\b/g],
        message: 'hardcoded font/color/size — use type/text utilities and tokens (guide §2.4/§2.5)' },
      { id: 'no-icon-fonts', text: 'nocomment', scope: SCOPE.nonUi, default: 'warn',
        patterns: [/(?:^|["'\s])fa-(?:solid|regular|light|brands|thin|duotone|fw|stack|[a-z]{2,})/g, /&#x?[0-9a-fA-F]+;/g],
        message: 'icon-font class / raw codepoint — use the Icon primitive (guide §2.3)' },
      { id: 'no-emdash-ui-string', text: 'nocomment', scope: SCOPE.nonUi, default: 'off',
        patterns: [/—/g], message: 'em-dash in a UI string — use a plain hyphen "-" (guide §7)' },
    ],
  },

  flutter: {
    label: 'Flutter (Dart)',
    extensions: ['.dart'],
    detect: (root) => exists(path.join(root, 'pubspec.yaml')),
    uiHints: ['lib/ui', 'lib/widgets', 'lib/components', 'lib/design', 'lib/presentation/widgets'],
    apiHints: ['lib/api', 'lib/data', 'lib/services', 'lib/network', 'lib/repositories', 'lib/data/sources'],
    enforcedHints: ['lib'],
    rules: [
      { id: 'no-raw-http-outside-api', text: 'code', scope: SCOPE.nonApi, default: 'error',
        patterns: [/(?<![\w.$])http\.(?:get|post|put|delete|patch)\s*\(/g, /\bDio\s*\(/g],
        message: 'raw http/Dio call outside the data layer — go through the typed client (principle: §5)' },
      { id: 'no-native-dialog', text: 'code', scope: SCOPE.nonUi, default: 'warn',
        patterns: [/\bshowDialog\s*\(/g, /\bshowCupertinoDialog\s*\(/g, /\bshowGeneralDialog\s*\(/g],
        message: 'native showDialog — route confirmations through a dialog helper (principle: §2.3)' },
      { id: 'no-hardcoded-color', text: 'code', scope: SCOPE.nonUi, default: 'warn',
        patterns: [/\bColor\s*\(\s*0x[0-9a-fA-F]{6,8}\s*\)/g],
        message: 'hardcoded Color(0x..) — use ThemeData / design tokens, not raw hex (principle: §2.5/§3)' },
      { id: 'no-hardcoded-textstyle', text: 'code', scope: SCOPE.nonUi, default: 'warn',
        patterns: [/\bTextStyle\s*\([^)]*\bfontSize\s*:/g],
        message: 'inline TextStyle(fontSize:) — use theme text styles / tokens (principle: §2.4)' },
      { id: 'no-print', text: 'code', scope: SCOPE.all, default: 'warn',
        patterns: [/(?<![\w.$])print\s*\(/g], message: 'print() — use a logger (engineering hygiene)' },
    ],
  },

  swiftui: {
    label: 'SwiftUI (Swift)',
    extensions: ['.swift'],
    detect: (root) => exists(path.join(root, 'Package.swift')) || fs.readdirSync(root).some((f) => f.endsWith('.xcodeproj') || f.endsWith('.xcworkspace')),
    uiHints: ['Sources/UI', 'UI', 'Views/Components', 'DesignSystem', 'Components'],
    apiHints: ['Sources/API', 'API', 'Networking', 'Services', 'Data'],
    enforcedHints: ['Sources', 'Views', 'App', '.'],
    rules: [
      { id: 'no-raw-urlsession-outside-api', text: 'code', scope: SCOPE.nonApi, default: 'error',
        patterns: [/URLSession\.shared\.(?:dataTask|data)\b/g, /\.data\s*\(\s*from\s*:/g],
        message: 'raw URLSession outside the networking layer — use the typed client (principle: §5)' },
      { id: 'no-hardcoded-color', text: 'code', scope: SCOPE.nonUi, default: 'warn',
        patterns: [/Color\s*\(\s*red\s*:/g, /Color\s*\(\s*\.sRGB/g, /#[0-9a-fA-F]{6}\b/g],
        message: 'hardcoded color — use the asset catalog / design tokens (principle: §2.5)' },
      { id: 'no-hardcoded-font-size', text: 'code', scope: SCOPE.nonUi, default: 'warn',
        patterns: [/\.font\s*\(\s*\.system\s*\(\s*size\s*:/g],
        message: 'inline .font(.system(size:)) — use a design-token text style (principle: §2.4)' },
      { id: 'no-print', text: 'code', scope: SCOPE.all, default: 'warn',
        patterns: [/(?<![\w.$])print\s*\(/g], message: 'print() — use a logger (engineering hygiene)' },
    ],
  },

  generic: {
    label: 'Generic (no automated rule pack)',
    extensions: ['.ts', '.js', '.tsx', '.jsx', '.vue', '.svelte', '.dart', '.swift', '.kt', '.py', '.rb', '.go', '.rs'],
    detect: () => false, // never auto-selected; used as inert fallback
    uiHints: ['src/ui', 'lib/ui', 'ui'],
    apiHints: ['src/api', 'lib/api', 'api'],
    enforcedHints: ['src', 'lib', 'app'],
    rules: [], // principles enforced by the guide + audit + review, not regex
  },
}

// ===========================================================================
// Config + detection
// ===========================================================================
function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
const SEVERITIES = new Set(['error', 'warn', 'off'])

export function detectLanguage(root) {
  for (const name of ['flutter', 'swiftui', 'web']) {
    try { if (PACKS[name].detect(root)) return name } catch {}
  }
  return null
}

export const DEFAULT_CONFIG = {
  language: 'web',
  uiDir: 'src/ui',
  enforcedDirs: ['src'],
  apiDir: 'src/api',
  appChrome: ['App.vue', 'main.ts', 'main.tsx', 'layout.tsx', 'root-layout.tsx', 'AppSidebar', 'AppTopbar', 'AppFooter', 'AppBottomNav'],
  ignore: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/*.d.ts', '**/*.g.dart', '**/*.freezed.dart', '**/node_modules/**', '**/dist/**', '**/.next/**', '**/build/**', '**/.dart_tool/**', '**/Pods/**'],
  extensions: null, // null => use the pack's extensions
  customRules: [], // [{id,text,scopeKind,patterns:[string],message,default}]
  rules: {},
}

// Build a config purely from detection (no guard.config.json present).
export function buildAutoConfig(root) {
  const language = detectLanguage(root)
  if (!language) return { ...DEFAULT_CONFIG, language: null, _inert: true, _dir: path.resolve(root), _auto: true, _file: null }
  const pack = PACKS[language]
  const uiDir = firstExistingDir(root, pack.uiHints) || pack.uiHints[0]
  const apiDir = firstExistingDir(root, pack.apiHints) || pack.apiHints[0]
  const enforcedDirs = pack.enforcedHints.filter((d) => isDir(path.join(root, d)))
  return {
    ...DEFAULT_CONFIG,
    language, uiDir, apiDir,
    enforcedDirs: enforcedDirs.length ? enforcedDirs : [pack.enforcedHints[0]],
    _dir: path.resolve(root), _auto: true, _file: null,
  }
}

export function loadConfig(startDir = process.cwd(), explicitPath = null) {
  let file = explicitPath
  if (!file) {
    let dir = path.resolve(startDir)
    while (true) {
      const cand = path.join(dir, 'guard.config.json')
      if (exists(cand)) { file = cand; break }
      if (hasProjectMarker(dir)) break // stop at the project root; never adopt a config from an ancestor
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  if (!file) return buildAutoConfig(startDir) // no config => detection-driven (may be inert)

  let user
  try { user = JSON.parse(fs.readFileSync(file, 'utf8')) }
  catch (e) { throw new Error(`guard.config.json is not valid JSON: ${e.message}`) }
  const language = user.language || detectLanguage(path.dirname(file)) || 'web'
  const cfg = {
    ...DEFAULT_CONFIG, ...user, language,
    rules: { ...(user.rules || {}) },
    customRules: user.customRules || [],
    _dir: path.dirname(file), _file: file, _auto: false,
  }
  for (const [k, v] of Object.entries(cfg.rules)) {
    if (!SEVERITIES.has(v)) throw new Error(`rule "${k}" has invalid severity "${v}" (use error|warn|off)`)
  }
  return cfg
}

function activePack(cfg) { return PACKS[cfg.language] || PACKS.generic }

function rulesFor(cfg) {
  const pack = activePack(cfg)
  const custom = (cfg.customRules || []).map((r) => ({
    id: r.id, text: r.text === 'nocomment' ? 'nocomment' : 'code',
    scope: SCOPE[r.scopeKind] || SCOPE.all,
    patterns: (r.patterns || []).map((p) => new RegExp(p, 'g')),
    message: r.message || r.id, default: r.default || 'warn',
  }))
  return [...pack.rules, ...custom]
}

const isIgnored = (rel, cfg) => cfg.ignore.some((g) => globToRe(g).test(rel))

export function isScanned(rel, cfg) {
  rel = toPosix(rel)
  if (cfg._inert) return false
  const exts = cfg.extensions || activePack(cfg).extensions
  if (!exts.some((e) => rel.endsWith(e))) return false
  if (isIgnored(rel, cfg)) return false
  return inAnyDir(rel, cfg.enforcedDirs)
}

// ===========================================================================
// Sanitizers (blank comments always; optionally string contents)
// ===========================================================================
// A '/' begins a regex literal (not division) when the previous significant char
// implies "expression expected". Conservative set — excludes ')', ']', '}', '<',
// '>', identifiers, digits, '/' so JSX closing tags and division aren't mis-read.
const REGEX_PREV = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';', '+', '*', '%', '^'])

function sanitize(text, { blankStrings }) {
  const out = text.split('')
  const n = text.length
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' ' }
  const stack = [] // frames: {t:'tpl'} | {t:'interp', depth} — supports nested templates & ${ ... }
  const top = () => stack[stack.length - 1]
  let i = 0, lastSig = ''
  while (i < n) {
    // template literal body (only when its ${} interpolation is NOT the active frame)
    if (top() && top().t === 'tpl') {
      let j = i
      while (j < n) {
        if (text[j] === '\\') { j += 2; continue }
        if (text[j] === '`') break
        if (text[j] === '$' && text[j + 1] === '{') break
        j++
      }
      if (blankStrings) blank(i, j)
      if (j >= n) { i = n; break }
      if (text[j] === '`') { stack.pop(); i = j + 1; lastSig = '`'; continue }
      stack.push({ t: 'interp', depth: 0 }); i = j + 2; lastSig = ''; continue // enter ${ ... }
    }
    const c = text[i], d = text[i + 1]
    if (c === '/' && d === '/') { let j = i + 2; while (j < n && text[j] !== '\n') j++; blank(i, j); i = j; continue }
    if (c === '/' && d === '*') { let j = i + 2; while (j < n && !(text[j] === '*' && text[j + 1] === '/')) j++; j = Math.min(n, j + 2); blank(i, j); i = j; continue }
    if (c === '<' && text.startsWith('<!--', i)) { let j = i + 4; while (j < n && !text.startsWith('-->', j)) j++; j = Math.min(n, j + 3); blank(i, j); i = j; continue }
    if (c === "'" || c === '"') {
      const q = c; let j = i + 1
      while (j < n) { if (text[j] === '\\') { j += 2; continue } if (text[j] === q || text[j] === '\n') break; j++ }
      if (blankStrings) blank(i + 1, j)
      i = (j < n && text[j] === q) ? j + 1 : j; lastSig = q; continue
    }
    if (c === '`') { stack.push({ t: 'tpl' }); i++; lastSig = '`'; continue }
    if (c === '/' && (lastSig === '' || REGEX_PREV.has(lastSig))) { // regex literal
      let j = i + 1, cls = false
      while (j < n) {
        const ch = text[j]
        if (ch === '\\') { j += 2; continue }
        if (ch === '\n') break
        if (ch === '[') cls = true
        else if (ch === ']') cls = false
        else if (ch === '/' && !cls) break
        j++
      }
      if (blankStrings) blank(i + 1, j)
      i = (j < n && text[j] === '/') ? j + 1 : j; lastSig = '/'; continue
    }
    if (top() && top().t === 'interp') { // brace-track to find the ${ ... } close
      if (c === '{') top().depth++
      else if (c === '}') { if (top().depth === 0) { stack.pop(); i++; lastSig = '}'; continue } top().depth-- }
    }
    if (!/\s/.test(c)) lastSig = c
    i++
  }
  return out.join('')
}

export function lintText(text, rel, cfg) {
  rel = toPosix(rel)
  if (!isScanned(rel, cfg)) return []
  const codeLines = sanitize(text, { blankStrings: true }).split('\n')
  const ncLines = sanitize(text, { blankStrings: false }).split('\n')
  const rawLines = text.split('\n')
  const out = []
  for (const rule of rulesFor(cfg)) {
    const severity = cfg.rules[rule.id] ?? rule.default
    if (severity === 'off') continue
    if (!rule.scope(rel, cfg)) continue
    const lines = rule.text === 'code' ? codeLines : ncLines
    for (let li = 0; li < lines.length; li++) {
      const seen = [] // [start,end] of matches already taken on this line (dedupe overlapping patterns)
      for (const re of rule.patterns) {
        re.lastIndex = 0
        let m
        while ((m = re.exec(lines[li])) !== null) {
          const start = m.index, end = m.index + (m[0].length || 1)
          if (!seen.some(([s, e]) => start < e && end > s)) {
            seen.push([start, end])
            out.push({ rule: rule.id, severity, file: rel, line: li + 1, col: start + 1, message: rule.message, match: m[0], snippet: (rawLines[li] || '').trim().slice(0, 200) })
          }
          if (m.index === re.lastIndex) re.lastIndex++
        }
      }
    }
  }
  return out
}

// ===========================================================================
// Delta (only flag INTRODUCED violations)
// ===========================================================================
// Key on the matched TOKEN (whitespace-stripped), not the whole line — so editing
// other text on a line that already holds a legacy violation does not look "new".
const keyOf = (v) => `${v.rule}::${(v.match || v.snippet || '').replace(/\s+/g, '')}`
export function diffIntroduced(oldV, newV) {
  const counts = new Map()
  for (const v of oldV) counts.set(keyOf(v), (counts.get(keyOf(v)) || 0) + 1)
  const introduced = []
  for (const v of newV) {
    const k = keyOf(v), rem = counts.get(k) || 0
    if (rem > 0) counts.set(k, rem - 1); else introduced.push(v)
  }
  return introduced
}

// ===========================================================================
// Walk
// ===========================================================================
export function walkFiles(root, cfg) {
  const abs = path.resolve(cfg._dir, root)
  const found = []
  const stack = [abs]
  while (stack.length) {
    const cur = stack.pop()
    let st; try { st = fs.statSync(cur) } catch { continue }
    if (st.isDirectory()) {
      const rel = toPosix(path.relative(cfg._dir, cur))
      if (rel && isIgnored(rel + '/x', cfg)) continue
      for (const name of fs.readdirSync(cur)) stack.push(path.join(cur, name))
    } else {
      const rel = toPosix(path.relative(cfg._dir, cur))
      if (isScanned(rel, cfg)) found.push(cur)
    }
  }
  return found.sort()
}

function scanAll(cfg, roots) {
  const list = roots && roots.length ? roots : cfg.enforcedDirs
  const violations = []
  for (const r of list) {
    const abs = path.resolve(cfg._dir, r)
    if (exists(abs) && fs.statSync(abs).isFile()) {
      const rel = toPosix(path.relative(cfg._dir, abs))
      if (isScanned(rel, cfg)) violations.push(...lintText(fs.readFileSync(abs, 'utf8'), rel, cfg))
    } else {
      for (const f of walkFiles(r, cfg)) {
        const rel = toPosix(path.relative(cfg._dir, f))
        violations.push(...lintText(fs.readFileSync(f, 'utf8'), rel, cfg))
      }
    }
  }
  return violations
}

// ===========================================================================
// Audit — structural state + violation summary
// ===========================================================================
export function runAudit(cfg) {
  const pack = activePack(cfg)
  const violations = cfg._inert ? [] : scanAll(cfg, cfg.enforcedDirs)
  const byRule = {}
  for (const v of violations) byRule[v.rule] = (byRule[v.rule] || 0) + 1
  const byFile = {}
  for (const v of violations) byFile[v.file] = (byFile[v.file] || 0) + 1
  const hotspots = Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 10)
  return {
    language: cfg.language, pack: pack.label, inert: !!cfg._inert, auto: !!cfg._auto,
    uiDir: cfg.uiDir, uiDirExists: isDir(path.join(cfg._dir, cfg.uiDir || '')),
    apiDir: cfg.apiDir, apiDirExists: isDir(path.join(cfg._dir, cfg.apiDir || '')),
    enforcedDirs: cfg.enforcedDirs,
    errors: violations.filter((v) => v.severity === 'error').length,
    warnings: violations.filter((v) => v.severity === 'warn').length,
    byRule, hotspots, violations,
  }
}

// ===========================================================================
// CLI
// ===========================================================================
function git(args, cfg) {
  try { return execFileSync('git', args, { cwd: cfg._dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) }
  catch { return null }
}
function fmt(v) {
  const tag = v.severity === 'error' ? 'ERROR' : 'WARN '
  return `  ${tag} ${v.file}:${v.line}:${v.col}  [${v.rule}]\n        ${v.message}\n        > ${v.snippet}`
}
function report(violations, { json }) {
  if (json) { process.stdout.write(JSON.stringify(violations, null, 2) + '\n'); return }
  if (!violations.length) { console.log('frontend-guard: clean ✓'); return }
  const e = violations.filter((v) => v.severity === 'error').length
  const w = violations.filter((v) => v.severity === 'warn').length
  console.log('frontend-guard:')
  for (const v of violations) console.log(fmt(v))
  console.log(`\n  ${e} error(s), ${w} warning(s)`)
}

function printAudit(a, json) {
  if (json) { process.stdout.write(JSON.stringify(a, null, 2) + '\n'); return }
  console.log('frontend-guard audit')
  console.log(`  language : ${a.language || '(none detected — inert)'}  [${a.pack}]${a.auto ? '  (auto-detected, no guard.config.json)' : ''}`)
  if (a.inert) { console.log('  This is not a recognized UI project — guard stays inert here.'); return }
  console.log(`  ui layer : ${a.uiDir}  ${a.uiDirExists ? '✓ exists' : '✗ MISSING — create it; it is the only place styling/primitives live'}`)
  console.log(`  api layer: ${a.apiDir}  ${a.apiDirExists ? '✓ exists' : '✗ MISSING — create it; all I/O goes through the typed client'}`)
  console.log(`  scanned  : ${a.enforcedDirs.join(', ')}`)
  console.log(`  result   : ${a.errors} error(s), ${a.warnings} warning(s)`)
  if (Object.keys(a.byRule).length) {
    console.log('  by rule  :')
    for (const [r, n] of Object.entries(a.byRule).sort((x, y) => y[1] - x[1])) console.log(`     ${String(n).padStart(4)}  ${r}`)
  }
  if (a.hotspots.length) {
    console.log('  hotspots :')
    for (const [f, n] of a.hotspots) console.log(`     ${String(n).padStart(4)}  ${f}`)
  }
  console.log(a.errors ? '\n  Migration is a SEPARATE pass (guide §10): the hooks only block NEW violations, not this backlog.' : '\n  Clean ✓')
}

function runCli(argv) {
  const args = argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`frontend-guard — enforce AGENT_FRONTEND_GUIDE across any UI language
usage:
  node guard.mjs [paths...]   full scan (default: enforcedDirs)
  node guard.mjs --staged     git-staged delta (used by pre-commit)
  node guard.mjs --audit      project audit (structure + violation summary)
  node guard.mjs --init       write guard.config.json from auto-detection
  options: --config <p>  --json  --no-warn  --lang <web|flutter|swiftui|generic>  --help`)
    return 0
  }
  let configPath = null, staged = false, json = false, noWarn = false, audit = false, init = false, lang = null
  const paths = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--config') configPath = args[++i]
    else if (a === '--lang') lang = args[++i]
    else if (a === '--staged') staged = true
    else if (a === '--json') json = true
    else if (a === '--no-warn') noWarn = true
    else if (a === '--audit') audit = true
    else if (a === '--init') init = true
    else paths.push(a)
  }

  if (init) {
    const root = process.cwd()
    const cfg = buildAutoConfig(root)
    if (cfg._inert) { console.log('frontend-guard --init: no UI project detected here (no package.json UI deps / pubspec.yaml / Swift project). Nothing written.'); return 0 }
    const out = {
      language: cfg.language, uiDir: cfg.uiDir, enforcedDirs: cfg.enforcedDirs, apiDir: cfg.apiDir,
      appChrome: DEFAULT_CONFIG.appChrome, ignore: DEFAULT_CONFIG.ignore, customRules: [], rules: {},
    }
    const dest = path.join(root, 'guard.config.json')
    if (exists(dest)) { console.log('guard.config.json already exists — left untouched. Detected: ' + JSON.stringify({ language: cfg.language, uiDir: cfg.uiDir, apiDir: cfg.apiDir })); return 0 }
    fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n')
    console.log('frontend-guard --init: wrote guard.config.json')
    console.log('  detected: ' + JSON.stringify({ language: cfg.language, uiDir: cfg.uiDir, apiDir: cfg.apiDir, enforcedDirs: cfg.enforcedDirs }, null, 0))
    console.log('  REVIEW IT — confirm the ui/api dirs and primitive inventory match reality.')
    return 0
  }

  let cfg
  try { cfg = loadConfig(process.cwd(), configPath) }
  catch (e) { console.error('frontend-guard: ' + e.message); return 2 }
  if (lang) { cfg.language = lang; cfg.extensions = null } // use the forced pack's extensions

  if (audit) { printAudit(runAudit(cfg), json); return runAudit(cfg).errors ? 1 : 0 }

  if (cfg._inert) { if (!json) console.log('frontend-guard: not a recognized UI project here — inert.'); else process.stdout.write('[]\n'); return 0 }

  let violations = []
  if (staged) {
    const list = (git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'], cfg) || '').split('\n').map((s) => s.trim()).filter(Boolean)
    for (const rel of list) {
      if (!isScanned(toPosix(rel), cfg)) continue
      const newText = git(['show', `:${rel}`], cfg) ?? ''
      const oldText = git(['show', `HEAD:${rel}`], cfg) ?? ''
      violations.push(...diffIntroduced(lintText(oldText, rel, cfg), lintText(newText, rel, cfg)))
    }
  } else {
    violations = scanAll(cfg, paths)
  }
  if (noWarn) violations = violations.filter((v) => v.severity === 'error')
  report(violations, { json })
  return violations.some((v) => v.severity === 'error') ? 1 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) process.exit(runCli(process.argv))
