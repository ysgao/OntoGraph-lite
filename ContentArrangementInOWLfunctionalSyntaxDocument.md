# Content Arrangement in OWL Functional Syntax — Write Specification

This document is the **normative reference for how OntoGraph writes and modifies
OWL Functional-Style Syntax (`.ofn`) files.** It governs both:

- **Full serialization** — `serializeToFunctional` / `generateEntityCluster`
  (`src/serializer/FunctionalSerializer.ts`), used by export/convert.
- **In-place edits** — `EntityCreationSync` (new entities), `AnnotationSync`
  (annotation + cluster-header changes), `AxiomSync` (logical axioms).

The reference layout is the Protégé/SNOMED-style file `test-ontologies/anatomy.owl`.
Any writer **MUST** preserve this arrangement so that diffs stay minimal, the file
round-trips cleanly through Protégé, and the segment index stays valid.

> Keywords **MUST**, **MUST NOT**, **SHOULD** are used in the normative sense.

---

## 1. Top-level document order (normative)

A document is emitted strictly in this order:

| # | Section | Notes |
|---|---------|-------|
| 1 | **Prefix declarations** | One `Prefix(...)` per line. |
| 2 | **Ontology wrapper open** | `Ontology(<ontologyIRI>` — or bare `Ontology(` when the file has no ontology IRI. |
| 3 | **Imports** | `Import(<iri>)` lines, if any. |
| 4 | **Declarations block** | Every entity, grouped by kind (§2). |
| 5 | **Object Property clusters** | §3 |
| 6 | **Data Property clusters** | §3 |
| 7 | **Annotation Property clusters** | §3 |
| 8 | **Class clusters** | §3 — the bulk of the file. |
| 9 | **Individual clusters** | §3 |
| 10 | **General Class Inclusion (GCI) axioms** | §4 |
| 11 | **Property Chain axioms** | §4 |
| 12 | **Ontology wrapper close** | A bare `)` on its own line. |

Each major section is separated from the next by **exactly one blank line**.
Files MAY carry section-banner comments between major sections, e.g.

```owl
############################
#   Classes
############################
```

Writers MUST NOT remove existing banners and SHOULD NOT invent new ones.

---

## 2. Declarations block

- One `Declaration(...)` per line, **no blank lines within the block**.
- Grouped by kind, in this canonical order:

  1. `Declaration(Class(<IRI>))`
  2. `Declaration(ObjectProperty(<IRI>))`
  3. `Declaration(DataProperty(<IRI>))`
  4. `Declaration(AnnotationProperty(<IRI>))`
  5. `Declaration(NamedIndividual(<IRI>))`

### Write rule — inserting a new declaration

A new entity's declaration is placed so the grouping is preserved:

1. **If declarations of the same kind exist** → insert immediately **after the
   last** declaration of that kind.
2. **Else, if a later-ranked kind exists** (rank order = Class < ObjectProperty <
   DataProperty < AnnotationProperty < NamedIndividual) → insert **before the
   first** declaration of that later kind.
3. **Else** → insert after the last declaration of any kind.

The new line's indentation **MUST match** the declaration it is anchored to
(see §6). A new Class therefore lands among the Class declarations — never after
the ObjectProperty/AnnotationProperty block.

*(Implemented in `EntityCreationSync.insertNewEntity`.)*

---

## 3. Entity clusters

All five cluster kinds (Object Property, Data Property, Annotation Property,
Class, Individual) share one shape:

```owl
# <Kind>: <IRI> (<display label>)
                                        ← single blank line after the header
AnnotationAssertion(rdfs:label <IRI> "<label>"@en)
AnnotationAssertion(<other-annotation-prop> <IRI> "<value>"@en)
<logical axioms…>
```

- **Header comment**: `# <Kind>: <IRI> (<display label>)` where `<Kind>` ∈
  `Class | ObjectProperty | DataProperty | AnnotationProperty | Individual`.
  The display label is the entity's `rdfs:label` (`en` preferred), falling back
  to the first available label, then to the IRI local name.
- A **single blank line follows the header**.
- Clusters are separated from one another — and the cluster section from the GCI
  section — by **exactly one blank line** (never zero, never two).

### 3.1 Cluster internal order (normative)

1. **Annotations** — `rdfs:label`(s) first, then every other annotation property
   (`skos:prefLabel`, `skos:altLabel`, `rdfs:comment`, …).
2. **Logical axioms**, by entity kind:

   | Kind | Axiom order |
   |------|-------------|
   | Class | `EquivalentClasses` → `SubClassOf` (one per named superclass; `owl:Thing` skipped) → `DisjointClasses` |
   | ObjectProperty | `InverseObjectProperties` → `SubObjectPropertyOf` → `ObjectPropertyDomain` → `ObjectPropertyRange` → characteristics (`Transitive`/`Symmetric`/`Functional`/`InverseFunctional`) |
   | DataProperty | `SubDataPropertyOf` → `DataPropertyDomain` → `DataPropertyRange` → `FunctionalDataProperty` |
   | AnnotationProperty | `SubAnnotationPropertyOf` |
   | Individual | `ClassAssertion` → `ObjectPropertyAssertion` → `DataPropertyAssertion` |

### 3.2 Write rules — clusters

- **New cluster placement**: a newly created entity's cluster is inserted at the
  **end of its cluster section** — i.e. after the last existing cluster of any
  kind and **before the GCI section** — with one blank line separating it from
  the preceding content and one from the following content. Writers MUST NOT
  place cluster content inside the GCI/property-chain block.
- **Header label refresh**: when an entity's display label changes, the
  `(label)` in its header comment is rewritten **in place**. If the header has no
  `(...)` bracket, one is appended. Only the four RDFS built-ins are abbreviated
  in axioms (see §5); the header always uses the full `<IRI>` form.
  *(Implemented in `AnnotationSync.syncFunctional`.)*

---

## 4. GCI axioms and property chains

These appear **after all clusters**, before the closing `)`.

- **General Class Inclusion (GCI) axioms** — `SubClassOf(...)` whose **first
  argument is a complex class expression** (begins with an uppercase OWL
  keyword such as `ObjectIntersectionOf`, `ObjectSomeValuesFrom`):

  ```owl
  SubClassOf(ObjectIntersectionOf(<A> ObjectSomeValuesFrom(<r> <B>)) <C>)
  ```

  One per line. (A `SubClassOf(<namedClass> …)` — first argument a named class —
  is an ordinary subsumption axiom that belongs in that class's cluster, **not**
  here.)

- **Property Chain axioms** — `SubObjectPropertyOf(ObjectPropertyChain(...) <p>)`,
  one per line, immediately after the GCI block.

---

## 5. IRI abbreviation rule

Only the **four RDFS built-in annotation property IRIs** are written as
abbreviated tokens:

```
rdfs:label   rdfs:comment   rdfs:seeAlso   rdfs:isDefinedBy
```

**Every other IRI** — entity IRIs, other annotation property IRIs (including
`skos:*`), and all class-expression IRIs — is written in the full `<IRI>`
bracket form. This matches Protégé output and is required for stable diffs.

---

## 6. Indentation

- **In-place edits MUST preserve the file's existing indentation.** A new
  declaration adopts the indentation of the sibling declaration it is anchored
  to; new cluster lines adopt the indentation used by existing clusters.
- Protégé/SNOMED reference files (e.g. `anatomy.owl`) place **all content at
  column 0**.
- Full (re)serialization via `serializeToFunctional` emits a self-consistent
  **2-space** indentation for declarations, clusters, GCIs, and chains; this is
  only used when producing a brand-new file (export/convert), where no existing
  indentation needs to be matched.

---

## 7. Reference layout — `anatomy.owl`

Approximate line ranges in the pristine reference file (302,151 lines):

| Lines | Section |
|------:|---------|
| 1–6 | Prefix declarations |
| 9 | `Ontology(` open |
| 10–35,974 | Declarations — Class (10–35,956), ObjectProperty (35,957–35,967), AnnotationProperty (35,968–35,974) |
| 35,976–36,037 | Object Property clusters (banner `#  Object Properties`) |
| 36,039–299,326 | Class clusters (banner `#  Classes`; first header at 36,042) |
| 299,328–302,145 | GCI axioms |
| 302,147–302,150 | Property Chain axioms |
| last line | Closing `)` |

### Concrete cluster example

```owl
# Class: <http://snomed.info/id/10013000> (Lateral meniscus structure)

AnnotationAssertion(rdfs:label <http://snomed.info/id/10013000> "Lateral meniscus structure"@en)
AnnotationAssertion(<http://www.w3.org/2004/02/skos/core#altLabel> <http://snomed.info/id/10013000> "Lateral meniscus"@en)
AnnotationAssertion(<http://www.w3.org/2004/02/skos/core#prefLabel> <http://snomed.info/id/10013000> "Lateral meniscus structure"@en)
EquivalentClasses(<http://snomed.info/id/10013000> ObjectIntersectionOf(…))

# Class: <http://snomed.info/id/10024003> (Structure of base of lung)

…
```
