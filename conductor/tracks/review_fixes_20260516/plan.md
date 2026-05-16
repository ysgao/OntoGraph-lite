# Implementation Plan: Review Fixes (Validation & Formatting)

## Phase 1: Shared Utilities & Functional Spacing

- [ ] Task: Standardize `ObjectComplementOf` spacing in `src/utils/ExpressionUtils.ts`
    - [ ] Write unit tests in `ExpressionUtils.test.ts` (if exists, or create) for `ObjectComplementOf` output.
    - [ ] Update `manchesterToFunctional` in `src/utils/ExpressionUtils.ts` to remove internal spaces.
- [ ] Task: Export `collectLogicalLines` for Extension use
    - [ ] Verify `webview-src/manchesterFormat.ts` exports `collectLogicalLines`.
    - [ ] Ensure `tsconfig.json` allows the extension to import from `webview-src/`.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Shared Utilities & Functional Spacing' (Protocol in workflow.md)

## Phase 2: Entity Editor Validation Fix

- [ ] Task: Fix `validateManchesterText` in `src/views/EntityEditorPanel.ts`
    - [ ] Write failing integration tests in `src/views/EntityEditorPanel.test.ts` for multi-line expressions.
    - [ ] Implement `collectLogicalLines` join in `validateManchesterText`.
    - [ ] Implement offset remapping for error underlines.
- [ ] Task: Verify Single-line Validation
    - [ ] Run existing tests in `src/views/EntityEditorPanel.test.ts`.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Entity Editor Validation Fix' (Protocol in workflow.md)

## Phase 3: DL Query Validation Alignment

- [ ] Task: Update `validateExpression` in `src/views/DLQueryPanel.ts`
    - [ ] Write failing integration tests in `src/views/DLQueryPanel.test.ts` for multi-line expressions.
    - [ ] Implement `stripAndContinuations` in `validateExpression`.
- [ ] Task: Final Verification
    - [ ] Run all related tests (`npm test`).
    - [ ] Perform manual verification in the UI.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: DL Query Validation Alignment' (Protocol in workflow.md)
