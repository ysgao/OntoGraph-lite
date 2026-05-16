# Specification: Review Fixes (Validation & Formatting)

## Overview
This track addresses three findings from the Conductor code review to ensure robust validation of multi-line Manchester expressions and consistent OWL Functional Syntax output.

## Functional Requirements

### 1. Shared Logical Line Collection
- Export `collectLogicalLines` from `webview-src/manchesterFormat.ts`.
- Ensure the extension layer (`src/views/`) can import and utilize this utility for server-side validation.

### 2. Entity Editor Validation Fix
- Update `validateManchesterText` in `src/views/EntityEditorPanel.ts` to join continuation 'and' lines using `collectLogicalLines` before passing to the parser.
- Ensure error offsets are correctly mapped back to the original multi-line text so that red underlines appear on the correct lines.
- Verify that single-line expressions continue to validate correctly.

### 3. DL Query Validation Alignment
- Update `validateExpression` in `src/views/DLQueryPanel.ts` to use `stripAndContinuations` (which delegates to `collectLogicalLines`) for consistency with the Entity Editor.

### 4. Functional Utility Spacing Standardization
- Update `src/utils/ExpressionUtils.ts` to remove inconsistent internal spacing in `ObjectComplementOf`.
- Target format: `ObjectComplementOf(<IRI>)` instead of `ObjectComplementOf( <IRI> )`.

## Non-Functional Requirements
- **Performance:** Validation must remain responsive even with large multi-line expressions.
- **Maintainability:** Use shared logic to prevent future discrepancies between webview and extension validation.

## Acceptance Criteria
- Multi-line expressions with 'and' continuations do not trigger spurious validation errors.
- Error underlines in the Entity Editor correctly target the logical expression's location in the multi-line text.
- `ObjectComplementOf` in functional output has no internal spaces.
- All existing single-line validation tests pass.

## Out of Scope
- Full Manchester parser refactoring.
- Changes to other serialization formats (Turtle, RDF/XML).
