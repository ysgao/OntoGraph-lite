# Data Model: Axiom Expression Display Formatting

**Feature**: 006-axiom-display-formatting  
**Date**: 2026-05-16

## Overview

This feature introduces no persistent entities and no new message types. It is a pure display transformation confined to webview code and two extension-host validation functions.

## Core Concept: Formatted vs. Logical Expression

| Form | Description | Where used |
|------|-------------|------------|
| **Logical expression** | Single-line Manchester string, e.g. `hasRole some Doctor and hasLocation some Hospital` | OWL document, OntologyModel in memory, save payload, reasoner input, validator input |
| **Formatted expression** | Multi-line display string, e.g. `hasRole some Doctor\n    and hasLocation some Hospital` | CodeMirror editor `doc` content only — never leaves the webview |

The two forms are interconverted by the `manchesterFormat.ts` module. No other code needs to know about this distinction.

## Module: `manchesterFormat.ts`

### `formatManchesterForDisplay(expr: string): string`

Converts one logical expression to its formatted display form.

| Property | Value |
|----------|-------|
| Input | A single-line Manchester class expression (may be empty) |
| Output | The same expression with `\n    and ` substituted for each bare ` and ` occurrence outside of angle-bracket or quoted-string contexts |
| Idempotent | Yes — calling twice produces the same result |
| Inverse | `collectLogicalLines(result).join(' ')` recovers the original string |
| Side effects | None |
| Throws | Never — any unrecognised input is returned unchanged |

**Context guards** (the formatter does NOT break at `and` inside these):

| Context | Delimiter | Example |
|---------|-----------|---------|
| IRI brackets | `<` … `>` | `<http://example.org/land>` |
| Double-quoted string | `"` … `"` (with `\"` escape) | `"bread and butter"` |
| Single-quoted label | `'` … `'` (with `\'` escape) | `'Milk and Honey'` |

### `collectLogicalLines(rawText: string): string[]`

Parses editor content (which may contain formatted continuation lines) back into a list of logical expressions.

| Property | Value |
|----------|-------|
| Input | Raw multi-line editor content (may include formatting newlines) |
| Output | Array of single-line logical expression strings |
| Empty input | Returns `[]` |
| Blank lines | Skipped |
| Comment lines | Lines whose trimmed form starts with `#` are skipped |
| Continuation rule | A line whose trimmed form matches `/^and\s/` is joined (with a single space) to the previous result entry. If no previous entry exists (malformed input), the line is added as a new entry. |

### `stripAndContinuations(rawText: string): string`

Convenience wrapper for single-expression editors (DL Query).

```
stripAndContinuations(raw) === collectLogicalLines(raw).join(' ')
```

Returns `''` for blank input.

## Validation Flow (server-side, extension host)

Two functions in the extension host also need to understand formatted input:

| Function | File | Change |
|----------|------|--------|
| `validateManchesterText` | `src/views/EntityEditorPanel.ts` | Joins continuation `and` lines before validating each logical expression |
| `validateExpression` | `src/views/DLQueryPanel.ts` | Strips continuation `and` lines before wrapping and parsing |

These functions duplicate the continuation-joining logic (≈ 6 lines each) rather than importing from the webview module. The webview bundle is a browser IIFE; importing it into the extension host is not possible without extracting shared code to a third target. Per Principle II (YAGNI), the duplication is accepted.

## Invariants

1. `collectLogicalLines(exprs.map(formatManchesterForDisplay).join('\n'))` equals `exprs` for any array of non-empty single-line expressions containing no `#` comments.
2. No call to `formatManchesterForDisplay` or `collectLogicalLines` appears in the sync layer (`AxiomSync.ts`, `AnnotationSync.ts`), the serializer (`FunctionalSerializer.ts`), or the Java bridge (`ReasonerBridge.ts`).
3. The `OntologyModel` never stores formatted expressions. All model fields holding class expressions remain single-line strings.
