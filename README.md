# frontend-master

Переносимый **скил + движок**, который превращает `AGENT_FRONTEND_GUIDE.md` из
пассивного текста в **принудительную** дисциплину — в любом проекте и под **любой UI-язык**.
Ноль зависимостей (нужен только Node 18+).

Что внутри:

- **Гайд** — `AGENT_FRONTEND_GUIDE.md` (модель ЯДРО+ПРОФИЛЬ). Что читает агент.
- **Скил** — `SKILL.md`. Онбординг: ряд вопросов + порядок шагов + сбор данных о проекте + аудит.
- **Движок** — `guard.mjs`. Автоматизируемый срез §11, **с автоопределением языка/путей**. Библиотека + CLI, без зависимостей.
- **Хуки** — энфорсят в трёх точках:
  - `hooks/claude-pretooluse.mjs` — Claude Code: блокирует нарушение в момент правки агентом.
  - `hooks/session-start.mjs` — Claude Code: при старте сессии на UI-проекте сам представляется и зовёт онбординг.
  - `hooks/pre-commit` — git: на коммите, для любого разработчика (даже без Claude Code).

Все хуки зовут один `guard.mjs` и читают один `guard.config.json`.

---

## Установка из GitHub (одной командой / ссылкой)

Нужен только Node ≥ 18. Любым из трёх способов:

**1. npx — одна команда (глобально, на все проекты):**
```sh
npx github:Odissey-Venetikidi/frontend-guard
```
В один проект: `npx github:Odissey-Venetikidi/frontend-guard install`

**2. По ссылке (curl):**
```sh
curl -fsSL https://raw.githubusercontent.com/Odissey-Venetikidi/frontend-guard/main/bootstrap.sh | sh
```

**3. git clone:**
```sh
git clone https://github.com/Odissey-Venetikidi/frontend-guard ~/frontend-guard
node ~/frontend-guard/setup.mjs       # глобально (~/.claude, на все проекты)
# node ~/frontend-guard/install.mjs    # либо в текущий проект
```

После любого способа — **перезапусти Claude Code** (хуки грузятся при старте сессии).
Снять: `node ~/.claude/skills/frontend-guard/setup.mjs --uninstall` (`--purge` — и папку скила).

---

## Два способа поставить

### 1. Глобально (рекомендую) — «поставил один раз, работает на всех проектах»
```sh
node setup.mjs          # из склонированного репозитория
```
Кладёт скил+движок в `~/.claude/skills/frontend-guard/` и вешает два хука уровня
пользователя в `~/.claude/settings.json` (PreToolUse + SessionStart). После этого **каждый**
UI-проект (React/Vue/Svelte, Flutter, SwiftUI) энфорсится автоматически — без установки в проект.
Перезапусти Claude Code, чтобы хуки подхватились.

Снести: `node ~/.claude/skills/frontend-guard/setup.mjs --uninstall` (бэкап настроек делается автоматически; `--purge` удалит и папку скила).

### 2. В один проект (для команды/репозитория)
```sh
node install.mjs               # в текущую папку
node install.mjs /path/to/app  # в другой проект
```
Кладёт kit в `<проект>/.frontend-guard/`, скил в `.claude/skills/frontend-guard/`, мержит
`.claude/settings.json`, ставит git pre-commit, добавляет `lint:ui`. Закоммить `.frontend-guard/`
+ `guard.config.json` — git-хук заработает у всех в команде.

Оба установщика **идемпотентны** и ничего не перезатирают молча (существующие хуки сохраняются).

---

## Онбординг (что происходит при первом запуске)

Скил `frontend-guard` ведёт по шагам:
1. **Сбор данных** — `guard.mjs --audit` + чтение манифеста (package.json / pubspec.yaml /
   Package.swift), определение языка, ui/api-слоёв, инвентаря примитивов, токенов.
2. **Вопросы** — короткий ряд вопросов (через AskUserQuestion), только то, что не определилось:
   стек, ui-слой, api-слой, конвенция токенов, строгость.
3. **Конфиг + Профиль** — `guard.mjs --init` пишет `guard.config.json`, заполняется §0 Профиль гайда.
4. **Аудит** — отчёт: есть ли ui/api-слои, бэклог нарушений по правилам и хотспотам (это **бэклог
   миграции, не блокер** — хуки блокируют только НОВЫЕ нарушения).
5. **Энфорс** — хуки уже активны (глобально) или ставятся в проект.

SessionStart-хук на любом UI-проекте сам впрыскивает агенту контекст: «это `<язык>` UI-проект,
не онбордился — запусти онбординг; правила уже живут».

---

## Под любой язык

| Язык | Пакет правил | error | warn |
|---|---|---|---|
| Web (React/Vue/Svelte/JS/TS) | `web` | нативные button/select/input/dialog вне ui · стили вне ui · window.confirm/alert · raw fetch вне api | хардкод стилей · fa-иконки |
| Flutter (Dart) | `flutter` | raw http/Dio вне data-слоя | showDialog · Color(0x..) · TextStyle(fontSize:) · print |
| SwiftUI (Swift) | `swiftui` | raw URLSession вне networking | hardcoded color/font · print |
| Любой другой | `generic` | — (движок инертен) | — |

Язык определяется сам (package.json / pubspec.yaml / Package.swift). Для языка без пакета —
**принципы всё равно действуют** (гайд + аудит + ревью), а в `guard.config.json` можно добавить
`customRules` (свои regex под native-элементы / raw-I/O / хардкод этого языка). На не-UI проекте
(бэкенд без UI-зависимостей) движок **инертен** — глобальный хук молчит.

---

## Конфиг (`guard.config.json` в корне проекта)

```jsonc
{ "language": "web", "uiDir": "src/ui", "enforcedDirs": ["src"], "apiDir": "src/api",
  "customRules": [], "rules": { "no-emdash-ui-string": "warn" } }
```
| Ключ | Значение |
|---|---|
| `language` | `web` \| `flutter` \| `swiftui` \| `generic` (или удали — определится сам) |
| `uiDir` | единственное место, где разрешён CSS / нативные примитивы |
| `enforcedDirs` | где действуют правила (ui/api/app-chrome вырезаются по правилам) |
| `apiDir` | единственное место, где разрешён сырой I/O |
| `rules` | переопределение severity: `error` (блок) \| `warn` \| `off` |
| `customRules` | свои правила под любой язык (см. `guard.config.example.json`) |

`node guard.mjs --init` сгенерит конфиг из автоопределения.

---

## Delta-режим и обход

Хуки блокируют только **новые** нарушения, которые вносит правка (сравнение со старой версией /
с HEAD). Легаси-файл с уже существующим нарушением — не блокируется (§10: миграция отдельным
проходом). Полный скан (`guard.mjs --audit`) показывает весь бэклог.

Обход на один раз: `git commit --no-verify`. Claude Code hook из сессии не обходится (в этом и смысл).

---

## CLI

```sh
node guard.mjs              # полный скан
node guard.mjs --audit      # аудит: структура + сводка нарушений
node guard.mjs --init       # написать guard.config.json из автоопределения
node guard.mjs --staged     # git-staged delta (зовётся pre-commit'ом)
node guard.mjs --lang flutter --json
```
Exit 0 = чисто, 1 = есть error, 2 = ошибка конфига.
