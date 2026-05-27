# Research: Autodetect OWL Syntax for .owl Files

## Decision 1: Detection scope — .owl files only

**Decision**: Apply content-based syntax detection only when `languageId = 'owl-xml'` (i.e. `.owl` files). Files with `.ofn`, `.omn`, `.ttl`, `.owx` extensions have unambiguous language IDs and bypass detection entirely.

**Rationale**: VS Code already assigns the correct `languageId` for all unambiguous extensions via the `languages` contribution in `package.json`. The only ambiguous extension is `.owl`, which VS Code maps to `owl-xml` by default. Applying detection to other extensions would be unnecessary work and risks false-positive misclassification.

**Alternatives considered**: Detect format for all files regardless of extension — rejected because it adds latency and complexity to the common case where the extension is already reliable.

---

## Decision 2: Functional Syntax fingerprint — `Ontology(` via 4 KB scan

**Decision**: Detect OWL Functional Syntax by scanning the first 4 KB of the (non-XML) file content for the token `Ontology(`.

**Rationale**: Per W3C OWL 2 Functional Syntax spec, the grammar is `ontologyDocument := { prefixDeclaration } Ontology`. The `Prefix(` declarations that precede `Ontology(` vary in number; 4 KB is a safe upper bound to cover any realistic prefix-declaration block. Using only `Prefix(` as the indicator (as in the current code) is insufficient because `Prefix(` alone does not confirm Functional Syntax — `Ontology(` is the definitive token. Manchester Syntax uses `Prefix:` (colon) and `Ontology:` (colon), never `Ontology(`.

**Alternatives considered**: Check `Prefix(` at start of file — rejected per user guidance; `Prefix(` is not a reliable standalone indicator.

---

## Decision 3: Manchester Syntax fingerprint — `Ontology:` via 2 KB scan

**Decision**: Detect Manchester Syntax by scanning the first 2 KB of the (non-XML) file content for the token `Ontology:` (colon suffix).

**Rationale**: Per W3C OWL 2 Manchester Syntax spec, `Ontology:` is the only mandatory keyword for a valid Manchester document. It is syntactically unambiguous: the colon distinguishes it from the Functional Syntax `Ontology(` paren. Manchester files may have `Prefix:` declarations before `Ontology:`, but 2 KB covers any reasonable preamble.

**Alternatives considered**: Detect `Prefix:` — rejected because `Prefix:` is optional in Manchester and not unique enough.

---

## Decision 4: Turtle fingerprint — directive keywords via 1 KB scan

**Decision**: Detect Turtle by scanning the first 1 KB of the (non-XML) file content for `@prefix`, `@base`, `PREFIX `, or `BASE ` (space after the uppercase variants to avoid false matches).

**Rationale**: The W3C Turtle spec explicitly states: "Turtle documents may have the strings '@prefix' or '@base' (case-sensitive) or 'PREFIX' / 'BASE' (case-insensitive) near the beginning." These tokens are not used by any other OWL serialisation format. Turtle files that begin directly with a triple statement (no directive) are excluded from detection; they are considered out of scope since such files with a `.owl` extension are extremely rare in practice.

**Alternatives considered**: Deep parse — rejected as too expensive for a detection step.

---

## Decision 5: XML format fingerprints — root element scan via 2 KB

**Decision**: Detect XML-based formats by first checking whether the content (after stripping BOM and whitespace) starts with `<`. If so, scan the first 2 KB:
- OWL/XML: `<Ontology` present AND the `owl#` namespace IRI (`http://www.w3.org/2002/07/owl#`) is present in the same region.
- RDF/XML: `<rdf:RDF` present.

OWL/XML is checked before RDF/XML because `<Ontology` is more specific.

**Rationale**: W3C OWL/XML spec requires the root element `<Ontology xmlns="http://www.w3.org/2002/07/owl#">`. W3C RDF/XML spec requires the root element `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">`. Both formats may be preceded by an XML declaration (`<?xml ...?>`) and/or XML comments, so scanning starts from the trimmed string without requiring the element to be at position 0.

**Alternatives considered**: Parse the XML declaration only — rejected because comments and PI nodes can precede the root element.

---

## Decision 6: BOM handling — `trimStart()` on raw text

**Decision**: Apply `String.prototype.trimStart()` to the raw file content before detection. ECMAScript classifies U+FEFF (BOM) as WhiteSpace, so `trimStart()` handles it without a separate stripping step.

**Rationale**: Verified in ECMAScript spec: U+FEFF is in the `WhiteSpace` production and is therefore removed by `trimStart()`. No separate BOM-stripping code is needed.

---

## Decision 7: Implementation location — extend `detectOwlFormat` in `ParserRegistry.ts`

**Decision**: Extend the existing private `detectOwlFormat` function in `src/parser/ParserRegistry.ts` to return all five format values. Update the `'owl-xml'` case in `ParserRegistry.parse` to dispatch to all five parsers based on the detected format.

**Rationale**: The function already exists and already handles the `'owl-xml'` dispatch path. Extending it in place avoids creating new modules and keeps the change minimal. The `parserWorker.ts` calls `ParserRegistry.parse` with the original `languageId`, so the fix automatically applies to both the inline and worker-thread parse paths.

**Alternatives considered**: Move detection to `resolveLanguageId` in `extension.ts` — rejected because that function only has access to the VS Code document (requires reading text there), and would require passing the detected language ID through a chain of callers; the current approach keeps detection co-located with the dispatch logic.
