# Research: Entity Navigation History

**Feature**: 021-entity-nav-history | **Date**: 2026-06-30

All research decisions are documented in [plan.md](plan.md) under Phase 0 (R-001 through R-005). This file summarises the findings in short form for quick reference.

## Findings

| ID | Question | Decision | Rationale |
|----|----------|----------|-----------|
| R-001 | How to suppress history push during back/forward? | Reuse existing `suppressNextSelection` flag | Already present in `extension.ts`; avoids new state |
| R-002 | Where to push to history? | Only in `onEntitySelected()` | All user focus events converge there via `onDidChangeSelection` |
| R-003 | How to disable toolbar buttons? | VS Code context keys + `enablement` field | Grays out (not hides) per SC-003 |
| R-004 | Where to clear history on load? | `onLoadedCallback` in `extension.ts` | Single callback covering all load paths |
| R-005 | Keyboard `when` clause | `focusedView =~ /^ontograph\./` | Regex matches all 6 OntoGraph views without enumeration |

## No Open Questions

All NEEDS CLARIFICATION items were resolved during spec authoring. The plan is ready for task breakdown.
