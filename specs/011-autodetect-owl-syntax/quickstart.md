# Quickstart: Autodetect OWL Syntax for .owl Files

## What changes

`src/parser/ParserRegistry.ts` — the only file modified.

Two changes in that file:
1. `detectOwlFormat` — extended to detect all 5 formats (adds Manchester, Turtle; fixes Functional to scan 4 KB for `Ontology(` instead of checking only the file start).
2. `ParserRegistry.parse` case `'owl-xml'` — dispatches to Manchester and Turtle parsers when detected.

## How to verify manually

1. Copy `test-ontologies/bfo-core.ofn` to `bfo-test.owl`.
2. Open `bfo-test.owl` in VS Code with the extension active.
3. The class hierarchy panel must populate — no parse error.
4. Copy `test-ontologies/animals.omn` to `animals-test.owl` and repeat.
5. Copy `test-ontologies/animals.ttl` to `animals-turtle.owl` and repeat.
6. Existing files (`pizza.owl`, `animals.owx`) must still open correctly.

## Run tests

```bash
npm test -- src/parser/ParserRegistry.test.ts
npm test   # full suite — zero regressions
```
