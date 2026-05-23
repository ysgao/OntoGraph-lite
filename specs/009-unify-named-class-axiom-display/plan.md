# Implementation Plan: Unify Named Class Axiom Display in Entity Editor

**Branch**: `009-unify-named-class-axiom-display` | **Date**: 2026-05-23 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/009-unify-named-class-axiom-display/spec.md`

## Summary

Remove the separate "SubClassOf" and "EquivalentTo" named-class chip sections from the Entity Editor. Named-class SubClassOf(A B) and EquivalentClasses(A B) entries are instead prepended to the "SubClassOf (expressions)" and "EquivalentTo (expressions)" CodeMirror sections respectively, using the same row layout as complex expressions.

Two files change: the webview display layer (`EntityEditorApp.ts`) and the extension save handler (`EntityEditorPanel.ts`). No changes to message protocol, OntologyModel, AxiomSync, serializers, or parsers.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node.js 20  
**Primary Dependencies**: VS Code Extension API, CodeMirror (webview editor)  
**Storage**: N/A (display layer change only)  
**Testing**: Vitest 1.6.0  
**Target Platform**: VS Code extension host + webview  
**Project Type**: VS Code extension  
**Performance Goals**: No regressions — change is display-layer only  
**Constraints**: No protocol changes; no model/sync/serializer changes  
**Scale/Scope**: Affects Entity Editor panel for class entities only

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Test-First | MUST follow | Write failing tests before implementation |
| II. Simplicity & YAGNI | PASS | Minimal change; no new abstractions |
| III. OWL Standards Compliance | PASS | No serializer/model changes; round-trip preserved via save-handler split |
| IV. Scale-Aware Architecture | PASS | No iteration over class hierarchy; display layer only |
| V. Security & Safety | PASS | No new inputs; no IRI injection vectors introduced |

## Project Structure

### Documentation (this feature)

```text
specs/009-unify-named-class-axiom-display/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (files touched)

```text
webview-src/entity-editor/
└── EntityEditorApp.ts       # Display changes: remove chip sections, prepend named-class labels to expression sections

src/views/
├── EntityEditorPanel.ts     # Save-handler split: normalized bare-IRI expressions → superClassIris
└── EntityEditorPanel.test.ts  # New unit tests for split logic
```

## Complexity Tracking

No constitution violations.

---

## Phase 0: Research

### Decision Log

**D-001: Where does the split between IRI and complex expression happen?**

- Decision: In `EntityEditorPanel.ts` save handler, after `normalizeExpression()`.
- Rationale: `normalizeExpression("Animal", model, index)` returns a bare IRI (`http://example.org/Animal`). `normalizeExpression("Animal and hasPart some Bone", ...)` returns a space-separated token string. A bare-IRI test (`/^https?:\/\/\S+$/`) cleanly separates them.
- Alternatives considered: splitting in webview (fragile, requires backing-state tracking); splitting in AxiomSync (wrong layer — sync should not know about display semantics).

**D-002: How to display named-class entries in the expression section?**

- Decision: Convert each named-class IRI to its display label via `localIriLabels[iri] ?? localNameFromIri(iri)`, synthesize an `ExpressionEntityRef` spanning the full label, and pass as the first entries to `renderExpressionSection`. Standard `createExpressionEntry` is used — no new DOM helper needed.
- Rationale: Identical row layout (CodeMirror editor + delete button). Synthesized refs enable click-to-navigate, consistent with complex expression tokens. Zero new functions.
- Alternatives considered: Read-only rows (different visual from expressions — violates FR-001); chips inside the expression section (same problem).

**D-003: Round-trip consistency?**

- Decision: `lastSavedStateString` is set after rendering (line 1977 of EntityEditorApp.ts), so the initial "no-change" baseline always reflects the new save format. After a save-reload cycle, named class IRIs return via `msg.superClassIris` → rendered as CodeMirror entries → same save format. No drift.
- Rationale: Verified by tracing the `loadEntity → getCurrentState → lastSavedStateString` flow.

**D-004: Draft expression index offset?**

- Decision: In the `loadEntity` message handler (lines 1963-1968), the draft index computation must add `(msg.superClassIris ?? []).length` to `validLen` for `sectionKey === 'superClassExpressions'`, and `(msg.equivalentClassIris ?? []).length` for `sectionKey === 'equivalentClassExpressions'`. Draft entries in the `editorMap` come after named-class entries + valid complex entries.
- Rationale: Without this fix, `applyDraftInvalidClass` would highlight the wrong editor when both named-class entries and draft expressions exist.

**D-005: iriLabels population in EntityEditorPanel.ts?**

- Decision: No change needed. `EntityEditorPanel.ts` line 450 already collects `cls.superClassIris` IRIs into `allIris` for label resolution, so `msg.iriLabels` will contain the display labels for named-class entries. These populate `localIriLabels` in the webview, which the label-synthesis logic uses.

---

## Phase 1: Design & Contracts

### Data Model

No changes to `OntologyModel.ts`. The in-memory model retains `superClassIris: string[]` and `superClassExpressions: string[]` as separate arrays. The feature only changes how these are displayed and how the webview save message is decomposed back into them.

**Round-trip invariant preserved:**
```
loadEntity:
  msg.superClassIris = ['IRI_B']
  msg.superClassExpressions = ['<display of complex expr>']

webview renders:
  editorMap['superClassExpressions'] = [CodeMirror("B_label"), CodeMirror("complex expr")]

getCurrentState():
  superClassIris: []
  superClassExpressions: ['B_label', 'complex expr text']

EntityEditorPanel.ts normalizes:
  normalized = ['IRI_B', '<IRI_X> and <IRI_Y> some <IRI_Z>']
  split: superClassIris = ['IRI_B'], superClassExpressions = ['<IRI_X> and <IRI_Y> some <IRI_Z>']

model updated:
  cls.superClassIris = ['IRI_B']         ← same as before save
  cls.superClassExpressions = [...]      ← same as before save
```

### Interface Contracts

This feature changes no public APIs, message schemas, or file formats.

**Internal change — `getCurrentState()` save payload for class:**

| Field | Before | After |
|-------|--------|-------|
| `superClassIris` | `iriListState['superClassIris']` (named-class IRIs) | `[]` always |
| `superClassExpressions` | complex expressions only | named-class labels + complex expressions |
| `equivalentClassIris` | `iriListState['equivalentClassIris']` | `[]` always |
| `equivalentClassExpressions` | complex expressions only | named-class labels + complex expressions |

The extension save handler (`EntityEditorPanel.ts`) splits the merged `superClassExpressions` array back into `cls.superClassIris` (single bare IRIs) and `cls.superClassExpressions` (complex expressions).

**Split predicate:**
```typescript
const SINGLE_BARE_IRI_RE = /^https?:\/\/\S+$/;
function isSingleBareIri(normalized: string): boolean {
  return SINGLE_BARE_IRI_RE.test(normalized);
}
```

### Quickstart

To verify the feature manually after implementation:

1. `npm run build` — rebuild webview bundle
2. Open `test-ontologies/animals.omn` in VS Code with the extension active
3. Click any class in the Classes tree (e.g., "Animal")
4. Confirm: single "SubClassOf (expressions)" section — no separate "SubClassOf" section
5. Confirm: named parents appear as the first entries in the section, same row style as complex expressions
6. Confirm: clicking a named parent label navigates to that class
7. Delete a named parent entry and save — confirm the SubClassOf axiom is removed from the file
8. Open `test-ontologies/bfo-core.ofn` — verify no regressions in the Editor panel

### Agent Context

No new external libraries or APIs introduced. Build command unchanged: `npm run build`.
