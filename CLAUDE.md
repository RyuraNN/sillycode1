# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SillyCode is an AI-powered campus role-playing simulator that runs inside SillyTavern as an iframe. It's a Vue 3 single-page app that builds into a **single HTML file** (base64-encoded scripts) for embedding via iframe `srcdoc`. The UI and game content are in Chinese.

## Development Commands

All commands run from the `school/` directory:

```bash
cd school
npm install            # Install dependencies (Node ^20.19.0 || >=22.12.0)
npm run dev            # Vite dev server with HMR
npm run build          # Production build → dist/index.html (base64-encoded for SillyTavern iframe)
npm run build:raw      # Unencoded build → dist/index.raw.html (for debugging)
npm run build:all      # Both builds
```

From root:
```bash
npm run project-map    # Regenerate PROJECT_MAP*.md dependency docs
```

No test framework is configured.

## Architecture

### Build Pipeline (Critical)

The build produces a single HTML file via `vite-plugin-singlefile`. A custom Vite plugin (`escapeInlineScriptPlugin` in `vite.config.js`) then base64-encodes all inline `<script>` content. This is required because SillyTavern loads the game via iframe `srcdoc`, where the HTML parser would break any JS containing `<` followed by letters (e.g., `<thinking>` in template strings). The bootstrap script decodes and executes via `Blob` + `import()`.

### State Management — Modular Pinia Actions

The single Pinia store (`src/stores/gameStore.ts`) composes 15 action modules via spread:

```
gameStore.ts → imports and spreads:
  playerActions, inventoryActions, timeActions, academicActions,
  socialActions, classClubActions, electiveActions, eventWeatherActions,
  forumActions, partTimeDeliveryActions, snapshotActions, storageActions,
  yearProgressionActions, schoolRuleActions, ragDiagnosticsActions
```

- **State shape**: `src/stores/gameStoreState.ts` (factory function)
- **TypeScript types**: `src/stores/gameStoreTypes.ts`
- To add a new system: create `src/stores/actions/newActions.ts`, export an actions object, spread it into `gameStore.ts`

### Key Dependency Hubs

- `gameStore.ts` — 57 inbound deps, central state
- `errorUtils.ts` — 34 inbound deps, error handling
- `coursePoolData.js` — 21 inbound deps, course/subject definitions
- `worldbookHelper.js` — 20 inbound deps, worldbook API access

### SillyTavern Integration

The app communicates with SillyTavern via `window.*` APIs injected by the parent frame:
- `window.generate(options)` — request AI text generation (`stClient.js`)
- `window.getCharWorldbookNames()` / `window.getChatWorldbookName()` — worldbook access
- `window.addWorldbookEntry()` / `window.getWorldbookEntry()` — persistent storage
- Type definitions for these APIs live in `school/function/*.d.ts`

**Worldbook is the primary persistence layer** — game state (academics, relationships, NPC data, chat history) is serialized into worldbook entries keyed by category.

### AI Response Parsing

AI responses contain `[GAME_DATA]{json}[/GAME_DATA]` blocks parsed by `src/utils/messageParser.js`. These drive state changes (time, exp, location, items, weather, etc.). Format spec: `school/AI_DATA_FORMAT.md`.

### RAG Memory System

Long-term context via embedding + reranking through SiliconFlow API:
- `src/utils/ragService.js` — embedding/search
- `src/utils/summaryManager.js` — auto-summary generation
- `src/utils/indexedDB.js` — local storage for embeddings
- Setup guide: `school/RAG_TUTORIAL.md`

## Project Structure

```
school/src/
├── components/     # 72 Vue components (GameMain.vue is the central gameplay UI)
├── stores/         # Pinia store + actions/ (15 modules)
├── utils/          # 45+ utilities (AI client, worldbook, academic engine, RAG, etc.)
├── data/           # Static game data (courses, maps, relationships, academics)
├── composables/    # Vue composition hooks
├── types/          # Additional TS definitions
└── styles/         # Global CSS
```

Entry: `index.html` → `src/main.js` → `App.vue` (splash → home → game flow)

## Conventions

- Path alias: `@` → `src/` (configured in `jsconfig.json`)
- Components: PascalCase.vue; Utils: camelCase.js/.ts; Actions: camelCaseActions.ts
- All component state access goes through `useGameStore()` — no direct prop drilling between siblings
- Console logs use `[ModuleName]` prefix for debugging (e.g., `[ST Client]`, `[Worldbook]`, `[RAG]`)
- Terser config reserves `$` and `jQuery` to avoid macro conflicts in SillyTavern context
- Vue template compiler has `hoistStatic: false` to avoid `_hoisted_` variable redeclaration issues in single-file bundle
