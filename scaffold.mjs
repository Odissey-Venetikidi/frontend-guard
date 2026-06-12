#!/usr/bin/env node
// frontend-guard CLAUDE scaffolder — create the canonical Claude Code architecture
// in a project. Everything Claude-related lives UNDER .claude/ (the only dir Claude Code
// discovers): .claude/CLAUDE.md + CLAUDE.local.md, the "brain" (skills/, agents/, commands/,
// hooks/), memory-bank/ (progress/decisions/insights), statusline.sh, settings*.json, plus
// the /test command and the run-tests Stop-hook. Only .mcp.json must stay at the project
// ROOT (Claude Code requires it there). A tests/ folder is scaffolded at the root.
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
    // ── .claude/CLAUDE.md + личное (Claude Code авто-загружает .claude/CLAUDE.md) ───
    '.claude/CLAUDE.md': `# ${projectName} — инструкции проекта

> Главный файл правил для Claude (лежит в .claude/CLAUDE.md, авто-загружается). Держи
> коротким (до ~200 строк) и конкретным. Без CLAUDE.md агент угадывает, а не работает.

## Стандарты
- <язык/стек: напр. TypeScript strict, без any>
- <библиотека иконок / UI-кит>
- <тема, форматирование, линтер>

## Архитектура
- <ключевые решения: стейт-менеджер, слои, границы>
- <что где лежит: ui-слой, api-слой, данные>
- движок дисциплины и конфиг: .claude/frontend-guard/, .claude/guard.config.json
- память проекта: .claude/memory-bank/ (progress / decisions / insights)

## Тесты
- тесты живут в tests/ (или конвенции стека). Раннер определяется автоматически.
- ПОСЛЕ каждой новой фичи/правки — прогнать тесты (/test или хук run-tests), чтобы ничего не сломать.
- сломал тест — чини ПРИЧИНУ в коде, а не подгоняй тест под баг.

## Формат коммита
- <PREFIX-XXX>: суть одной строкой
- объясни *почему*, не *что*

## Никогда
- не пушить без явного «иди»
- не хардкодить стили вне ui-слоя (см. .claude/frontend-guard/AGENT_FRONTEND_GUIDE.md)
- не ходить в сеть мимо типизированного клиента
- не считать работу законченной, пока тесты не зелёные
`,

    '.claude/CLAUDE.local.md': `# Личные заметки (CLAUDE.local.md)

Персональные правки поверх .claude/CLAUDE.md. Файл в .gitignore — НЕ коммитится.
Сюда: локальные пути, временные напоминания, личные предпочтения по стилю общения.

- <твоё...>
`,

    // ── .mcp.json — ЕДИНСТВЕННЫЙ Claude-файл, обязанный лежать в КОРНЕ ──────────────
    '.mcp.json': `{
  "mcpServers": {}
}
`,

    // ── .claude/memory-bank: что было, решения, инсайты ────────────────────────────
    '.claude/memory-bank/progress.md': `# Progress — что сделано / в работе

> Живой журнал. Обновляй в конце каждой сессии.

## Сейчас в работе
- <текущая задача>

## Сделано
- <дата> — <что>

## Дальше
- <следующий шаг>
`,

    '.claude/memory-bank/decisions.md': `# Decisions — архитектурные решения и «почему»

> Каждое значимое решение: контекст → решение → последствия.
> Чтобы через месяц не переоткрывать «а почему так».

## <дата> — <решение>
- Контекст: <что заставило выбирать>
- Решение: <что выбрали>
- Почему: <обоснование, отвергнутые альтернативы>
`,

    '.claude/memory-bank/insights.md': `# Insights — находки, грабли, что не повторять

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

    '.claude/commands/test.md': `---
description: прогнать тесты проекта и починить падения
---

# /test

Определи тест-раннер проекта и прогони тесты. Цель — зелёный прогон после любых изменений.

## Шаги
1. Определи раннер по манифесту/локфайлу:
   - package.json scripts.test -> менеджер из локфайла (npm test / pnpm test / yarn test);
     иначе по зависимостям npx vitest run / npx jest.
   - pubspec.yaml -> flutter test.
   - pyproject.toml / pytest.ini / папка tests с pytest -> pytest -q.
   - go.mod -> go test ./...   | Cargo.toml -> cargo test   | Package.swift -> swift test.
2. Прогони. Падает — читай ПЕРВУЮ ошибку, чини ПРИЧИНУ в коде, а не подгоняй тест.
3. Повтори до зелёного. Кратко отчитайся: что падало и почему.

## Никогда
- не «чинить» тест ослаблением ассерта/мока ради прохода;
- не коммитить с красными тестами;
- не гонять тяжёлые e2e без надобности — сначала unit/smoke.
`,

    // ── .claude/hooks ──────────────────────────────────────────────────────────────
    '.claude/hooks/README.md': `# hooks/ — скрипты, которые срабатывают всегда

Запускаются до или после инструмента Claude (PreToolUse / PostToolUse / Stop).
Блокируют опасное автоматически — без вопросов, без исключений. Это твои ограждения.

Подключаются в .claude/settings.json -> "hooks".
Рядом: example-hook.sh (образец PostToolUse, НЕ подключён) и run-tests.sh
(Stop-хук авто-прогона тестов; подключи в hooks.Stop, по умолчанию advisory — показывает
падения, не блокирует; внутри есть строка, чтобы сделать блокирующим).
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

    '.claude/hooks/run-tests.sh': `#!/usr/bin/env bash
# Stop-хук: когда агент закончил ход — прогнать тесты, если менялись исходники.
# Подключи в .claude/settings.json -> hooks.Stop. По умолчанию ADVISORY (показывает
# результат, не блокирует). Чтобы блокировать стоп при падении — см. конец файла.
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$ROOT" || exit 0

# Гонять только если в этом ходе реально менялись исходники (а не только .md/доки).
if git rev-parse --git-dir >/dev/null 2>&1; then
  CHANGED=$(git status --porcelain 2>/dev/null | grep -iE '\\.(ts|tsx|js|jsx|vue|svelte|dart|swift|py|go|rs)$' || true)
  [ -z "$CHANGED" ] && exit 0
fi

# Автоопределение раннера.
if [ -f package.json ] && grep -q '"test"' package.json; then
  if [ -f pnpm-lock.yaml ]; then CMD="pnpm test"; elif [ -f yarn.lock ]; then CMD="yarn test"; else CMD="npm test"; fi
elif [ -f pubspec.yaml ]; then CMD="flutter test"
elif [ -f go.mod ]; then CMD="go test ./..."
elif [ -f Cargo.toml ]; then CMD="cargo test"
elif [ -f pyproject.toml ] || [ -f pytest.ini ] || [ -d tests ]; then CMD="pytest -q"
else exit 0
fi

echo "run-tests: $CMD" >&2
if $CMD >&2 2>&1; then
  echo "run-tests: OK" >&2
  exit 0
else
  echo "run-tests: ТЕСТЫ ПАДАЮТ — почини причину перед завершением хода." >&2
  exit 0   # ADVISORY. Замени на 'exit 2', чтобы блокировать завершение при падении тестов.
fi
`,

    // ── .claude/plugins (справочно; проектный .claude/plugins НЕ автозагружается) ───
    '.claude/plugins/README.md': `# plugins/ — справочно (НЕ подключается автоматически)

Плагины Claude Code пакуют агентов + команды + хуки + MCP в один набор.
ВАЖНО: проектная папка .claude/plugins/ Claude Code НЕ подхватывает автоматически —
плагины ставятся из маркетплейса (/plugin install) или живут у пользователя (~/.claude).
Для проектных расширений используй .claude/{skills,agents,commands,hooks} — их Claude
Code находит сам. Эта папка оставлена только как напоминание.
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
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": ".claude/hooks/run-tests.sh" }]
      }
    ]
  },
  "outputStyle": "terse",
  "statusLine": { "type": "command", "command": ".claude/statusline.sh" }
}
`,

    // ── tests/ — тесты проекта (в КОРНЕ, по конвенции экосистем; не Claude-конфиг) ──
    'tests/README.md': `# tests/ — тесты проекта

Здесь живут тесты (или используй конвенцию стека: test/, __tests__, *_test.go и т.п.).

Дисциплина: ПОСЛЕ каждой новой фичи или правки — прогнать тесты, чтобы ничего не сломать.
- быстрый прогон: команда /test (определит раннер сам) или хук .claude/hooks/run-tests.sh;
- сломал тест — чини ПРИЧИНУ в коде, не подгоняй тест под баг;
- не считай работу законченной, пока прогон не зелёный.

Раннер определяется автоматически: vitest/jest (package.json), flutter test (pubspec.yaml),
pytest (pyproject/pytest.ini), go test (go.mod), cargo test (Cargo.toml), swift test.
`,
  }
}

// files that should never enter git once they exist in a project
const GITIGNORE_LINES = ['.claude/CLAUDE.local.md', '.claude/settings.local.json']
// files that must be executable
const EXECUTABLE = new Set(['.claude/hooks/example-hook.sh', '.claude/hooks/run-tests.sh', '.claude/statusline.sh'])

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
    // Both ./CLAUDE.md and ./.claude/CLAUDE.md auto-load. If the project already keeps its
    // rules at the root, don't create a duplicate inside .claude/ (same for CLAUDE.local.md).
    if ((rel === '.claude/CLAUDE.md' && fs.existsSync(path.join(TARGET, 'CLAUDE.md'))) ||
        (rel === '.claude/CLAUDE.local.md' && fs.existsSync(path.join(TARGET, 'CLAUDE.local.md')))) {
      kept++; say('  · ' + rel + ' (есть CLAUDE.md в корне — пропущено)'); continue
    }
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
  1. Заполни .claude/CLAUDE.md — правила проекта (стек, архитектура, «никогда»).
  2. Положи свои скиллы/агентов/команды в .claude/ (примеры рядом — переименуй и наполни).
  3. .claude/settings.example.json — образец панели; перенеси нужное в .claude/settings.json
     (в т.ч. hooks.Stop -> .claude/hooks/run-tests.sh для авто-прогона тестов).
  4. Тесты — в tests/; после правок гоняй /test, чтобы ничего не сломать.
  5. Перезапусти Claude Code, чтобы подхватить .claude/.`)
  } catch (e) {
    console.error('frontend-guard scaffold: ' + e.message)
    process.exit(1)
  }
}
