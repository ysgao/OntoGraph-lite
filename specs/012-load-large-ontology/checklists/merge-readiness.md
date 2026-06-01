# Merge Readiness Checklist: Load Large Ontology Files

**Purpose**: Author self-review — validate requirement quality and spec/implementation parity before PR merge. Hybrid scope: analyze report gaps (C1, H1–H3, M1–M4) + full non-functional sweep.
**Created**: 2026-05-30
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [tasks.md](../tasks.md)
**Analyze report**: Run `/speckit.analyze` on 2026-05-30 — C1 (constitution), H1–H3 (high), M1–M4 (medium)

---

## Requirement Completeness

- [ ] CHK001 - Is FR-004 ("detect format from content, not extension") precise enough to specify the detection algorithm, search window size, and fallback when content is unrecognizable? [Completeness, Spec §FR-004]
- [ ] CHK002 - Are requirements defined for what happens when the selected file is deleted between picker confirmation and `fs.readFile` completion? [Gap, Spec §Edge Cases]
- [ ] CHK003 - Are requirements defined for the OOM/insufficient-memory failure path when loading a 200 MB file into a constrained Node.js heap? [Gap, Spec §Edge Cases]
- [ ] CHK004 - Are requirements defined for concurrent loads targeting **different** files? US1 AC5 covers same-operation re-entry only. [Gap, Spec §US1 AC5]
- [ ] CHK005 - Is the `notifiedUris` session-scoped suppression (dismiss once = never re-show for that URI per session) specified anywhere in the spec? [Gap, Spec §US2 AC3]
- [ ] CHK006 - Are requirements defined for the editor-closed-during-parse scenario listed in the spec edge cases? [Gap, Spec §Edge Cases]
- [ ] CHK007 - Are write-back requirements (FR-010) explicit about the path for files **not** open as editor text documents (the large-file case)? [Completeness, Spec §FR-010]

---

## Requirement Clarity

- [ ] CHK008 - Is the 10 MiB stat-size threshold for the large-file notification specified in the spec, or only in plan/tasks? [Clarity, Gap, Spec §FR-008]
- [ ] CHK009 - Is the two-part detection heuristic (`getText() === ''` AND `stat.size > 10 MiB`) documented in spec FR-008, or is only the outcome described? [Clarity, Spec §FR-008]
- [ ] CHK010 - Is "within 60 seconds" in SC-001 tied to a specific hardware baseline (CPU generation, RAM size, disk type)? Without this it cannot be reproduced. [Clarity, Spec §SC-001]
- [ ] CHK011 - Is "within 2 seconds" in SC-003 clarified to separate file-watcher firing latency (platform-dependent) from parse+callback latency (testable)? [Clarity, Spec §SC-003]
- [ ] CHK012 - Are "clear error message" requirements in FR-011/FR-013 specific about required message content (filename, failure reason, suggested action)? [Clarity, Spec §FR-011, FR-013]
- [ ] CHK013 - Is "visible progress" in FR-005 quantified — e.g., does it specify a maximum delay before the indicator appears, or a minimum display duration? [Clarity, Spec §FR-005]

---

## Requirement Consistency

- [ ] CHK014 - Does spec US1 AC3 ("files larger than 50 MB") align with the 10 MiB notification detection threshold? These differ by ~5×. [Inconsistency, Spec §US1 AC3 vs plan §T5]
- [ ] CHK015 - Does FR-004 ("content-based detection") align with the implemented `'auto'` path, which uses substring search (`Ontology(` in first 16 384 bytes) rather than byte-sequence magic? [Consistency, Spec §FR-004]
- [ ] CHK016 - Are performance targets proportionally consistent — SC-001 targets 200 MB/60 s; is the anatomy.owl (30 MB) automated benchmark threshold set proportionally? [Consistency, Spec §SC-001, Gap C1]
- [ ] CHK017 - Does T011's task description (conditional on T009 spike) match what was actually implemented in `EntityEditorPanel.ts`? [Consistency, tasks.md §T011, M4]
- [ ] CHK018 - Is the `'auto'` langId change (H1 fix) reflected in T003/T013 task descriptions and in FR-004 spec wording? [Consistency, Spec §FR-004, tasks.md §T003/T013]

---

## Acceptance Criteria Quality

- [ ] CHK019 - Can SC-001 (200 MB / 60 s) be measured in automated CI without a SNOMED CT snapshot? Is the manual-acceptance-only nature explicitly documented? [Measurability, Spec §SC-001, H2]
- [ ] CHK020 - Can SC-003 (reload within 2 s) be covered by an automated benchmark task, or is it currently unverified? Task T012 covers correctness but not timing. [Measurability, Spec §SC-003, H3]
- [ ] CHK021 - Can SC-006 ("user discovers pathway within 30 seconds") be objectively measured with automated tooling, or must it be designated as a manual usability test? [Measurability, Spec §SC-006, M3]
- [ ] CHK022 - Is SC-002 ("100% of edits persisted, zero silently lost") backed by a test asserting 100% persistence, not just a single happy-path annotation save? [Measurability, Spec §SC-002]
- [ ] CHK023 - Are success criteria for FR-006 (all panels populate) measurable — does the spec define what "correctly populated" means (class count, property count, no errors)? [Measurability, Spec §FR-006]

---

## Scenario Coverage

- [ ] CHK024 - Are requirements defined for loading a new ontology **when one is already loaded** — does it replace, merge, or require an explicit unload step? [Coverage, Gap]
- [ ] CHK025 - Is the `prefillUri` code path (notification "Load" click bypasses file picker) visible in the spec, or only in plan/tasks? [Coverage, Spec §US2 AC2]
- [ ] CHK026 - Does the spec cover reload behavior (US4) for files loaded via the new large-file path, confirming parity with the existing normal-file watcher behavior? [Coverage, Spec §US4, FR-012]
- [ ] CHK027 - Are requirements defined for the VS Code editor closing (window close / crash) while a large ontology is actively being parsed? [Coverage, Gap, Spec §Edge Cases]

---

## Edge Case Coverage

- [ ] CHK028 - Is the non-ASCII / space-containing file path edge case (listed in spec) addressed by any FR or task? [Edge Case, Spec §Edge Cases]
- [ ] CHK029 - Is the "file too large for VS Code but not an ontology format" (e.g., a 100 MB CSV) edge case covered by FR-009? [Edge Case, Spec §FR-009]
- [ ] CHK030 - Does FR-011 distinguish between a read-only file, a read-only parent directory, and a missing intermediate directory as separate failure causes? [Edge Case, Spec §FR-011]
- [ ] CHK031 - Are requirements defined for a file that changes on disk **while** it is being parsed (race between `fs.readFile` and `FileSystemWatcher` event)? [Edge Case, Gap]

---

## Non-Functional Requirements

- [ ] CHK032 - Is the memory consumption assumption ("≥16 GB RAM") for 200 MB files documented as a spec constraint or testable NFR rather than a hidden assumption? [NFR, Spec §Assumptions]
- [ ] CHK033 - Are security requirements defined for file path handling — specifically, are user-supplied filenames echoed back in error messages in a way that could expose sensitive paths? [NFR, Security, Spec §FR-011/FR-013]
- [ ] CHK034 - Is there an accessibility requirement for the progress notification (FR-005) — must it be screen-reader-accessible per VS Code a11y guidelines? [NFR, Accessibility, Gap]
- [ ] CHK035 - Are degradation requirements defined for low-memory conditions (e.g., < 4 GB free heap) when loading a large ontology — graceful error vs. silent OOM crash? [NFR, Gap]

---

## Constitution & Governance Alignment

- [x] CHK036 - Does at least one task explicitly benchmark against `test-ontologies/anatomy.owl`, as required by Constitution Principle IV MUST for any feature iterating the class hierarchy? [Constitution §IV, C1] — resolved: `src/commands/loadOntologyFile.bench.test.ts` added; calls `ParserRegistry.parse` with anatomy.owl, asserts classes > 0 and elapsed < 60 000 ms.
- [x] CHK037 - Is a SC-003 reload timing benchmark (wall-clock < 2000 ms) covered by a task? T012 covers correctness only; no timing assertion exists. [Constitution §I, H3] — resolved: `src/commands/reloadOntology.bench.test.ts` added; asserts reload of bfo-core.ofn < 2000 ms; SC-003 for 200 MB files documented as manual-only.
- [x] CHK038 - Is T011's conditional status (T009 spike outcome) documented with a one-line finding — "implemented" or "skipped — reason"? [Governance, tasks.md §T011, M4] — resolved: T011 annotated in tasks.md: skipped — `getText()` returned content; existing sync path sufficient.
- [x] CHK039 - Is SC-006 ("30-second discovery") annotated as manual-only acceptance so it is not counted as a CI quality gate? [Governance, Spec §SC-006, M3] — resolved: spec.md SC-006 annotated "Manual acceptance only — not a CI quality gate".

---

## Notes

- Mark items `[x]` when resolved; add inline finding if requirement needs update.
- Items marked `[Gap]` indicate missing requirement — update spec or document intentional exclusion.
- Items marked `[Inconsistency]` need reconciliation across spec/plan/tasks before merge.
- Constitution items (CHK036–CHK039) are blocking — resolve before marking branch shippable.
