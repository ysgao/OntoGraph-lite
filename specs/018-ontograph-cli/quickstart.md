# Quickstart: @ysgao/ontograph-cli

For AI tools (Claude Code, Codex) and developers.

---

## Install

```bash
npm install -g @ysgao/ontograph-cli
ontograph --version   # 0.1.0
```

---

## Core operations (no VS Code required)

### Parse any OWL file

```bash
ontograph parse ./ontology.ofn
ontograph parse ./snomed.owl
```

Returns: classCount, objectPropertyCount, dataPropertyCount, annotationPropertyCount, individualCount, axiomCount, format, ontologyIri.

### Search entities

```bash
ontograph search ./ontology.omn "Animal"
ontograph search ./snomed.owl "Finding site" --type class --limit 5
ontograph search ./ontology.ofn "hasTopping" --type objectProperty
```

### Validate

```bash
ontograph validate ./my-ontology.ttl
# {"success":true,"data":{"valid":true,"issues":[]}}
```

### Convert formats

```bash
ontograph convert ./animals.omn --to functional
ontograph convert ./ontology.ofn --to turtle --out ./ontology.ttl
```

Supported write targets: `functional`, `turtle`.

---

## Bridge operations (VS Code + OntoGraph required)

Open VS Code with OntoGraph active and an ontology loaded. The extension automatically writes a discovery lock file. No configuration.

### Classify

```bash
ontograph classify
ontograph classify --timeout 120000   # 2-minute timeout for large ontologies
```

### Check consistency

```bash
ontograph check-consistency
```

### DL query

```bash
ontograph dl-query "Animal and hasHabitat some Ocean"
ontograph dl-query "ClinicalFinding and findingSite some (BodyStructure and partOf some Heart)"
```

---

## When no extension is running

Bridge commands return within 2 seconds:

```json
{"success":false,"errorCode":"BRIDGE_UNAVAILABLE","error":"OntoGraph extension not detected..."}
```

Exit code: `10`. Use this in scripts to branch on VS Code availability:

```bash
ontograph classify
if [ $? -eq 10 ]; then
  echo "VS Code not running — skipping classification"
fi
```

---

## Using in Claude Code / AI tool workflow

Claude Code reads `CLAUDE.md` at startup. With the CLI directive in place, it will use `ontograph` autonomously when working with OWL files.

Example session:
```
User: What classes are in this ontology?
Claude Code: [runs] ontograph parse ./ontology.ofn
             [reads] classCount: 9
             [runs] ontograph search ./ontology.ofn "" --limit 20
             [reports] Found 9 classes: Animal, Dog, Cat, ...
```

---

## Monorepo / CI setup

```bash
# Install CLI as project dev dependency (not global)
pnpm add -D @ysgao/ontograph-cli

# Run via pnpm exec
pnpm exec ontograph parse ./ontology.ofn

# In package.json scripts
"validate-ontology": "ontograph validate ./ontologies/main.ofn"
```

The VSIX extension build is unaffected — CLI package is excluded from VSIX artifacts.

---

## Full command reference

```
ontograph [options] [command]

Options:
  --timeout <ms>   Override timeout (default: 30000ms bridge, 5000ms core)
  --version        Print version
  --help           Print help

Commands:
  parse <file>                         Parse OWL file → structural summary
  search [options] <file> <query>      Search entities by label or IRI
  validate <file>                      Validate OWL structure
  convert [options] <file>             Convert to functional or turtle format
  classify                             Classify active ontology (bridge)
  check-consistency                    Check consistency (bridge)
  dl-query <expression>                Run DL query (bridge)
```
