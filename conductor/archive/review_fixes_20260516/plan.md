# Implementation Plan: Review Fixes (Validation & Formatting)

## Phase 1: Shared Utilities & Functional Spacing [checkpoint: c67ca9e]

- [x] Task: Standardize `ObjectComplementOf` spacing in `src/utils/ExpressionUtils.ts` [c67ca9e]
    - [x] Write unit tests in `ExpressionUtils.test.ts` (if exists, or create) for `ObjectComplementOf` output.
    - [x] Update `manchesterToFunctional` in `src/utils/ExpressionUtils.ts` to remove internal spaces.
- [x] Task: Export `collectLogicalLines` for Extension use [c67ca9e]
    - [x] Verify `webview-src/manchesterFormat.ts` exports `collectLogicalLines`.
    - [x] Ensure `tsconfig.json` allows the extension to import from `webview-src/`.
- [x] Task: Conductor - User Manual Verification 'Phase 1: Shared Utilities & Functional Spacing' (Protocol in workflow.md) [c67ca9e]

## Phase 2: Entity Editor Validation Fix [checkpoint: c67ca9e]

- [x] Task: Fix `validateManchesterText` in `src/views/EntityEditorPanel.ts` [c67ca9e]
    - [x] Write failing integration tests in `src/views/EntityEditorPanel.test.ts` for multi-line expressions.
    - [x] Implement `collectLogicalLines` join in `validateManchesterText`.
    - [x] Implement offset remapping for error underlines.
- [x] Task: Verify Single-line Validation [c67ca9e]
    - [x] Run existing tests in `src/views/EntityEditorPanel.test.ts`.
- [x] Task: Conductor - User Manual Verification 'Phase 2: Entity Editor Validation Fix' (Protocol in workflow.md) [c67ca9e]

## Phase 3: DL Query Validation Alignment [checkpoint: c67ca9e]

- [x] Task: Update `validateExpression` in `src/views/DLQueryPanel.ts` [c67ca9e]
    - [x] Write failing integration tests in `src/views/DLQueryPanel.test.ts` for multi-line expressions.
    - [x] Implement `stripAndContinuations` in `validateExpression`.
- [x] Task: Final Verification [c67ca9e]
    - [x] Run all related tests (`npm test`).
    - [x] Perform manual verification in the UI.
- [x] Task: Conductor - User Manual Verification 'Phase 3: DL Query Validation Alignment' (Protocol in workflow.md) [c67ca9e]
