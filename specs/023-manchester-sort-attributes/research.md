# Research: Manchester Syntax Attribute Sorting

**Feature**: 023-manchester-sort-attributes | **Date**: 2026-07-01

## Findings

### 1. Save-path call graph (traced from source)

| Step | File | Symbol | Line |
|------|------|--------|------|
| Webview sends save message | `webview-src/entity-editor/EntityEditorApp.ts` | `vscode.postMessage({type:'save'})` | 1667 |
| Extension host receives | `src/views/EntityEditorPanel.ts` | `handleMessage() case 'save'` | 701 |
| Queues sync write | `src/views/EntityEditorPanel.ts` | `queueSyncWrite()` | 852 |
| Assembles updated text | `src/views/EntityEditorPanel.ts` | `computeUpdatedText()` | 411 |
| Dispatches to format-specific sync | `src/sync/AxiomSync.ts` | `syncAxiomsToDocument()` | 1285 |
| Manchester handler | `src/sync/AxiomSync.ts` | `syncAxiomsManchester()` | 1012 |
| **Assembles axiom text ← sort here** | `src/sync/AxiomSync.ts` | `generateManchesterAxiomSections()` | 901 |
| Writes to disk | `src/views/EntityEditorPanel.ts` | `writeTextStreamed()` | 895 |

**Conclusion**: `generateManchesterAxiomSections()` at `AxiomSync.ts:901` is the correct and only integration point.

### 2. Existing ManchesterFormatting.ts surface

| Export | Lines | Role |
|--------|-------|------|
| `formatManchesterForDisplay` | 6–65 | Inserts `\n    and ` before top-level ` and ` |
| `findFormatBreaks` | 73–109 | Returns positions of format breaks (for cursor remapping) |
| `collectLogicalLines` | 121–133 | Multi-line editor text → array of single-line expressions |
| `stripAndContinuations` | 140–142 | Wrapper: `collectLogicalLines(t).join(' ')` |

The state machine (normal / iri / dquote / squote) in `formatManchesterForDisplay` is the authoritative lexer for top-level ` and ` detection. The new `sortManchesterConjuncts` function MUST use the same state machine to split conjuncts.

### 3. Test file

`src/utils/ManchesterFormatting.test.ts` — 207 lines, 95 tests. All new tests for `sortManchesterConjuncts` are added to this file. No new test infrastructure needed.

### 4. Webview import

`webview-src/entity-editor/EntityEditorApp.ts` imports from `../../src/utils/ManchesterFormatting` (line 3). The webview bundle does NOT need to call `sortManchesterConjuncts` — sort happens on the host side at write time — but the function will be bundled into the webview build automatically because of the barrel import. This is harmless (tree-shaking is not configured).

### 5. No ambiguity in role-prefix matching for the current canonical set

Checked for prefix-of-prefix conflicts in `CANONICAL_ROLE_PREFIXES`:
- `'all or part of'` vs `'proper part of'` — no overlap
- `'constitutional part of'` vs `'regional part of'` — no overlap
- `'lateral half of'` vs `'laterality'` — `'laterality'` is pinned separately, not in the prefix array; `'lateral half of'` is checked first in the array and its prefix does not start with `'laterality'`

Simple `startsWith` matching is sufficient. No longest-match disambiguation needed for the current list.
