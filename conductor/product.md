# Product Definition: OntoGraph

## Initial Concept
OntoGraph is a Protégé-like OWL 2 ontology editing, reasoning, and visualization extension for Visual Studio Code and Antigravity. It is designed to handle everything from small toy ontologies to SNOMED CT-scale knowledge bases.

## Product Vision
To provide a lightweight yet powerful alternative to Protégé within the modern IDE environments of VS Code and Antigravity, enabling seamless ontology development alongside code.

## Target Users
- **Ontologists & Knowledge Engineers:** Developing and maintaining OWL ontologies.
- **Data Scientists:** Working with semantic data and knowledge graphs.
- **Software Developers:** Integrating ontologies into applications and needing local reasoning tools.

## Key Features
- **Multi-format Support:** Native support for OWL Functional Syntax, Manchester Syntax, OWL/XML, and Turtle.
- **Integrated Reasoning:** Side-by-side Asserted vs. Inferred hierarchies using HermiT and ELK.
- **Structured Editing:** User-friendly Entity Editor for annotations and axioms with Manchester syntax support.
- **Visualization:** Interactive neighborhood graphs to explore complex entity relationships.
- **SPARQL Support:** Built-in editor for querying ontologies.
- **High Performance:** Optimized for large-scale ontologies (e.g., SNOMED CT) using worker threads and high-efficiency reasoners.

## Success Criteria
- Seamless performance with ontologies > 50,000 classes.
- High accuracy in reasoning results compared to standard Protégé output.
- Low barrier to entry for users familiar with Protégé.
