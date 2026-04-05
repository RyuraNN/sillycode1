# Save Migration Regression Checklist

> Scope: verify save/schema migration after commit `dadeafcf1461d65d2f4532ac349f3a4e6f238872`.
> Goal: minimal validation only (no business logic changes).

## Quick Matrix

- [ ] C1: v3 flat save import -> v4 layered state
- [ ] C2: v4 inline old snapshot migration to IndexedDB
- [ ] C3: Delta rollback keeps NPC + rag consistency

---

## Environment

- App: `school`
- Build check: `npm run build`
- Browser: Chrome (recommended)
- Use DevTools `Application` panel to inspect `Local Storage` and `IndexedDB`

### Reset Before Each Case

1. Open app once, then close game/session.
2. In DevTools -> `Application`, clear:
   - `Local Storage` for current origin
   - `IndexedDB` entries for app origin
3. Reload page.

---

## C1 - v3 Flat Save Import -> v4 Layered State

### Input Fixture (minimal v3-style import)

Create file `v3-flat-import.json` with:

```json
{
  "version": 4,
  "snapshots": [
    {
      "id": "1710000000001",
      "timestamp": 1710000000001,
      "label": "v3-flat-import",
      "messageIndex": 0,
      "gameState": {
        "player": {
          "name": "LegacyPlayer",
          "location": "th_main_gate"
        },
        "npcs": [
          { "id": "npc_001", "name": "测试NPC", "hp": 100 }
        ],
        "npcRelationships": {},
        "gameTime": {
          "year": 2025,
          "month": 4,
          "day": 15,
          "weekday": "Tuesday",
          "hour": 14,
          "minute": 30
        },
        "worldState": { "economy": 100 },
        "allClassData": {},
        "allClubs": {},
        "currentRunId": "legacy_run_001",
        "currentFloor": 12,
        "examHistory": [],
        "eventChecks": { "lastDaily": "", "lastWeekly": "", "lastMonthly": "" },
        "completedTodoMarkers": [],
        "todoMatchingMode": "keyword",
        "todoMatchingStats": { "keyword": { "success": 0, "total": 0 }, "index": { "success": 0, "total": 0 } }
      },
      "chatLog": [
        { "type": "ai", "content": "测试导入内容" }
      ]
    }
  ]
}
```

### Steps

1. Use in-app import function to import `v3-flat-import.json`.
2. Open save list and restore `v3-flat-import` snapshot.
3. In game UI, verify time/date and map location are loaded.
4. Trigger one round summary generation (or batch summary) to confirm summary pipeline still works.

### Expected

- Import succeeds, no crash.
- Restored state has valid `world.gameTime` (not fallback 2024/4/1 unless fixture omitted time).
- NPC list is present (`world.npcs` has `npc_001`).
- Summary generation works and `gameDate` is valid (`YYYY-MM-DD`).

### If Failed, Check

- `school/src/utils/gameStateMigration.ts`
  - `isLegacyGameState`
  - `migrateGameStateData`
  - `applyGameStateToStore`

---

## C2 - v4 Inline Old Snapshot Migration to IndexedDB

### Purpose

Validate old inline snapshot metadata (`gameState`/`chatLog` embedded in snapshot list) is split correctly into IndexedDB entities.

### Steps

1. In browser console, seed an inline old snapshot to `Local Storage`:

```js
localStorage.setItem('school_game_snapshots', JSON.stringify([
  {
    id: '1710000000002',
    timestamp: 1710000000002,
    label: 'v4-inline-old',
    messageIndex: 3,
    gameState: {
      meta: { currentRunId: 'run_inline_old', currentFloor: 3, _lastBaseFloor: 0, _schemaVersion: 4 },
      world: {
        gameTime: { year: 2026, month: 3, day: 27, weekday: 'Friday', hour: 10, minute: 45 },
        npcs: [{ id: 'npc_inline_1', name: 'InlineNPC', hp: 88 }],
        npcRelationships: {},
        worldState: { economy: 99 },
        allClassData: {},
        allClubs: {},
        graduatedNpcs: [],
        lastAcademicYear: 0,
        characterNotes: {},
        npcMemories: {}
      },
      player: { name: 'InlinePlayer', location: 'th_main_gate', summaries: [] },
      academic: { examHistory: [], lastExamDate: null, electiveAcademicData: {}, npcElectiveSelections: {}, customCoursePool: null },
      events: { checks: { lastDaily: '', lastWeekly: '', lastMonthly: '' }, library: [], triggers: [] },
      notifications: { completedTodoMarkers: [], todoMatchingMode: 'keyword', todoMatchingStats: { keyword: { success: 0, total: 0 }, index: { success: 0, total: 0 } }, unviewedExamIds: [], lastViewedWeeklyPreview: 0, viewedClubIds: [], weeklySnapshot: null, weeklyPreviewData: null, showWeeklyPreview: false, lastWeeklyPreviewWeek: 0 },
      rag: { summaries: [], persistentFacts: [] }
    },
    chatLog: [
      { type: 'user', content: 'u1' },
      { type: 'ai', content: 'a1' }
    ]
  }
]))
```

2. Reload app to trigger `initFromStorage` migration.
3. Open save list and confirm `v4-inline-old` can be previewed/restored.
4. In DevTools -> `IndexedDB` -> `snapshot_data`, verify:
   - key `1710000000002` exists
   - chat log chunk/meta keys exist (chunked storage)
5. Verify save-list metadata still contains time/location.

### Expected

- Inline payload is migrated; UI list no longer requires inline `gameState`/`chatLog`.
- `gameTime` metadata survives migration (from `world.gameTime` path).
- Restore works after reload.

### If Failed, Check

- `school/src/stores/actions/storageActions.ts`
  - `cleanAndMigrateSnapshots`
  - `initFromStorage`
- `school/src/utils/indexedDB.js`
  - `saveSnapshotData`
  - `saveChunkedChatLog`

---

## C3 - Delta Rollback: NPC + rag Consistency

### Purpose

Validate rollback from message snapshots does not lose NPC updates or rag data after schema migration.

### Steps

1. Start game and create at least 3 dialogue turns (ensures base + delta snapshots).
2. In Vue DevTools (Pinia -> game store), before turn 2/3 set:
   - `world.npcs` contains test NPC, e.g. `[{ id: 'npc_delta_1', name: 'DeltaNPC', hp: 100 }]`
   - `rag.summaries` and `rag.persistentFacts` are non-empty arrays.
3. During next turn, mutate NPC (e.g. hp 100 -> 70) and append one item to `rag.summaries`.
4. Use in-game rollback to previous turn (`restoreFromMessageSnapshot` path).
5. Check post-rollback state in DevTools.

### Expected

- NPC state matches the target rollback turn.
- NPC changes are applied to `world.npcs` (not stray top-level `npcs`).
- `rag.summaries` / `rag.persistentFacts` are not unintentionally emptied when `_summariesCount` markers are present.
- No console errors about delta restore.

### If Failed, Check

- `school/src/utils/snapshotUtils.ts`
  - `applyDelta`
  - `applyNpcChange`
- `school/src/stores/actions/snapshotActions.ts`
  - `restoreFromMessageSnapshot`
  - `restoreGameState`

---

## Pass Criteria (Release Gate)

All below must be true:

- [ ] C1 pass
- [ ] C2 pass
- [ ] C3 pass
- [ ] `npm run build` pass
- [ ] No new migration-related console error during import/restore/rollback

If any item fails, block release and attach screenshots + console logs + failing fixture JSON.
