# Data Model: Autodetect OWL Syntax for .owl Files

This feature has no new persistent data. The only model change is to the internal
format-detection return type within `ParserRegistry.ts`.

## OwlFormat Type

The private return type of `detectOwlFormat` expands from 4 values to 6:

| Value        | Meaning                                         |
|--------------|-------------------------------------------------|
| `'functional'` | OWL Functional Syntax (`Ontology(` found in first 4 KB) |
| `'manchester'` | Manchester Syntax (`Ontology:` found in first 2 KB) — **NEW** |
| `'owlxml'`     | OWL/XML (`<Ontology` + `owl#` namespace in first 2 KB) |
| `'rdfxml'`     | RDF/XML (`<rdf:RDF` in first 2 KB) |
| `'turtle'`     | Turtle (`@prefix`/`@base`/`PREFIX `/`BASE ` in first 1 KB) — **NEW** |
| `'unknown'`    | None of the above fingerprints matched |

## Detection Scan Windows

| Format       | Scan window | Key token(s) |
|--------------|-------------|--------------|
| Functional   | 4 KB        | `Ontology(` |
| Manchester   | 2 KB        | `Ontology:` |
| OWL/XML      | 2 KB        | `<Ontology` + `owl#` namespace |
| RDF/XML      | 2 KB        | `<rdf:RDF` |
| Turtle       | 1 KB        | `@prefix`, `@base`, `PREFIX `, `BASE ` |

All windows applied to `text.trimStart()` (strips BOM + leading whitespace).

## No Persistent State Changes

`OntologyModel.sourceFormat` already carries the detected format string and is
set by `ParserRegistry.parse`. No schema or storage changes required.
