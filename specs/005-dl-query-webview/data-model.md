# Data Model: DL Query Webview

**Feature**: 005-dl-query-webview  
**Phase**: 1 — Design  
**Date**: 2026-05-15

---

## TypeScript Types (Extension Host)

### `DLQueryType` (enum-style union)

```typescript
// src/model/OntologyModel.ts — add alongside existing types
type DLQueryType =
  | 'directSuperClasses'
  | 'superClasses'
  | 'equivalentClasses'
  | 'directSubClasses'
  | 'subClasses'
  | 'instances';
```

**Default checked set**: `['directSuperClasses', 'directSubClasses', 'subClasses']`

### `DLQueryRequest`

Sent from `ReasonerBridge.ts` to the Java process.

```typescript
interface DLQueryRequest {
  format: string;           // e.g., 'functional', 'manchester', 'turtle'
  content: string | null;   // ontology text (null if filePath used)
  filePath: string | null;  // file path (null if content used)
  engine: 'auto' | 'elk' | 'hermit';
  classExpression: string;  // Manchester Syntax class expression
  queryTypes: DLQueryType[];
}
```

### `DLQueryResult`

Returned by `ReasonerBridge.dlQuery()`.

```typescript
interface DLQueryResult {
  directSuperClasses: string[];  // IRIs
  superClasses:       string[];
  equivalentClasses:  string[];
  directSubClasses:   string[];
  subClasses:         string[];
  instances:          string[];
}
```

**Invariant**: Only keys for requested `queryTypes` are populated; others are empty arrays (never absent, to simplify client code).

---

## Webview UI State (`DLQueryApp.ts`)

```typescript
interface DLQueryUIState {
  expression: string;                   // current textarea content
  queryTypes: Set<DLQueryType>;         // checked checkboxes
  showOwlThing: boolean;                // "Display owl:Thing" checkbox
  showOwlNothing: boolean;              // "Display owl:Nothing" checkbox
  nameFilter: string;                   // "Name contains" field
  rawResults: DLQueryResultGroups;      // full result from extension, pre-filter
  isLoading: boolean;
  error: string | null;
}

interface DLQueryResultGroups {
  directSuperClasses: EntityRef[];
  superClasses:       EntityRef[];
  equivalentClasses:  EntityRef[];
  directSubClasses:   EntityRef[];
  subClasses:         EntityRef[];
  instances:          EntityRef[];
}

interface EntityRef {
  iri: string;
  label: string;   // rdfs:label if available, else local name of IRI
}
```

**Default initial state**:
```typescript
{
  expression: '',
  queryTypes: new Set(['directSuperClasses', 'directSubClasses', 'subClasses']),
  showOwlThing: true,
  showOwlNothing: true,
  nameFilter: '',
  rawResults: { directSuperClasses: [], superClasses: [], equivalentClasses: [], directSubClasses: [], subClasses: [], instances: [] },
  isLoading: false,
  error: null,
}
```

---

## Derived Display State (computed, not stored)

```
displayResults = rawResults
  |> apply showOwlThing filter (remove owl:Thing from superClass groups)
  |> apply showOwlNothing filter (remove owl:Nothing from subClass groups)
  |> apply nameFilter (case-insensitive substring on label/IRI)
```

Filtering is **purely client-side**; no new message to extension needed when filter changes.

---

## Java Result Type (`OntologyService.java`)

```java
public static class DLQueryResult {
    public final List<String> directSuperClasses;
    public final List<String> superClasses;
    public final List<String> equivalentClasses;
    public final List<String> directSubClasses;
    public final List<String> subClasses;
    public final List<String> instances;

    DLQueryResult(
        List<String> directSuperClasses,
        List<String> superClasses,
        List<String> equivalentClasses,
        List<String> directSubClasses,
        List<String> subClasses,
        List<String> instances
    ) { ... }
}
```

---

## TempQueryClass (TypeScript-owned lifecycle, Java-owned expression)

A temporary OWL named class used per `dlQuery` request to enable engine-agnostic hierarchy queries.

| Field | Value |
|-------|-------|
| IRI | `urn:ontograph:dlquery#TempQuery` |
| Lifetime | Single Execute window: tracked by `DLQueryPanel.ts` in `temporaryClassIris: Set<string>` before `bridge.dlQuery()` call; removed in `finally` block (even on error) |
| Axioms added | `Declaration(TempQueryClass)` + `EquivalentClasses(TempQueryClass, <expr>)` — constructed by Java `OntologyService.dlQuery()` in its fresh `OWLOntologyManager` |
| TypeScript model impact | TempClass IRI added to `temporaryClassIris` set; sync-to-disk is inhibited for this IRI during the Execute window |
| Persisted? | Never — the Java fresh manager is discarded after classification; TypeScript removes IRI from `temporaryClassIris` in `finally`; no sync fires |

**Ownership split**:
- **TypeScript** owns: when TempClass is "in scope" (start of Execute), cleanup guarantee (finally block), sync inhibition guard, concurrent Execute prevention.
- **Java** owns: parsing the Manchester class expression (via `AnnotationValueShortFormProvider` for rdfs:label resolution), constructing the EquivalentClasses axiom, classification, and extracting TempClass hierarchy position.

**Invariant**: `TempQueryClass` is always filtered out of `equivalentClasses` results before returning `DLQueryResult`. It never appears in `directSuperClasses`, `superClasses`, `directSubClasses`, `subClasses`, or `instances` because the reasoner does not infer self-membership in those sets.

---

## Entity Type Inference

The webview needs to know the entity type of each result item to route the `navigate` message correctly.

**Rule**: Results from `instances` group → `entityType = 'individual'`; all other groups → `entityType = 'class'`.

This is encoded in the `EntityRef` shape passed in the webview message:

```typescript
interface EntityRef {
  iri: string;
  label: string;
  entityType: 'class' | 'individual';
}
```

The extension host annotates entity type when converting `DLQueryResult` IRIs into `EntityRef[]` before posting to the webview.
