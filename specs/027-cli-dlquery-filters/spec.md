# Feature Specification: CLI DL Query — Auto-Classify, Result-Type Selection & Label Filtering

**Feature Branch**: `027-cli-dlquery-filters`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "improve the @cli/src/commands/bridge/dlQueryCommand.ts in cli to ensure the ontology is classified first. It should aslo allow to specify types of results should be returned, Direct superclasses, superclasses, equivalent classes, direct subclasses, subclasses, instances. One or more these types can be included filters of types classes. In addition, it should aslo allow to specifile a filter for labels. These are functions that already developed in the ontograph-lite. We only need to make them avaialbe in CLI command."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Get accurate DL query results without a manual classification step (Priority: P1)

As a developer scripting against an ontology through the CLI, I want `ontograph dl-query` to make sure the ontology has been classified before it runs my query, so I don't have to remember a separate classification step and don't risk getting results computed against a never-classified or out-of-date reasoning state.

**Why this priority**: This is a correctness guarantee. Without it, a user can silently receive DL query results that don't reflect the ontology's actual inferred hierarchy — undermining trust in every other capability this feature adds.

**Independent Test**: Load an ontology that has never been classified and run `ontograph dl-query "<expression>"`. Confirm classification happens automatically before the query result is produced, with no separate `ontograph classify` call required.

**Acceptance Scenarios**:

1. **Given** an ontology that has never been classified, **When** the user runs `ontograph dl-query "<expression>"`, **Then** the CLI classifies the ontology first and returns DL query results reflecting the classified state.
2. **Given** an ontology that is already classified and unchanged since, **When** the user runs `ontograph dl-query`, **Then** the CLI does not needlessly repeat classification and still returns correct results promptly.
3. **Given** an ontology that fails classification (e.g., it is logically inconsistent), **When** the user runs `ontograph dl-query`, **Then** the CLI reports the classification failure clearly and does not attempt to run the query.

---

### User Story 2 - Choose which categories of results come back (Priority: P1)

As a CLI user, I want to specify which categories of related classes/individuals I want back — direct superclasses, all superclasses, equivalent classes, direct subclasses, all subclasses, instances — so I only receive the information relevant to my task instead of a fixed, one-size-fits-all shape.

**Why this priority**: This is the core capability driving the feature — today's command returns a fixed result shape with no way to narrow or broaden it.

**Independent Test**: Run `ontograph dl-query "<expression>" --types directSubClasses,instances` and confirm the result contains only those two categories. Run the same query without `--types` and confirm only the `subClasses` category is returned.

**Acceptance Scenarios**:

1. **Given** a valid DL expression, **When** the user requests only "instances", **Then** the result contains only the instances category.
2. **Given** a valid DL expression, **When** the user requests multiple categories (e.g., direct superclasses and equivalent classes), **Then** the result contains exactly those categories and no others.
3. **Given** the user omits category selection entirely, **When** the query runs, **Then** the CLI returns only the "subclasses" category (the documented default) and no other category.
4. **Given** the user provides an unrecognized category name, **When** the query runs, **Then** the CLI rejects the request with a clear error listing the valid category names, and does not execute the query.

---

### User Story 3 - Narrow results by label (Priority: P2)

As a CLI user working with a large ontology, I want to filter the returned classes/individuals by a label (or IRI) substring, so I can quickly narrow down to what I'm looking for without post-processing the JSON output myself.

**Why this priority**: A high-value convenience, especially against large (e.g., SNOMED-scale) ontologies where a category can contain thousands of entries — but secondary to correct classification and category selection.

**Independent Test**: Run `ontograph dl-query "<expression>" --filter "liver"` and confirm every returned entity's label or IRI (case-insensitively) contains "liver"; non-matching entities are excluded from every returned category.

**Acceptance Scenarios**:

1. **Given** a query that would return many results, **When** the user adds a label filter matching a subset, **Then** only matching entities remain in each requested category.
2. **Given** a filter that matches nothing, **When** the query runs, **Then** the CLI returns an empty list for every requested category rather than an error.
3. **Given** a filter combined with category selection, **When** the query runs, **Then** filtering applies only within the categories the user selected.

---

### Edge Cases

- What happens when no ontology is currently active/loaded in the running OntoGraph extension? The command reports the same "not available" condition it does today, without attempting classification or the query.
- What happens if classification itself times out or the connection to the extension drops mid-classification? The command reports a clear timeout/connection error and does not proceed to run the query.
- What happens when `--types` includes duplicate or repeated category names? Duplicates are treated as a single request for that category, not an error.
- What happens when neither `--types` nor any categories are supplied at all? The command falls back to returning only the "subclasses" category — the one documented default — rather than any other category or the full set.
- What happens when `--filter` is given an empty string, or omitted entirely? Both are treated as "no filtering" — all entities in the selected categories are returned; filtering is purely opt-in and never required.
- What happens for a category with a very large number of matches (SNOMED-scale ontology)? The command completes within the same expected time budget as today's unfiltered query; filtering narrows the returned list but does not change how the query itself is computed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The CLI's `dl-query` command MUST ensure the active ontology has been classified before executing the DL query, automatically triggering classification when it has not yet been performed or is out of date.
- **FR-002**: The CLI MUST avoid repeating classification when the ontology is already classified and unchanged since, so repeated queries don't pay the classification cost every time.
- **FR-003**: If classification fails (e.g., the ontology is logically inconsistent), the CLI MUST report the failure clearly and MUST NOT execute the DL query.
- **FR-004**: Users MUST be able to specify one or more of the following result categories: direct superclasses, superclasses (all ancestors), equivalent classes, direct subclasses, subclasses (all descendants), instances.
- **FR-005**: The CLI MUST return only the categories the user requested; categories not requested MUST NOT appear in the result.
- **FR-006**: When the user specifies no categories, the CLI MUST default to returning only the "subclasses" category (all descendants) — no other category is included unless the user explicitly requests it via `--types`. This is an intentional break from today's behavior, where the command always returns a fixed, multi-category shape regardless of options.
- **FR-007**: The CLI MUST reject a request naming an unrecognized category with an actionable error that lists the valid category names, without executing the query.
- **FR-008**: Users MUST be able to supply a label filter (case-insensitive substring) that is applied to every entity in every returned category, matching against the entity's label or its IRI. The filter is optional and has no default value — when omitted, no label filtering is applied.
- **FR-009**: When a label filter excludes all entities in a category, the CLI MUST return that category as an empty list rather than raising an error.
- **FR-010**: The CLI MUST report classification and query failures using the same structured success/error/exit-code conventions the other bridge commands (`classify`, `check-consistency`) already use — specifically, a classification failure surfaced through `dl-query` MUST report the identical error code `ontograph classify` itself reports for the same underlying failure, not a new or different code.
- **FR-011**: Running `ontograph dl-query "<expression>"` with no additional flags MUST NOT return today's full fixed four-category shape — see FR-006 for the resolved default.

### Key Entities *(include if feature involves data)*

- **DL Query Result**: The categorized set of related entities returned for a class-expression query. Categories: Direct Superclasses, Superclasses, Equivalent Classes, Direct Subclasses, Subclasses, Instances — each a list of entities identified by IRI and label.
- **Result Category Selection**: The user-specified subset of the six category types to include in a given query's output.
- **Label Filter**: A case-insensitive substring pattern applied to entity labels/IRIs to narrow every returned category.
- **Classification State**: Whether the active ontology's reasoner-derived hierarchy is up to date, determining whether the command must classify before running the query.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can obtain classified DL query results with a single CLI command, with no separate manual classification step, every time the ontology is valid.
- **SC-002**: Requesting a single result category returns only that category's data — payload size scales with what the user asked for, not with the full fixed result shape.
- **SC-003**: Users can narrow returned entities by label without writing any post-processing of the CLI's output.
- **SC-004**: Repeated queries against an already-classified, unchanged ontology do not incur the extra classification step's runtime on every call.
- **SC-005**: Every request naming an invalid category is rejected before any query work begins, with an error identifying the valid category names.
- **SC-006**: When the ontology fails classification, the command reliably reports that failure instead of returning empty or misleading query results.

## Assumptions

- The six category names are exposed via a single, comma-separated CLI option (e.g., `--types`), matching this CLI's existing convention for multi-value/enum-like options (`search --type`, `convert --to`).
- FR-006's `subClasses`-only default (rather than preserving today's four-category shape, or requiring `--types`) was chosen deliberately by the user during specification — see spec.md's clarification history.
- Label filtering matches against either the entity's label or its IRI, case-insensitively, mirroring the equivalent filtering behavior already available in the VS Code DL Query panel. Unlike `--types`, the filter has no default: omitting it simply means no entities are excluded by label.
- "Classification is out of date" reuses this project's existing staleness concept (the ontology has changed since it was last classified, or has never been classified) rather than introducing a new definition of staleness.
- The underlying reasoning/classification engine, error codes, and JSON output envelope (`writeResult`/`writeError`/exit codes) are unchanged by this feature — it only extends what parameters `dl-query` accepts and what shape its result takes.
- This feature is CLI-facing only; no changes to the VS Code extension's own DL Query webview are in scope.
