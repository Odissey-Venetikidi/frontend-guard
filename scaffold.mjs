#!/usr/bin/env node
// frontend-guard CLAUDE scaffolder — create the canonical Claude Code architecture
// in a project: the .claude/ "brain" (skills/, agents/, commands/, hooks/, plugins/,
// statusline.sh, settings*.json) plus CLAUDE.md, CLAUDE.local.md, .mcp.json and the
// memory-bank/ (progress / decisions / insights).
//
//   node /path/to/frontend-guard/scaffold.mjs [targetDir]   (default: cwd)
//     --force        overwrite files that already exist (default: never clobber)
//     --quiet        only print the summary line
//
// Idempotent: every file is written only if missing (unless --force). Re-running it
// fills in whatever is absent and keeps everything you already have. Safe to run on an
// existing project — it never touches your source, only adds the Claude scaffold.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ---- file contents -----------------------------------------------------------------
// NOTE: contents are template literals — they intentionally avoid backticks and the
// ${ sequence so nothing is mis-interpreted as interpolation. projectName is the one
// deliberate interpolation.

function files(projectName) {
  return {
    // ── root: rules + personal + mcp ───────────────────────────────────────────────
    'CLAUDE.md': `# ${projectName} — инструкции проекта

> Главный файл правил для Claude. Держи его коротким (до ~200 строк) и конкретным.
> Без CLAUDE.md агент угадывает, а не работает.

## Стандарты
- <язык/стек: напр. TypeScript strict, без any>
- <библиотека иконок / UI-кит>
- <тема, форматирование, линтер>

## Архитектура
- <ключевые решения: стейт-менеджер, слои, границы>
- <что где лежит: ui-слой, api-слой, данные>

## Формат коммита
- <PREFIX-XXX>: суть одной строкой
- объясни *почему*, не *что*

## Никогда
- не пушить без явного «иди»
- не хардкодить стили вне ui-слоя (см. AGENT_FRONTEND_GUIDE / frontend-guard)
- не ходить в сеть мимо типизированного клиента
`,

    'CLAUDE.local.md': `# Личные заметки (CLAUDE.local.md)

Персональные правки поверх CLAUDE.md. Файл в .gitignore — НЕ коммитится.
Сюда: локальные пути, временные напоминания, личные предпочтения по стилю общения.

- <твоё...>
`,

    '.mcp.json': `{
  "mcpServers": {}
}
`,

    // ── memory-bank: что было, решения, инсайты ────────────────────────────────────
    'memory-bank/progress.md': `# Progress — что сделано / в работе

> Живой журнал. Обновляй в конце каждой сессии.

## Сейчас в работе
- <текущая задача>

## Сделано
- <дата> — <что>

## Дальше
- <следующий шаг>
`,

    'memory-bank/decisions.md': `# Decisions — архитектурные решения и «почему»

> Каждое значимое решение: контекст → решение → последствия.
> Чтобы через месяц не переоткрывать «а почему так».

## <дата> — <решение>
- Контекст: <что заставило выбирать>
- Решение: <что выбрали>
- Почему: <обоснование, отвергнутые альтернативы>
`,

    'memory-bank/insights.md': `# Insights — находки, грабли, что не повторять

> Уроки, на которые уже наступали. Сюда — чтобы не наступить снова.

- <грабли> → <вывод>
`,

    // ── .claude/skills ─────────────────────────────────────────────────────────────
    '.claude/skills/README.md': `# skills/ — навыки, которые Claude берёт сам

Один скилл = одна папка + SKILL.md внутри (model-invokable).
Claude сам решает, когда подгрузить, по полю description в шапке.
Сохраняется между всеми сессиями.

Рядом — пример: example-skill/SKILL.md. Переименуй папку и наполни.
`,

    '.claude/skills/example-skill/SKILL.md': `---
name: example-skill
description: <когда применять — по этому описанию Claude решает подгрузить скилл>
---

# Example Skill

Опиши, что делает скилл и КОГДА он срабатывает. Это новый промпт, который Claude
подхватывает сам.

## Когда срабатывать
- <пользователь говорит «...»>
- <файл .tsx / .vue / .svelte / .html>
- <тип проекта: дашборд / SaaS / ...>

## Как действовать
- <шаг 1>
- <шаг 2>

## Источник
- <MCP / доки / примеры>
`,

    // ── .claude/agents ─────────────────────────────────────────────────────────────
    '.claude/agents/README.md': `# agents/ — суб-агенты со своим контекстом

Каждый агент работает в изоляции: свои инструменты, права, контекст.
Можно запускать несколько параллельно. Один файл = один агент.
Один Claude становится командой.
`,

    '.claude/agents/example-agent.md': `---
name: example-agent
description: <когда вызывать этого агента>
tools: Read, Grep, Glob
---

# Example Agent

Ты — <роль, напр. сеньор-инженер>. <Тон и правила.>

## Делай / Проверяй
- <пункт>
- <пункт>
- <пункт>

# У этого агента — свой контекст.
`,

    // ── .claude/commands ───────────────────────────────────────────────────────────
    '.claude/commands/README.md': `# commands/ — слэш-команды по имени файла

Каждый .md становится /имя-команды. Ты решаешь, когда запускать.
Готовые workflow на тапе — самый быстрый UX.

Рядом — рабочая команда commit.md -> /commit (коммит-сообщение на русском)
и пример example-command.md -> /example-command.
`,

    '.claude/commands/commit.md': `---
description: закоммитить текущую работу в git с понятным сообщением на русском
---

# /commit

Закоммить текущую работу в git. Само срабатывание /commit — это уже разрешение коммитить,
отдельного «иди» не жди. Не заставляй пользователя заполнять сообщение — пиши его сам.

## Шаги
1. git status + git diff HEAD (и staged, и unstaged) — пойми, что менялось и *почему*.
2. Если коммитить нечего — скажи и остановись.
3. Сделай историю удобной для отката:
   - Несколько независимых смысловых групп — несколько коммитов подряд (git add <файлы> на группу),
     чтобы в ветке были отдельные точки отката.
   - Одна связная правка — один коммит (git add -A).
   - По умолчанию коммить все изменения; если пользователь сам собрал staged — коммить только его.
4. Сообщение на русском:
   - Subject — <=50 символов, повелительное наклонение: «Добавь…», «Исправь…», «Обнови…».
   - Тело — маркированный список: что сделано и зачем. Обычный дефис, без длинного тире.
   - Если в проекте есть префикс задач (NM-123) — в начало subject.
5. git commit, затем покажи git log --oneline -5.

## Никогда
- не git push без отдельного явного подтверждения;
- не коммить, если нечего коммитить;
- не писать «что» там, где важнее «почему».
`,

    '.claude/commands/example-command.md': `---
description: <что делает команда — одной строкой>
---

# /example-command

Опиши шаги, которые Claude выполнит по этой команде.

## Формат / Правила
- <пункт>
- <пункт>

## Никогда
- <что нельзя делать без подтверждения>
`,

    // ── .claude/hooks ──────────────────────────────────────────────────────────────
    '.claude/hooks/README.md': `# hooks/ — скрипты, которые срабатывают всегда

Запускаются до или после инструмента Claude (PreToolUse / PostToolUse).
Блокируют опасное автоматически — без вопросов, без исключений. Это твои ограждения.

Подключаются в .claude/settings.json -> "hooks".
Пример рядом (example-hook.sh) НЕ подключён — это образец.
`,

    '.claude/hooks/example-hook.sh': `#!/usr/bin/env bash
# Пример PostToolUse-хука: авто-формат файла, который правит Claude.
# Подключи в .claude/settings.json -> hooks.PostToolUse, чтобы заработал.
# Срабатывает после каждого Edit. Без вопросов.

FILE=$(jq -r '.tool_input.file_path' 2>/dev/null)
[ -z "$FILE" ] && exit 0

case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx) npx prettier --write "$FILE" ;;
  *.py)                  ruff format "$FILE" ;;
  *.go)                  gofmt -w "$FILE" ;;
esac
`,

    // ── .claude/plugins ────────────────────────────────────────────────────────────
    '.claude/plugins/README.md': `# plugins/ — первый класс в 2026

Плагины пакуют агентов + команды + хуки + MCP в один установимый набор.
Ставятся один раз — работают везде. Можно делиться с командой и переносить.

Рядом — пример: example-plugin/plugin.json.
`,

    '.claude/plugins/example-plugin/plugin.json': `{
  "name": "example-plugin",
  "version": "0.1.0",
  "description": "<что делает плагин>",
  "author": "<ты>",
  "agents": [],
  "commands": [],
  "hooks": []
}
`,

    // ── .claude/ statusline + settings ─────────────────────────────────────────────
    '.claude/statusline.sh': `#!/usr/bin/env bash
# Нижний бар Claude Code: ветка · модель.
# Подключи в .claude/settings.json:
#   "statusLine": { "type": "command", "command": ".claude/statusline.sh" }
input=$(cat)
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "—")
model=$(printf '%s' "$input" | jq -r '.model.display_name // "Claude"' 2>/dev/null)
printf '⎇ %s · %s' "$branch" "$model"
`,

    // settings.json: minimal & safe skeleton. install.mjs merges its hooks into this.
    '.claude/settings.json': `{
  "permissions": {
    "allow": [],
    "deny": []
  }
}
`,

    '.claude/settings.local.json': `{}
`,

    // full reference (the carousel example) — read-only documentation, never active.
    '.claude/settings.example.json': `{
  "model": "claude-opus-4-8",
  "permissions": {
    "allow": ["Bash(npm run *)", "Bash(git *)", "Read", "Edit", "Glob", "Grep"],
    "deny": ["Bash(rm -rf *)"]
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": ".claude/hooks/example-hook.sh" }]
      }
    ]
  },
  "outputStyle": "terse",
  "statusLine": { "type": "command", "command": ".claude/statusline.sh" }
}
`,
  }
}

// files that should never enter git once they exist in a project
const GITIGNORE_LINES = ['CLAUDE.local.md', '.claude/settings.local.json']
// files that must be executable
const EXECUTABLE = new Set(['.claude/hooks/example-hook.sh', '.claude/statusline.sh'])

// ---- core ---------------------------------------------------------------------------

export function scaffold(targetDir, { force = false, quiet = false } = {}) {
  const TARGET = path.resolve(targetDir || process.cwd())
  if (!fs.existsSync(TARGET) || !fs.statSync(TARGET).isDirectory()) {
    throw new Error('Target is not a directory: ' + TARGET)
  }
  const projectName = path.basename(TARGET)
  const tree = files(projectName)
  const say = (m) => { if (!quiet) console.log(m) }

  let created = 0, kept = 0
  for (const [rel, content] of Object.entries(tree)) {
    const dest = path.join(TARGET, rel)
    const exists = fs.existsSync(dest)
    if (exists && !force) { kept++; say('  · ' + rel + ' (есть, пропущено)'); continue }
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, content)
    if (EXECUTABLE.has(rel)) { try { fs.chmodSync(dest, 0o755) } catch {} }
    created++
    say('  ' + (exists ? '↻ ' : '✓ ') + rel)
  }

  const gi = ensureGitignore(TARGET, GITIGNORE_LINES)
  if (gi.added.length) say('  ✓ .gitignore += ' + gi.added.join(', '))

  say(`\nCLAUDE-архитектура -> ${TARGET}: ${created} создано, ${kept} сохранено.`)
  return { target: TARGET, created, kept, gitignore: gi.added }
}

// append the given lines to .gitignore if not already covered (idempotent)
function ensureGitignore(target, lines) {
  const giPath = path.join(target, '.gitignore')
  let body = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf8') : ''
  const present = new Set(body.split(/\r?\n/).map((l) => l.trim()))
  const added = lines.filter((l) => !present.has(l))
  if (!added.length) return { added }
  const prefix = body && !body.endsWith('\n') ? '\n' : ''
  const header = body.includes('# Claude (личное, не в git)') ? '' : '\n# Claude (личное, не в git)\n'
  fs.writeFileSync(giPath, body + prefix + header + added.join('\n') + '\n')
  return { added }
}

// ---- CLI ----------------------------------------------------------------------------

const invokedDirectly = (() => {
  try { return path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url) }
  catch { return false }
})()

if (invokedDirectly) {
  const argv = process.argv.slice(2)
  const force = argv.includes('--force')
  const quiet = argv.includes('--quiet')
  const targetArg = argv.find((a) => !a.startsWith('-'))
  const TARGET = path.resolve(targetArg || process.cwd())
  console.log(`frontend-guard scaffold -> ${TARGET}\n`)
  try {
    scaffold(TARGET, { force, quiet })
    console.log(`
Готово. Дальше:
  1. Заполни CLAUDE.md — правила проекта (стек, архитектура, «никогда»).
  2. Положи свои скиллы/агентов/команды в .claude/ (примеры рядом — переименуй и наполни).
  3. settings.example.json — образец панели управления; перенеси нужное в settings.json.
  4. Перезапусти Claude Code, чтобы подхватить .claude/.`)
  } catch (e) {
    console.error('frontend-guard scaffold: ' + e.message)
    process.exit(1)
  }
}
