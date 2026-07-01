# Quickstart: Testing Unsaved Changes Warning (022)

## Prerequisites

- VS Code with the OntoGraph extension built (`npm run build`)
- Any test ontology, e.g., `test-ontologies/animals.omn`

---

## Golden Path Test: Save

1. Open `animals.omn` in VS Code — the Classes tree populates.
2. Click any class (e.g., `Animal`) — the Entity Editor opens.
3. Edit the `rdfs:label` field — change the text.
4. Without clicking Save, click a different class in the tree (e.g., `Dog`).
5. **Expected**: A modal dialog appears: *"Animal has unsaved changes. Save before switching?"* with **Save**, **Discard**, and **Cancel** buttons.
6. Click **Save**.
7. **Expected**: The label change is written to the file, then `Dog` is loaded in the Entity Editor. Clicking back to `Animal` shows the new label.

---

## Golden Path Test: Discard

1. Repeat steps 1–4 above.
2. Click **Discard** in the dialog.
3. **Expected**: The change is discarded and `Dog` is loaded. Clicking back to `Animal` shows the original label.

---

## Golden Path Test: Cancel

1. Repeat steps 1–4 above.
2. Click **Cancel** (or press Escape).
3. **Expected**: No navigation occurs. The Entity Editor still shows `Animal` with the edited (unsaved) label. The tree selection snaps back to `Animal`.

---

## Negative Test: No Warning When Clean

1. Open any class, make an edit, click **Save**.
2. Immediately click a different class.
3. **Expected**: No dialog appears; the new class loads instantly.

---

## Negative Test: No Warning When No Edits Made

1. Click any class — editor opens.
2. Do not touch any field.
3. Click a different class.
4. **Expected**: No dialog — direct navigation.

---

## Back/Forward Navigation Test

1. Navigate: click `Animal` → `Dog` → `Cat`.
2. Edit `Cat`'s label.
3. Click the **Back (←)** toolbar button.
4. **Expected**: Dialog appears. Choose Save or Discard — `Dog` loads.

---

## Edge Case: Revert to Original

1. Click `Animal`, change its label from "Animal" to "X".
2. Change it back to "Animal".
3. Click a different class.
4. **Expected**: No dialog — the editor recognises no net change.

---

## Build & Reload

```bash
npm run build
# Then in VS Code: Developer: Reload Window (Ctrl+Shift+P)
```
