# Implementation Plan: Multiline Text Areas for Long-Form Annotation Properties

**Branch**: `003-multiline-annotation-fields` | **Date**: 2026-05-15 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `specs/003-multiline-annotation-fields/spec.md`

## Summary

Replace the single-line `<input type="text">` value widget with a `<textarea>` for `skos:definition` and `rdfs:comment` annotations in the entity editor. All other annotation properties remain as single-line inputs. The serializer and sync layers already handle newline escaping and unescaping correctly — this change is confined to the webview UI layer.

## Technical Context

**Language/Version**: TypeScript 5+ (strict mode), browser IIFE bundle via esbuild  
**Primary Dependencies**: VS Code Extension API (webview), esbuild (bundler)  
**Storage**: N/A — annotation values are strings stored in the in-memory `OntologyModel` and persisted via `AnnotationSync`  
**Testing**: Vitest 1.6 + jsdom (dev dependency to be added — see Complexity Tracking)  
**Target Platform**: VS Code webview (Chromium-based browser context inside VS Code desktop)  
**Project Type**: VS Code extension (desktop app)  
**Performance Goals**: No change — DOM widget creation for annotation rows is negligible  
**Constraints**: No new runtime dependencies; jsdom is dev-only  
**Scale/Scope**: Affects only the entity editor webview; no parser, serializer, or sync changes required

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Test-First | ✅ PASS | Tests for `createValueWidget` helper will be written before implementation using jsdom; newline round-trip coverage added to `FunctionalSerializer.test.ts` |
| II. Simplicity & YAGNI | ✅ PASS | One constant, one conditional, one CSS rule; no abstraction layers added |
| III. OWL Standards Compliance | ✅ PASS | Purely UI change; serializer and sync layer not touched |
| IV. Scale-Aware Architecture | ✅ PASS | DOM widget creation does not iterate the class hierarchy; no benchmark required |
| V. Security & Safety | ✅ PASS | `textarea` value is set via `.value` (not innerHTML); no injection surface added |

## Project Structure

### Documentation (this feature)

```text
specs/003-multiline-annotation-fields/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code Changes

```text
webview-src/entity-editor/
└── EntityEditorApp.ts        # Primary change: createValueWidget helper + renderAnnotationsSection conditional

src/serializer/
└── FunctionalSerializer.test.ts   # Add newline round-trip test (confirms existing behaviour)
```

No new source files. No changes to `src/sync/`, `src/parser/`, or any Java code.

**Structure Decision**: Single-file webview with a small extracted helper function. The webview is already a single large TypeScript file; extracting a testable `createValueWidget` function aligns with YAGNI while satisfying the test-first requirement.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| jsdom dev dependency | Vitest has no DOM environment configured; `EntityEditorApp.ts` creates DOM elements that must be asserted against | Manual-only testing would not satisfy the constitution's >80% coverage gate for new code; jsdom is a standard test utility, not a runtime dependency |
