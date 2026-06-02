# Quickstart: Manual Verification — Entity Editor Undo/Redo

**Feature**: 014-entity-editor-undo-redo  
**Date**: 2026-06-02

## Prerequisites

1. Build the extension: `npm run build`
2. Open VS Code with the extension running (F5 from project root, or `npm run build && code --extensionDevelopmentPath=$PWD`)
3. Open `test-ontologies/animals.omn` (small file, easy to observe changes)

## Test Scenarios

### Scenario 1 — Basic Undo (P1)

1. In the Classes tree, click `Animal` to open the entity editor
2. In the `rdfs:label` field, change the label from its current value to `"Modified Animal"`
3. Click **Save** — verify "Saved" status appears briefly
4. Verify the **Undo** button is now enabled (not greyed out)
5. Click **Undo**
6. Verify the label field reverts to the original value
7. Verify the **Undo** button is now disabled
8. Verify the **Redo** button is now enabled

**Pass condition**: Label restores to pre-save value; button states correct.

---

### Scenario 2 — Redo (P2)

Continuing from Scenario 1 (Redo button enabled):

1. Click **Redo**
2. Verify the label field shows `"Modified Animal"` again
3. Verify the **Redo** button is now disabled
4. Verify the **Undo** button is now enabled

**Pass condition**: Redo re-applies the undone change; button states correct.

---

### Scenario 3 — Save After Undo Clears Redo (P1 / FR-007)

1. Open `Animal`, change label to `"Version 1"`, save
2. Change label to `"Version 2"`, save
3. Click **Undo** → label shows `"Version 1"`, Redo enabled
4. Change label to `"Version 3"`, click **Save**
5. Verify **Redo** button is now disabled
6. Click **Undo** → label shows `"Version 1"` (NOT `"Version 2"`)

**Pass condition**: Redo cleared after save; undo returns to correct prior state.

---

### Scenario 4 — Multi-Step Undo/Redo (P3)

1. Open `Animal`, make and save 5 distinct label changes: `"A"`, `"B"`, `"C"`, `"D"`, `"E"`
2. Click Undo 3× → label should show `"B"`
3. Click Redo 2× → label should show `"D"`
4. Verify each intermediate step shows the expected value

**Pass condition**: All 5 checkpoints traversable in both directions; no skips.

---

### Scenario 5 — No Undo on Fresh Load (FR-005)

1. Open `Animal` fresh (no prior saves in this session)
2. Verify **Undo** button is disabled immediately
3. Make changes but do NOT save
4. Verify **Undo** still disabled (unsaved changes do not create checkpoints)

**Pass condition**: Undo unavailable before first save.

---

### Scenario 6 — Per-Entity Isolation (FR-008)

1. Open `Animal`, save a label change → Undo enabled for Animal
2. Click `Plant` in the Classes tree → entity editor switches to Plant
3. Verify **Undo** is disabled for Plant (fresh entity, no saves)
4. Click back on `Animal`
5. Verify **Undo** is still enabled for Animal

**Pass condition**: Undo/redo history is independent per entity.

---

### Scenario 7 — No Auto-Disk-Write on Undo (FR-011)

1. Open `animals.omn` as a text file in a second VS Code tab
2. Open `Animal` in entity editor, change label to `"Modified"`, save
3. Verify text file now contains `"Modified"` (disk write confirmed)
4. Click **Undo** → editor label reverts
5. Verify the text file STILL contains `"Modified"` (undo did NOT write to disk)
6. Click **Save** in entity editor
7. Verify text file now reflects the undone value

**Pass condition**: Undo only changes the editor view; disk unchanged until explicit save.

---

## Build Verification

After implementation, run:

```bash
npm run compile        # zero type errors
npm test               # all tests pass, coverage ≥ 80% for new files
npm run build          # production bundles build cleanly
```
