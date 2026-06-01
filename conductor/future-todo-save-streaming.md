# Future TODO: Stream-Apply Edits to Disk (Skip In-Memory `updatedText`)

**Status**: parked. Current implementation works for SNOMED-scale (~200 MB).
Revisit only if loading larger ontologies (500 MB+) causes OOM on save.

## Background

EntityEditor save flow today produces a full in-memory `updatedText` string,
sets `model.rawContent = updatedText`, then streams the string to disk via
`writeTextStreamed` (1 MB chunks). The chunked write avoids the
`TextEncoder.encode` peak, but the `updatedText` string itself (~2× the file
size in UTF-16) is still held in memory until the write completes.

## Current Memory Profile per Save (200 MB SNOMED)

| Allocation | When | Size |
|---|---|---|
| `baseContent` (old text) | held until just before write | ~419 MB UTF-16, dropped via `baseContent = undefined` |
| `annot.updatedText` intermediate | inside `computeUpdatedText` helper frame | ~419 MB UTF-16, freed when helper returns |
| `axiom.updatedText` intermediate | inside helper frame | ~419 MB UTF-16, freed when helper returns |
| `updatedText` (final) | held during disk write | ~419 MB UTF-16 |
| stream chunk buffer | per chunk | ~1 MB |
| incremental segment-update arrays | brief | ~few MB |

**Peak**: ~838 MB UTF-16 briefly (during helper unwind overlap), then
~419 MB during write. Fits comfortably in extension-host heap (~1.5–2 GB).

## What a Stream-Apply Refactor Would Buy

Eliminate the final `updatedText` allocation. Stream from `baseContent`
(or directly from disk) + edit list to the output file, applying edits at
byte offsets as we go.

**Peak memory** drops to chunk buffer + edit metadata = ~5 MB.

## Refactor Cost

- **Sync funcs** (`syncAnnotationsToDocument`, `syncAxiomsToDocument`) must
  expose offset edits AND stop building `updatedText`. Today they return
  `{ changedRanges, updatedText, lineDelta, editSummaries }` — caller would
  need to compute updated text only when explicitly needed.
- **New `streamApplyEditsToFile` helper**: opens source for read, temp file
  for write, walks source in chunks, splices edits at correct byte offsets,
  atomic-renames temp → source. Helper signature roughly:
  ```ts
  streamApplyEditsToFile(uri, sourceText | sourceUri, offsetEdits[]): Promise<void>
  ```
  Already sketched in `src/sync/streamWrite.ts` discussion thread (~50 lines).
- **`model.rawContent` handling**: no longer auto-updated by sync. Options:
  - Apply edits in-memory separately (same allocation cost as today — defeats purpose).
  - Drop `rawContent` and lazy-read from disk for next save's baseContent (one extra 200 MB read per save).
  - Keep `rawContent` and update via mutating chunked replace (custom rope).
- **UTF-8 byte-offset edits**: current `OffsetEdit` uses char offsets (UTF-16
  code units). For UTF-8 stream write, need byte offsets. Either:
  - Convert char → byte offset using `Buffer.byteLength` on slices (extra work).
  - Precompute byte-offset index per line at parse time.
- **Tests rewritten**: incremental + integration tests assume `updatedText`
  return value; would need to test against post-apply file content instead.
- **Watcher fingerprint**: `recordSelfWrite` already uses post-write `stat`,
  unaffected.

## Decision Matrix

| Ontology size | Current setup | Refactor verdict |
|---|---|---|
| ≤ 200 MB | works (~420 MB peak) | unnecessary |
| 200–500 MB | tight (~800 MB–1 GB peak) | worthwhile if frequent saves |
| 500 MB–1 GB | OOM-prone | strongly recommended |
| 1 GB+ | crashes | required |

## Trigger Conditions for Revisit

Revisit if any of these happen:

1. Save flow on an ontology > 300 MB hits `RangeError: Invalid string length`
   or extension-host OOM crash.
2. User reports load + save cycles failing on files larger than SNOMED.
3. Profile shows >2 s spent in V8 GC during save flow.

## Implementation Sketch (when needed)

1. Add `streamApplyEditsToFile(uri, sourceText, offsetEdits[])` to
   `src/sync/streamWrite.ts`. Read source in chunks via `fs.promises.open` +
   `read(position, length)`; write to `${uri.fsPath}.ontograph.tmp`. After
   write, `fs.promises.rename(tmp, src)`. Streamed, bounded memory.
2. Modify `syncAnnotationsToDocument` / `syncAxiomsToDocument` to accept an
   `{ output: 'text' | 'edits' }` option (default `'text'` for back-compat).
   When `'edits'`, skip `applyWorkspaceEditsToText` and return only edits.
3. In EntityEditorPanel save handler: branch on file size.
   - Small (< threshold): existing path.
   - Large: edits-only path → `streamApplyEditsToFile` → fingerprint via stat.
4. `model.rawContent`: drop for large files. Adjust callers that read it
   (segment rebuild needs rawContent — read from disk on demand if absent).
5. Per-entity tests: round-trip via stream-apply must produce same on-disk
   bytes as current text-based apply.

## Related Code

- `src/sync/streamWrite.ts` — existing chunked write helper.
- `src/sync/RawTextDocument.ts` — `applyWorkspaceEditsToText` +
  `OffsetEdit` type already exposed.
- `src/sync/AnnotationSync.ts` / `src/sync/AxiomSync.ts` — sync funcs that
  currently build `updatedText`.
- `src/views/EntityEditorPanel.ts` — save handler orchestration.
- `src/model/SegmentIndex.ts` — `applyIncrementalSegmentUpdate` consumer of
  `EditSummary[]`, would not need changes.
