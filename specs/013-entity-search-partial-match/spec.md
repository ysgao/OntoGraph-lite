# Feature Specification: Entity Search — Partial Match Across All Label Fields

**Feature Branch**: `013-entity-search-partial-match`  
**Created**: 2026-06-01  
**Status**: Draft  
**Input**: User description: "Improve the existing entity search by allow partial match, searching entity names, labels, prefLabels, altLabels regardless the order of words."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Multi-Word Query Finds Entities Whose Labels Are Split Across Fields (Priority: P1)

A user types two or more words into the search bar. The entity they are looking for has the first word in one label field (e.g., `rdfs:label`) and the second word in a different field (e.g., `skos:prefLabel` or `skos:altLabel`). Currently, no results appear because the search requires all words to appear within a single label string. After this change, the entity is found.

**Why this priority**: This is the primary gap in the current search. In large biomedical ontologies (e.g., SNOMED CT), entities frequently carry their primary display name in `skos:prefLabel` while synonyms are spread across `rdfs:label` and `skos:altLabel`. Multi-word queries routinely fail to match such entities.

**Independent Test**: Load `test-ontologies/animals.omn`; manually add a class with `rdfs:label "Flying"@en` and `skos:prefLabel "Mammal"@en`; open the search panel; type "Flying Mammal" — the class appears in results. Searching "Mammal Flying" also returns it.

**Acceptance Scenarios**:

1. **Given** an entity with `rdfs:label "body"` and `skos:prefLabel "structure"`, **When** the user searches "body structure", **Then** the entity appears in results.
2. **Given** an entity with `rdfs:label "body"` and `skos:altLabel "structure"`, **When** the user searches "structure body", **Then** the entity appears in results (word order irrelevant across fields).
3. **Given** an entity with `rdfs:label "body structure"` (both words in one label), **When** the user searches "body structure", **Then** the entity still appears — existing single-field matching is not broken.
4. **Given** a three-word query "body nervous structure" where words appear across three separate label fields, **Then** the entity is found only if all three tokens are present across the combined label set.
5. **Given** a query whose tokens are NOT collectively present in any label field of an entity, **When** the user searches, **Then** that entity does NOT appear.

---

### User Story 2 — Partial/Substring Tokens Match Within Any Label Field (Priority: P2)

A user types an incomplete word (e.g., "struct" instead of "structure") and expects to see entities whose labels contain that substring in any label field. This refines discovery when the user is uncertain of the exact spelling or is typing progressively.

**Why this priority**: Substring matching is already implemented for single-label matching and must be preserved and confirmed to work when tokens span fields. Explicit specification prevents regressions.

**Independent Test**: Load any ontology containing an entity with `skos:prefLabel "body structure"`; search "struct" — entity appears. Search "body str" — entity appears. Search "ody str" — entity appears (mid-word substring allowed).

**Acceptance Scenarios**:

1. **Given** an entity with `skos:prefLabel "body structure"`, **When** the user searches "struct", **Then** the entity appears in results.
2. **Given** an entity with `rdfs:label "body"` and `skos:prefLabel "structures"`, **When** the user searches "bod struct", **Then** the entity appears (cross-field substring tokens).
3. **Given** a query token that is not a substring of any label or name of an entity, **When** searching, **Then** that entity does not appear.

---

### User Story 3 — Entity Local Names Are Searchable Alongside Labels (Priority: P3)

A user knows the local part of an entity's IRI (e.g., "BodyStructure" from `http://snomed.info/id/BodyStructure`) and can find it by typing any contiguous substring of that name, regardless of capitalisation. Tokens from the local name and tokens from label fields participate in cross-field matching together.

**Why this priority**: Local-name search is already indexed. This story confirms it participates in cross-field matching and is not broken by the changes.

**Independent Test**: Load any ontology with an entity whose IRI ends in `#BodyStructure` and has `rdfs:label "Anatomical site"`; search "anatomical body" — entity appears (token "anatomical" matches label, token "body" matches local name).

**Acceptance Scenarios**:

1. **Given** an entity with IRI ending `#BodyStructure` and no labels, **When** the user searches "body", **Then** the entity appears.
2. **Given** an entity with IRI ending `#BodyStructure` and `rdfs:label "Anatomical site"`, **When** the user searches "anatomical body", **Then** the entity appears (cross-field: label + local name).
3. **Given** a query that matches neither the local name nor any label field of an entity, **When** searching, **Then** that entity is absent.

---

### User Story 4 — Look Up Entity by Exact Local Name / Concept ID (Priority: P1)

A user knows the exact local name of an entity — typically a concept ID such as `123037004` extracted from a full IRI like `http://snomed.info/id/123037004`, or from a prefixed short IRI like `:123037004`. They type only the local name (without namespace or prefix) into the search bar and expect to land directly on that entity. The match is exact: typing `12303` must NOT surface `123037004`.

**Why this priority**: Clinical and terminology users routinely navigate SNOMED CT and similar ontologies by concept ID. Lookup-by-ID is the most precise and frequently needed search mode; a partial match on a numeric ID would produce misleading results.

**Independent Test**: Load a SNOMED-scale ontology; type `123037004` in the search bar; exactly one result appears with that concept ID; typing `12303` returns no entity with that ID (though other results may appear for other reasons).

**Acceptance Scenarios**:

1. **Given** an entity with IRI `http://snomed.info/id/123037004`, **When** the user searches `123037004`, **Then** that entity appears in results.
2. **Given** the same entity, **When** the user searches `12303` (a prefix of the ID), **Then** that entity does NOT appear via entity-name matching (though label substring matching may return other entities).
3. **Given** the same entity, **When** the user searches `1230370040` (a superset of the ID), **Then** that entity does NOT appear via entity-name matching.
4. **Given** an entity with short IRI `:123037004` (namespace stripped to local name `123037004`), **When** the user searches `123037004`, **Then** the entity appears — the namespace prefix is never part of the entity name.
5. **Given** two entities whose local names are `1230` and `123037004`, **When** the user searches `1230`, **Then** only the entity with local name `1230` appears via entity-name matching — not `123037004`.
6. **Given** an entity whose local name exactly matches the query and whose labels also contain that string, **When** searching, **Then** the entity appears once, ranked at the top of results.

---

### Edge Cases

- What happens when the search query contains only whitespace? → No results returned; no error.
- What happens when a label value is an empty string? → Empty strings are excluded from the search index.
- What happens when an entity has hundreds of label values across multiple fields? → All values participate in matching; performance stays within the response-time success criterion.
- What happens when two tokens are identical (e.g., "body body")? → Treated as one distinct token; matching is not stricter than for a single "body" token.
- What happens when labels contain language tags (e.g., `"structure"@fr`)? → Language tags are stripped before matching; all languages participate.
- What happens when a query that is an exact entity name also partially matches some labels of other entities? → Entity-name exact match entities rank at the top; label-substring matches for other entities appear below, ranked by the standard scoring rules.
- What happens when the local name is empty (e.g., an IRI ending in `#`)? → The entity has no local name; entity-name exact match does not apply to it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the user types a multi-word query, each word (token) MUST be matched independently across ALL label fields of an entity — `rdfs:label`, `skos:prefLabel`, `skos:altLabel`, and the entity's IRI local name — rather than requiring all tokens to appear within a single label string.
- **FR-002**: Token matching MUST be case-insensitive substring matching (e.g., "struct" matches "body structure").
- **FR-003**: Word order in the query MUST NOT affect which entities are returned; "body structure" and "structure body" MUST return the same set of entities.
- **FR-004**: An entity MUST appear in results only if every query token is present as a substring in at least one of its label values or local name; entities missing any token are excluded.
- **FR-005**: Result ranking MUST prioritise closer matches: exact whole-label match ranks highest, followed by single-label prefix match, followed by cross-field or mid-string match.
- **FR-006**: Search response time MUST NOT measurably degrade for ontologies up to 200,000 entities compared to the current implementation.
- **FR-007**: Existing search behaviour for single-word queries and for queries where all tokens appear in a single label MUST be preserved unchanged.
- **FR-008**: When the trimmed query string exactly equals the local name of an entity's IRI (case-insensitive), that entity MUST appear in results. "Local name" is defined as the substring after the last `#` or `/` in the full IRI, with no namespace prefix included.
- **FR-009**: Entity-name matching MUST be exact (not substring): a query of `12303` MUST NOT match an entity whose local name is `123037004`; a query of `123037004` MUST NOT match an entity whose local name is `12303`.
- **FR-010**: Entities matched by entity-name exact match MUST rank at the top of results, above all label-based matches.

### Key Entities

- **Search token**: A single whitespace-delimited term from the user's query, matched as a case-insensitive substring against label fields.
- **Entity local name**: The substring of an entity's full IRI after the last `#` or `/` character. Namespace and prefix are excluded. Used for exact-match lookup only.
- **Label set**: The union of all label values for an entity across `rdfs:label` (all languages), `skos:prefLabel`, `skos:altLabel`. Does not include the local name for substring matching (local name participates only in exact-match lookup per FR-008).
- **Entity match**: An entity that satisfies either (a) entity-name exact match (FR-008) or (b) every query token appears as a substring in at least one value of the entity's label set.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A multi-word query where each word appears in a different label field of the target entity returns that entity 100% of the time (zero false negatives for this cross-field case).
- **SC-002**: All queries that returned results before this change continue to return the same entities after (zero regression).
- **SC-003**: Search results appear within 300 ms for ontologies up to 200,000 entities — no observable slowdown vs. current baseline.
- **SC-004**: Searching with a single partial token (first three or more characters of a label word) returns at least one relevant entity when such entities exist in the loaded ontology.
- **SC-005**: Searching an entity's exact local name (e.g., a SNOMED concept ID) returns that entity as the first result 100% of the time; searching a partial local name never returns the entity via entity-name matching.

## Assumptions

- Matching applies to `rdfs:label` (all languages), `skos:prefLabel`, `skos:altLabel`, and the entity's IRI local name. Other annotation properties (e.g., `rdfs:comment`, `skos:definition`) are out of scope for this iteration.
- Language-tag filtering is out of scope: all language variants of a label participate in matching regardless of the user's preferred display language.
- The IRI local name participates in entity-name exact match only (FR-008/FR-009). It does NOT participate in label substring matching — this prevents a query like "123" from spuriously surfacing thousands of SNOMED concepts whose IDs contain "123" as a substring.
- CamelCase splitting of IRI local names (e.g., splitting "BodyStructure" into ["body", "structure"] as separate tokens) is out of scope.
- Maximum result count (currently 100 per search) is unchanged.
- The search operates on the in-memory index rebuilt at ontology load time; no on-disk index or external search engine is introduced.
- Duplicate token deduplication (e.g., "body body" treated as one distinct token "body") is acceptable but not required; either behaviour is correct.
