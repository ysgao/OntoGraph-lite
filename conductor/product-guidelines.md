# Product Guidelines: OntoGraph

## Design Philosophy
OntoGraph aims for a "Protégé-familiar" experience translated into the modern, streamlined interface of VS Code and Antigravity. It prioritizes clarity, data integrity, and performance.

## User Experience (UX) Principles
- **Direct Manipulation:** Actions performed in the sidebar or editor should immediately and predictably reflect in the underlying OWL source file.
- **Progressive Disclosure:** Hide complex reasoning settings or advanced axiom types until needed, but keep them accessible.
- **Responsiveness:** Ensure the UI remains responsive even during heavy parsing or reasoning tasks by using worker threads and asynchronous processing.
- **Informative Feedback:** Provide clear, actionable feedback for syntax errors or inconsistent ontologies.

## Visual & Interaction Style
- **IDE Integration:** Use theme-aware colors and standard VS Code/Antigravity UI components (trees, webviews, status bars) to feel like a native part of the environment.
- **Manchester Syntax First:** Use Manchester Syntax as the primary human-readable representation for axioms and expressions in the UI.
- **Contextual Actions:** Provide relevant commands via right-click menus and view title bar buttons to minimize menu diving.

## Technical Standards
- **Precision:** Maintain strict adherence to OWL 2 specifications. Avoid transformations that lose semantic meaning.
- **Scale-Awareness:** Always consider the performance implications of features on large ontologies (e.g., SNOMED CT).
- **Interoperability:** Ensure exported files are compatible with standard ontology tools like Protégé. This includes maintaining the mandatory entity cluster ordering defined in the Constitution.
