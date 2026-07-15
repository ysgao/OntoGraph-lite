# @ysgao/ontograph-cli-standalone

Standalone CLI for [OntoGraph](https://github.com/ysgao/OntoGraph-lite) OWL ontology reasoning.
Bundles its own Java runtime and reasoner — **no VS Code, no system Java installation required**.

This is a separate, independent distribution from [`@ysgao/ontograph-cli`](../cli/README.md) (the
"minimal" CLI). Install whichever fits your use case — the two are not designed to be installed
together under the same global `ontograph` binary name.

> **Platform support (this release): macOS on Apple Silicon (arm64) only.** Running on any other
> platform/architecture reports a clear `PLATFORM_UNSUPPORTED` error rather than a silent or
> cryptic failure. Broader platform coverage may follow as a separate release.

All commands print one JSON object to stdout and exit with a standard code. No interactive prompts.

## Install

```bash
npm install -g @ysgao/ontograph-cli-standalone
```

That's it — the package includes everything needed to reason over an ontology: a bundled Eclipse
Temurin 21 JRE and the OntoGraph reasoner. No separate Java install, no running VS Code required
for any command in this package.

## Quick start

```bash
ontograph --help
ontograph parse ./ontology.ofn
ontograph classify ./ontology.ofn
ontograph dl-query ./ontology.ofn "Animal and hasHabitat some Ocean" --types directSubClasses
```

---

## Shared commands — identical to the minimal CLI

`parse`, `search`, `validate`, `convert`, `stats`, `entity-info` behave exactly as documented in
[`cli/README.md`](../cli/README.md)'s "Core commands" section — none of these need Java or VS
Code in either package, and both packages register them from the same source
(`cli/src/registerCoreCommands.ts`), so they can never drift apart.

---

## Reasoning commands — bundled runtime, no VS Code

Unlike the minimal CLI's `classify`/`check-consistency`/`dl-query` (which require a running VS
Code extension), these commands take a local ontology file directly and reason over it using this
package's own bundled runtime.

### `ontograph classify <file>`

```bash
ontograph classify ./ontology.ofn
ontograph classify ./ontology.ofn --reasoner hermit
```

Flags:
- `--reasoner <hermit|elk|auto>` — reasoner engine selection. Default: `elk` (a deliberate,
  predictable default for scripts/CI — not the minimal CLI's own size-based `auto` selection,
  though `auto` remains available as an explicit choice).

Output: identical shape to the minimal CLI's `classify` result (`consistent`, `incoherentClasses`,
`hierarchy`, `equivalentClasses`).

### `ontograph check-consistency <file>`

```bash
ontograph check-consistency ./ontology.ofn
```

Output: identical shape to the minimal CLI's `check-consistency` result (`consistent`,
`explanation?`).

### `ontograph dl-query <file> <expression>`

```bash
ontograph dl-query ./ontology.ofn "Koala" --types directSuperClasses
ontograph dl-query ./ontology.ofn "Body structure" --types subClasses --filter "liver"
```

Identical `--types`/`--filter` contract to the minimal CLI's `dl-query` — same six category
names (`directSuperClasses`, `superClasses`, `equivalentClasses`, `directSubClasses`,
`subClasses`, `instances`), same `subClasses`-only default when `--types` is omitted, same
case-insensitive label/IRI substring `--filter`, same partial-keys result shape (only requested
categories are present in `data`).

---

## Error handling

| Exit code | Error code | Meaning |
|-----------|-----------|---------|
| 0 | — | Success |
| 1 | `FILE_NOT_FOUND` | File path does not exist |
| 2 | `PARSE_ERROR` | File cannot be parsed as valid OWL |
| 4 | `INVALID_ARGS` | Missing or invalid argument (e.g. an unrecognized `--types` value) |
| 12 | `BRIDGE_ERROR` | The reasoner reported an error for this specific request (e.g. a malformed DL expression) |
| 13 | `RUNTIME_UNAVAILABLE` | The bundled runtime is missing or corrupted — reinstall the package |
| 14 | `PLATFORM_UNSUPPORTED` | This platform/architecture isn't supported by this release (macOS arm64 only) |

## Formats supported

Same as the minimal CLI: OWL Functional Syntax (`.ofn`), Manchester Syntax (`.omn`), OWL/XML
(`.owl`, `.owx`), Turtle/N-Triples (`.ttl`, `.n3`).

## License

Apache-2.0 — same as [OntoGraph-lite](https://github.com/ysgao/OntoGraph-lite).
