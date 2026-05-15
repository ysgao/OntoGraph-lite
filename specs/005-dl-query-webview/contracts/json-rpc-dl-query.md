# Contract: JSON-RPC `dlQuery` Method

**Interface**: Java Reasoner Server ↔ TypeScript Extension Host  
**Transport**: stdin/stdout (newline-delimited JSON)  
**Added in**: 005-dl-query-webview

---

## Request

```json
{
  "id": 3,
  "method": "dlQuery",
  "params": {
    "format": "functional",
    "content": "Prefix(:=<http://example.org/>)\nOntology(<http://example.org/>\n  Declaration(Class(:Animal))\n)",
    "filePath": null,
    "engine": "auto",
    "classExpression": "Animal and hasLegs some xsd:integer",
    "queryTypes": ["directSubClasses", "subClasses", "instances"]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `format` | string | yes | One of `functional`, `manchester`, `turtle`, `rdf-xml`, `owl-xml` |
| `content` | string\|null | conditional | Ontology text. Mutually exclusive with `filePath`; one must be non-null. |
| `filePath` | string\|null | conditional | Absolute path to ontology file. Mutually exclusive with `content`. |
| `engine` | string | yes | `"auto"` (default), `"elk"`, or `"hermit"` |
| `classExpression` | string | yes | Manchester Syntax class expression to query |
| `queryTypes` | string[] | yes | Non-empty subset of `["directSuperClasses","superClasses","equivalentClasses","directSubClasses","subClasses","instances"]` |

---

## Success Response

```json
{
  "id": 3,
  "result": {
    "directSuperClasses": [],
    "superClasses": [],
    "equivalentClasses": [],
    "directSubClasses": ["http://example.org/Dog", "http://example.org/Cat"],
    "subClasses": ["http://example.org/Dog", "http://example.org/Cat", "http://example.org/Puppy"],
    "instances": []
  }
}
```

All six keys are always present in the result object, even if not requested or empty.

---

## Error Response

```json
{
  "id": 3,
  "error": {
    "message": "Could not parse class expression: 'Animal and hasLegs some xsd:integer' — unknown entity: hasLegs"
  }
}
```

Error cases:
- Ontology cannot be loaded (malformed content/file not found)
- Class expression cannot be parsed by OWLAPI Manchester parser
- Reasoner throws an exception during query

---

## Notes

- The server creates a fresh `OWLOntologyManager` per `dlQuery` request (same pattern as `classify` and `checkConsistency`).
- Engine selection follows existing logic: auto → ELK if class count > 5000, HermiT otherwise.
- Only the requested `queryTypes` are computed; other lists return empty arrays to avoid unnecessary reasoner invocations.
- `owl:Thing` and `owl:Nothing` are included in results if the reasoner returns them — filtering is the client's responsibility (FR-007, FR-008).
- **EquivalentClasses approach (Decision 7)**: The Java server wraps the `classExpression` string as `EquivalentClasses(TempQueryClass, <expression>)` for a temporary named class (`urn:ontograph:dlquery#TempQuery`), runs full `precomputeInferences()`, then queries `TempQueryClass`'s position in the inferred hierarchy. The wire format is unchanged — this is an internal implementation detail of the server. `TempQueryClass` is filtered from the `equivalentClasses` list before returning the response.
