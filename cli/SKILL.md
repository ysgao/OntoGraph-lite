---
name: ontograph
description: Interactive OWL ontology browser using the ontograph CLI. Search entities in an OWL file, display a numbered list, let user pick one, then show all its labels and axioms with fully resolved IRI labels (e.g. "Liver structure ≡ Body structure ⊓ ∃ all or part of . Entire liver"). Trigger when user says "ontograph search <query> <file>" or asks to search/browse an OWL ontology file.
---

# Skill: ontograph

## Trigger
User runs `ontograph search <query> <file>` or asks to search/browse entities in an OWL file.

## Step 1 — Run Search

Run:
```
ontograph search <file> "<query>" --limit 20
```

Parse the JSON result. Extract the `results` array.

## Step 2 — Display Numbered List

For each result, display the `label` field (this is already the rdfs:label from ontograph's output). If `label` is empty or missing, note "no label".

Format:
```
1. Liver structure  (http://snomed.info/id/10200004)
2. Structure of lobe of liver  (http://snomed.info/id/245378000)
3. ...
```

If `totalMatches` > results shown, note "Showing X of Y matches. Use --limit N to see more."

Ask: "Select a number to view details, or enter a new search query."

## Steps 3–5 — Extract, Resolve, and Display

Run the reusable detail script with the concept ID and OWL file as arguments:

```bash
python3 ~/.claude/skills/ontograph/detail.py <concept_id> <owl_file>
```

Example:
```bash
python3 ~/.claude/skills/ontograph/detail.py 10200004 /Users/yoga/SCT_OWL/anatomy.owl
```

The script output will be collapsed in the tool result — this is expected. After the tool call, **always render the full output in text** using these sections:

```
**<ConceptLabel>** `(conceptId)`

**Annotations:**
\`\`\`
label       "..."@en
prefLabel   "..."@en   (omit if same as label)
altLabel    "..."@en   (omit if absent)
\`\`\`

**Axioms:**
\`\`\`
<fully resolved expression using ≡ ⊑ ⊓ ∃ ∀ ¬ — no EquivalentClasses/SubClassOf prefix>
\`\`\`

**GCI Axioms:**   (omit section if none)
\`\`\`
<fully resolved GCI expression>
\`\`\`
```

Axiom display rules:
- Drop the `EquivalentClasses` / `SubClassOf` keyword prefix — the logic symbols (≡, ⊑) already convey the type
- If a SubClassOf human-reading is identical to an EquivalentClasses, print `(derived from equivalence)` instead of repeating
- GCI axioms are `SubClassOf(ComplexExpr ConceptIRI)` — concept IRI on the right-hand side, found outside the concept block

## Step 6 — Offer Next Action

After displaying details, ask:
```
Select another number, enter a new search query, or press Enter to exit.
```

## Notes

- Always use the same OWL file throughout the session unless user specifies a different one.
- The ontograph search result `label` field already resolves to rdfs:label — no need to grep for it in Step 2.
- For object properties (type=objectProperty), display domain/range axioms if present.
- IRI resolution always uses Python (never bash grep loops) — single-pass scan via `detail.py`.
