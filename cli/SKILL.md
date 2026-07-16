---
name: ontograph
description: Interactive OWL ontology browser using the ontograph CLI. Search entities in an OWL file, display a numbered list, let user pick one, then show all its labels and axioms with fully resolved IRI labels (e.g. "Liver structure ≡ Body structure ⊓ ∃ all or part of . Entire liver"). Trigger when user says "ontograph search <query> <file>", "ontograph entity-info <label> <file>", or asks to search/browse/look up an entity in an OWL ontology file.
---

# Skill: ontograph

## Trigger
User runs `ontograph search <query> <file>` / `ontograph entity-info <label> <file>`, or asks to
search, browse, or look up an entity in an OWL file.

## Step 1 — Run Search

Run:
```bash
ontograph search <file> "<query>" --limit 20
```

`<file>` may be omitted (`ontograph search "<query>"`) if the user hasn't named a file — the CLI
then resolves it from whichever ontology is currently open in the running OntoGraph VS Code
extension. If that fails with `errorCode: "BRIDGE_UNAVAILABLE"` or `"NO_ACTIVE_FILE"`, ask the user
which file to use.

Parse the JSON result. It has two entity lists:
- `exactMatches` — entities whose label/prefLabel/altLabel equals `<query>` exactly
  (case-insensitive). Empty if nothing matches exactly; more than one entry means the query is
  ambiguous as an identifier.
- `results` — the full fuzzy-ranked list (includes the `exactMatches` entries too).

If you already know the exact label or IRI you want, skip straight to Step 3 —
`ontograph entity-info` resolves labels itself, so there's no need to search first just to find
an IRI.

## Step 2 — Display Numbered List

For each entry in `results`, display the `label` field (already resolved from rdfs:label). If
`label` is empty or missing, note "no label". Mark entries that also appear in `exactMatches` with
a `✓` so the user can spot an unambiguous exact hit at a glance.

Format:
```
1. Liver structure  (http://snomed.info/id/10200004)  ✓ exact match
2. Structure of lobe of liver  (http://snomed.info/id/245378000)
3. ...
```

If `totalMatches` > results shown, note "Showing X of Y matches. Use --limit N to see more."

Ask: "Select a number to view details, or enter a new search query."

## Step 3 — Look Up Details

Run entity-info with the IRI of the selected result (or a label typed directly by the user —
entity-info resolves IRI, local name, and exact label/prefLabel/altLabel itself, in that order):

```bash
ontograph entity-info <file> "<iri-or-label>"
```

`<file>` is optional here too, with the same VS Code active-file fallback as `search`.

Parse the JSON. Three outcomes:

- **`errorCode: "AMBIGUOUS_MATCH"`** — the label matched more than one entity. Show
  `data.candidates` (each `{iri, type}`) as a numbered list and ask the user to pick one, then
  re-run with that exact IRI.
- **`errorCode: "NOT_FOUND"`** — nothing matched. Show `data.suggestions` (each `{iri, label}`) as
  the closest labels found, and ask the user to pick one or refine the query.
- **`success: true`** — render the details per Step 4.

## Step 4 — Render Details

All entity references in the response already carry labels — no IRI resolution step needed.

- `data.labels` is `{lang: [values]}` (from `rdfs:label`). Use the `en` entry if present, else the
  first available language, else fall back to `data.localName`.
- `data.annotations` is `{annotationPropertyIri: [rawValue@lang, ...]}`. Look up these two keys for
  prefLabel/altLabel (values still carry an `@lang` suffix — strip it for display):
  - `http://www.w3.org/2004/02/skos/core#prefLabel`
  - `http://www.w3.org/2004/02/skos/core#altLabel`
- `superClasses` / `equivalentClasses` / `disjointClasses` / `directSubClasses` are arrays of
  `{iri, label}` — use `label`, falling back to the IRI's last path segment if `label` is `null`.
- `superClassExpressions` / `equivalentClassExpressions` / `gciExpressions` are Manchester-syntax
  strings with every embedded IRI **already rendered as its label** (e.g.
  `"Body structure and (all or part of some Entire liver)"`). Convert Manchester keywords to logic
  symbols using this table (apply narrowest-scope first, respecting existing parens):

  | Manchester | Symbol form |
  |---|---|
  | `A and B and C` | `A ⊓ B ⊓ C` |
  | `A or B` | `A ⊔ B` |
  | `not A` | `¬A` |
  | `P some C` | `∃ P . C` |
  | `P only C` | `∀ P . C` |
  | `P value v` | `∃ P . {v}` |
  | `P min N C` | `≥N P . C` (omit `. C` if no filler) |
  | `P max N C` | `≤N P . C` |
  | `P exactly N C` | `=N P . C` |

Format:
```
**<Label>** `(<localName>)`

**Annotations:**
```
label       "..."@en
prefLabel   "..."@en   (omit if same as label)
altLabel    "..."@en   (omit if absent)
```

**Superclasses:** <superClasses labels, comma-separated>   (omit if empty)
**Disjoint with:** <disjointClasses labels, comma-separated>   (omit if empty)
**Direct subclasses:** <directSubClasses labels, comma-separated>   (omit if empty)

**Axioms:**
```
<Label> ≡ <equivalentClasses label, or converted equivalentClassExpressions>
<Label> ⊑ <converted superClassExpressions, one per line>
```

**GCI Axioms:**   (omit section if gciExpressions is empty)
```
<converted expression> ⊑ <Label>
```
```

Notes on the axioms block:
- `equivalentClasses`/`equivalentClassExpressions` and `superClasses`/`superClassExpressions` can
  overlap (`superClasses` includes named conjuncts already implied by an equivalence) — that's
  expected, not a bug; don't try to fully dedupe, just avoid printing the exact same line twice.
- For object/data properties, show `domainIris`/`rangeIris` (already local names) as
  `Domain:`/`Range:` instead of the class-specific fields above.

## Step 5 — Offer Next Action

After displaying details, ask:
```
Select another number, enter a new search query, or press Enter to exit.
```

## Notes

- Always use the same OWL file throughout the session unless user specifies a different one.
- Everything here comes straight from `ontograph search`/`ontograph entity-info` JSON — no
  auxiliary scripts, no raw-file grepping. Both commands work on any supported format (`.ofn`,
  `.omn`, `.ttl`, `.owl`/`.owx`), not just SNOMED-style `.owl` functional syntax.
- entity-info's label resolution already covers `rdfs:label`, `skos:prefLabel`, `skos:altLabel`,
  and bare IRI local names — don't second-guess it by re-deriving an IRI yourself.
