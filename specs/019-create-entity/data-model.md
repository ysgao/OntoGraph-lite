# Data Model: Create New Ontology Entity

**Branch**: `019-create-entity` | **Date**: 2026-06-26

## Existing Entities (referenced, not changed)

### `OntologyModel` (src/model/OntologyModel.ts)
```
OntologyModel
  metadata: OntologyMetadata
    iri?: string            ← used as default namespace
    versionIri?: string
    imports: string[]
    annotations: Record<string, string[]>
  classes:             Map<string, OWLClass>
  objectProperties:    Map<string, OWLObjectProperty>
  dataProperties:      Map<string, OWLDataProperty>
  annotationProperties: Map<string, OWLAnnotationProperty>
  individuals:         Map<string, OWLIndividual>
```

### `OWLEntity` (base for all types)
```
OWLEntity
  iri:         string         ← globally unique; constructed as namespace + localName
  type:        EntityType     ← 'class' | 'objectProperty' | 'dataProperty'
                                 | 'annotationProperty' | 'individual'
  labels:      Record<string, string[]>   ← lang → labels
  annotations: Record<string, string[]>  ← propIri → values
```

### `EntityType` (discriminant union)
```
'class' → OWLClass
'objectProperty' → OWLObjectProperty
'dataProperty' → OWLDataProperty
'annotationProperty' → OWLAnnotationProperty
'individual' → OWLIndividual
```

## New Concept: Entity Creation Request

The creation dialog collects:
```
EntityCreationRequest
  entityType: EntityType     ← selected from QuickPick
  localName:  string         ← user-provided; validated
  namespace:  string         ← resolved (settings → model.metadata.iri → prompt)
  iri:        string         ← computed: namespace + localName
```

**Validation rules:**
- `localName` non-empty
- `localName` matches `^[A-Za-z_][A-Za-z0-9_\-\.]*$`
- `iri` not already present in `OntologyIndex`
- `namespace` non-empty; must be a valid IRI prefix (ends with `#` or `/`)

## New Concept: IRI Rename Request

Handled entirely in the extension host; not persisted as a data type:
```
IriRenameRequest
  entityIri:  string   ← current IRI (before rename)
  newIri:     string   ← target IRI (validated before applying)
```

**Validation rules:**
- `newIri` is a syntactically valid absolute IRI
- `newIri` does not already exist in `OntologyIndex`

## State Transitions

```
[Ontology loaded]
  → user invokes addEntity
  → namespace resolved
  → user picks type + local name
  → IRI constructed and validated
  → entity added to model Map
  → Declaration + cluster inserted into source file
  → OntologyIndex rebuilt
  → refreshAllViews() called
  → Entity Editor opened with new entity IRI
[Entity visible in panel and editor]

[Entity Editor open]
  → user edits IRI field
  → RenameIriMessage sent to extension host
  → host validates new IRI
  → if valid: old key removed from model Map, new key inserted
  → IriRenameSync replaces <oldIri> with <newIri> in document
  → OntologyIndex rebuilt
  → Entity Editor reloaded with new IRI
[Entity has new IRI]
```

## Configuration Schema (new setting)

```
ontograph.entity.defaultNamespace
  type:    string
  default: ""
  description: "Base IRI prefix appended to local names when creating new entities.
                Must end with '#' or '/'. If empty, the ontology's declared IRI is used."
```

## Webview Message Extensions

See `contracts/entity-editor-messages.md` for the full IPC contract.

New messages added to `EntityEditorMessages.ts`:
- `RenameIriMessage` (webview → extension): carries `newIri: string`
- `IriRenameResultMessage` (extension → webview): carries `success: boolean`, `error?: string`, `newIri?: string`
