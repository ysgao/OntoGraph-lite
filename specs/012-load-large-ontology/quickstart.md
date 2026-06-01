# Quickstart: Load Large Ontology Files

**Branch**: `012-load-large-ontology`

---

## How to load a large ontology

**Option A — Toolbar button**:
1. Open the OntoGraph sidebar (Classes Hierarchy or Inferred Hierarchy panel).
2. Click the folder icon (📂) in the panel toolbar.
3. Select your ontology file in the picker.
4. Wait for the progress notification to disappear — panels populate.

**Option B — Command Palette**:
1. Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux).
2. Type `Load Ontology File` and select "OntoGraph: Load Ontology File…".
3. Pick the file and wait.

**Option C — Automatic prompt**:
1. Open your large ontology via VS Code's File → Open (or Explorer click).
2. VS Code shows "file too large" in the editor — OntoGraph detects this and shows a notification.
3. Click "Load" in the notification.

---

## Supported formats

`.owl`, `.ofn`, `.omn`, `.ttl`, `.owx`, `.n3`

---

## After loading

- All panels (classes, properties, individuals, inferred hierarchy) populate normally.
- Edit annotations and axioms via the Entity Editor — changes write back to the original file.
- If the file changes externally, OntoGraph reloads automatically (same as normal files).

---

## Benchmarks

| File | Size | Classes | Expected load time |
|------|------|---------|-------------------|
| `bfo-core.ofn` | ~94 KB | ~35 | < 1 s |
| `pizza.owl` | ~163 KB | ~100 | < 1 s |
| SNOMED CT snapshot | ~200 MB | ~380 k | < 60 s |

---

## Known limits

- Files above ~500 MB may not be editable after loading (write-back path uses VS Code's in-memory document API which may not support very large files). Read-only use is fine.
- The load runs on a Worker Thread; VS Code extension host remains responsive.
