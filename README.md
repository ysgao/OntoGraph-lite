# OntoGraph-lite: OWL Ontology Editor lite version for VS Code

OntoGraph is a Protégé-like OWL 2 ontology editing, reasoning, and visualization extension for Visual Studio Code. It is designed to handle everything from small toy ontologies to SNOMED CT-scale knowledge bases.

![OntoGraph Icon](resources/icons/ontology.png)

## Key Features

- **Multi-format Support**: Parse and edit OWL Functional Syntax (`.ofn`), Manchester Syntax (`.omn`), OWL/XML (`.owl`), and Turtle (`.ttl`).
- **Integrated Reasoning**: Built-in support for **HermiT** (full OWL 2 DL) and **ELK** (high-performance EL reasoning).
- **Hierarchical Views**: Navigate your ontology through dedicated tree views for Classes, Object Properties, Data Properties, Annotation Properties, and Individuals.
- **Inferred Hierarchy**: View the results of classification side-by-side with your asserted hierarchy.
- **Entity Editor**: Edit axioms and annotations using a user-friendly interface with Manchester Syntax support.
- **Graph Visualization**: Explore entity relationships visually with interactive neighborhood graphs.
- **SPARQL Editor**: Execute SPARQL queries against your loaded ontology.
- **SNOMED CT Scale**: Optimized to handle large-scale ontologies with tens of thousands of classes.

## Language Support

OntoGraph provides rich language support for OWL files via the Language Server Protocol (LSP), including:
- **Auto-completion**: Intelligent suggestions for OWL keywords, entities, and IRIs.
- **Diagnostics**: Real-time syntax checking and error reporting for Manchester and Functional syntax.
- **Hover Information**: View entity details and labels by hovering over IRIs in the editor.
- **Go to Definition**: Jump directly to entity declarations.

## Installation

### Prerequisites

- **Antigravity** (IDE) [Link](https://antigravity.google/)   This IDE has better performance than Visual Studio Code for this project. 
- **Visual Studio Code** 1.90.0 or newer. [Link](https://code.visualstudio.com/) (Alternatively, you can use this IDE)
- **Java Runtime Environment (JRE) 11** or newer (required for the reasoning server).
- **Node.js 18** or newer.

### Installing from VSIX

1. Download the `ontograph-x.x.x.vsix` file from the releases page.
2. Open Antigravity or Visual Studio Code.
3. Go to the **Extensions** view (`Ctrl+Shift+X`).
4. Click the **...** (Views and More Actions) menu in the top-right corner of the Extensions sidebar.
5. Select **Install from VSIX...**.
6. Locate and select the downloaded `.vsix` file.

## Usage Guide

### Loading an Ontology

Simply open any supported OWL file in Antigravity or Visual Studio Code. OntoGraph will automatically detect the format, parse the content, and populate the sidebar views.

Supported extensions:
- `.ofn` (OWL Functional Syntax)
- `.omn` (Manchester Syntax)
- `.owl` / `.owx` (OWL/XML)
- `.ttl` / `.n3` (Turtle/N-Triples)

### Navigating and Searching

- Use the **OntoGraph Activity Bar** icon to access the ontology tree views.
- **Search**: Click the magnifying glass icon in the tree view title bar or use the `OntoGraph: Search Entity` command to find entities by name or label.
- **Selection**: Selecting an entity in the tree view will open its details in the **Entity Editor**.

### Reasoning and Classification

OntoGraph includes powerful reasoning capabilities to check consistency and compute inferred hierarchies.

1. Click the **Classify Ontology** (play icon) in the Class Hierarchy or Inferred Hierarchy view title bar.
2. The extension will invoke the appropriate reasoner (ELK for large EL ontologies, HermiT for full DL).
3. Once complete, the **Inferred Hierarchy** view will be updated with the computed subclass relationships.
4. **Consistency Check**: Use the `OntoGraph: Check Consistency` command to verify if your ontology is consistent.

### Editing Entities

- Click any entity in the tree views, the entity editor will open in the right panel.
- The editor provides a structured interface for managing annotations, class expressions, and property characteristics.
- Changes are synced back to your source file.

### Visualization

- Right-click an entity and select **Open Graph** to see its immediate neighborhood.
- The graph view allows you to toggle between asserted and inferred relationships and adjust the visualization depth.

### Exporting

- Use the `OntoGraph: Export Ontology As...` command to save your ontology in a different format (e.g., convert Manchester Syntax to OWL/XML).

## Configuration

You can customize OntoGraph's behavior in Antigravity or VS Code Settings (`ontograph.*`):

- `ontograph.reasoner.engine`: Choose between `hermit`, `elk`, or `auto` (default).
- `ontograph.reasoner.javaPath`: Specify a custom path to your Java executable.
- `ontograph.display.preferredLabelLanguage`: Set the language tag for `rdfs:label` display (e.g., `en`, `fr`).
- `ontograph.graph.defaultDepth`: Set the default neighborhood depth for the graph view.

## License

OntoGraph is licensed under the [Apache-2.0 License](LICENSE).
