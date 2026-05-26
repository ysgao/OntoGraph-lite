# Quickstart: Reload Ontology from Disk

## Auto-Reload After Git Pull

1. Open an OWL ontology file in VS Code — OntoGraph loads it automatically.
2. In a terminal, run `git pull` while VS Code is open.
3. Within ~1 second, the OntoGraph sidebar (Classes, Properties, Individuals) refreshes to reflect the pulled changes.
4. A status bar message "$(check) Ontology reloaded from disk" confirms the update.
5. The Inferred Hierarchy view is cleared — run **Classify Ontology** again if needed.

## Manual Reload

1. Click the **$(refresh) Reload Ontology** button in the Classes view toolbar (next to the Classify button).
2. A progress indicator appears while the ontology is re-parsed.
3. All sidebar views refresh on completion.

## Error Cases

- **File missing**: An error message appears. The previously loaded ontology remains in memory.
- **Parse error** (e.g., bad merge left syntax errors): An error message identifies the problem. The previously loaded ontology remains in memory and the Reload button re-enables.

## Notes

- Reload always reads the saved file on disk. Unsaved in-editor edits are not included (VS Code Source Control resolves those conflicts before the file is written).
- Reload discards any prior classification results. Re-run classification after reloading if needed.
