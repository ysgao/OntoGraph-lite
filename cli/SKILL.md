---
name: ontograph-cli
description: Interactive OWL ontology and OntoGraph software using the ontograph CLI. Search entities in an OWL file or active ontology opened in OntoGraph-lite, display a numbered list, let user pick one, then show all its labels and axioms with fully resolved IRI labels (e.g. "Liver structure ≡ Body structure ⊓ ∃ all or part of . Entire liver"). Trigger when user says "ontograph search <query> <file>" or asks to search an active OWL ontology in VS Code extension or Antigravity IDE.
---

# Skill: ontograph-cli

## Trigger
User runs `ontograph search <query> <file>` or asks to search/browse entities in an OWL file.

## Step 1 — Run Search

Run:
```
ontograph search <file> "<query>" --limit 20
```

Parse the JSON result. Extract the `results` array.

## Step 2 — Display Numbered List

For each result, display the `label` field (this is already the rdfs:label from ontograph's output). If `label` is empty or missing, use skos:prefLabel instead.

Format:
```
1. Liver structure  (http://snomed.info/id/10200004)
2. Structure of lobe of liver  (http://snomed.info/id/245378000)
3. ...
```

If `totalMatches` > results shown, note "Showing X of Y matches. Use --limit N to see more."

Ask: "Select a number to view details, or enter a new search query."

## Step 3 — Resolve Entity Details

When user selects a number, take the IRI of that entity (e.g. `http://snomed.info/id/10200004`).

Run two parallel greps on the OWL file:

**A — extract the concept block:**
```bash
grep -n "<IRI>" <file>
```

Then read the OWL file lines around the concept's comment header `# Class: <IRI> (Label)` to get all lines until the next blank line after axioms. Typically this block is:
```
# Class: <IRI> (Label),  Example: # Class: <http://snomed.info/id/181268008> (Entire liver)

AnnotationAssertion(rdfs:label ...)
AnnotationAssertion(skos:altLabel ...)
AnnotationAssertion(skos:prefLabel ...)
EquivalentClasses(...)
SubClassOf(...)
```

Read lines from that section using Read tool with offset/limit. Do not make up axioms or annotations that do not exist in ontology.

**B — collect all IRIs from axioms:**
Extract every IRI of the form `<http://snomed.info/id/XXXXXXX>` from the axiom lines (EquivalentClasses, SubClassOf, ObjectSomeValuesFrom, ObjectIntersectionOf, etc), excluding the concept's own IRI.

For each unique foreign IRI, grep for its rdfs:label:
```bash
grep -m1 'rdfs:label.*<foreign_IRI>' <file>
```
Run all label lookups in parallel.

## Step 4 — Display Labels

Show all annotation assertions for the concept:
```
Labels:
  rdfs:label       → "Liver structure"@en
  skos:prefLabel   → "Liver structure"@en
  skos:altLabel    → "Liver"@en
```

## Step 5 — Display Axioms with Full Resolution

For each axiom line, replace every IRI `<http://snomed.info/id/XXXXXXX>` with its resolved label. Use this reading guide:

### OWL Functional Syntax → Human-readable

| Syntax pattern | Human reading |
|---|---|
| `EquivalentClasses(A B)` | `A ≡ B` |
| `SubClassOf(A B)` | `A ⊑ B` |
| `ObjectIntersectionOf(A B C)` | `A ⊓ B ⊓ C` |
| `ObjectUnionOf(A B)` | `A ⊔ B` |
| `ObjectSomeValuesFrom(R C)` | `∃ R . C` |
| `ObjectAllValuesFrom(R C)` | `∀ R . C` |
| `ObjectHasValue(R i)` | `∃ R . {i}` |
| `ObjectComplementOf(A)` | `¬A` |
| `SubObjectPropertyOf(R S)` | `R ⊑ S` |
| `TransitiveObjectProperty(R)` | `R is transitive` |
| `ReflexiveObjectProperty(R)` | `R is reflexive` |

Apply recursively for nested expressions.

Example output:
```
Axioms:
  EquivalentClasses → Liver structure ≡ Body structure ⊓ ∃ all or part of . Entire liver
  SubClassOf        → Liver structure ⊑ Body structure ⊓ ∃ all or part of . Entire liver
```

If an IRI cannot be resolved (no label found in file), show the concept ID in brackets, e.g. `[10200004]`.

## Step 6 — Offer Next Action

After displaying details, ask:
```
Select another number, enter a new search query, or press Enter to exit.
```

## Notes

- Always use the same OWL file throughout the session unless user specifies a different one.
- The ontograph search result `label` field already resolves to rdfs:label — no need to grep for it in Step 2.
- Skip SubClassOf axioms that are identical to EquivalentClasses (they are OWL-derived redundancies) — or note "(derived from equivalence)" instead of repeating the full expression.
- For object properties (type=objectProperty), display domain/range axioms if present.
