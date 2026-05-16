package org.ihtsdo.ontoeditor;

import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.expression.OWLEntityChecker;
import org.semanticweb.owlapi.expression.ShortFormEntityChecker;
import org.semanticweb.owlapi.formats.*;
import org.semanticweb.owlapi.io.FileDocumentSource;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.io.StringDocumentTarget;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.model.OWLOntologySetProvider;
import org.semanticweb.owlapi.reasoner.InferenceType;
import org.semanticweb.owlapi.reasoner.OWLReasoner;
import org.semanticweb.owlapi.util.AnnotationValueShortFormProvider;
import org.semanticweb.owlapi.util.BidirectionalShortFormProviderAdapter;
import org.semanticweb.owlapi.util.SimpleShortFormProvider;
import org.semanticweb.owlapi.util.mansyntax.ManchesterOWLSyntaxParser;

import java.io.File;
import java.util.*;

/**
 * Wraps OWLAPI 5 for ontology loading, reasoning, and format conversion.
 * Creates a fresh OWLOntologyManager per operation to avoid state contamination.
 */
public class OntologyService {

    // ---- public result types ---------------------------------------------------

    public static class ClassificationResult {
        public final boolean consistent;
        public final List<String> incoherentClasses;
        /** Each element is a two-element list [parentIri, childIri] */
        public final List<List<String>> hierarchy;

        ClassificationResult(boolean consistent,
                             List<String> incoherentClasses,
                             List<List<String>> hierarchy) {
            this.consistent = consistent;
            this.incoherentClasses = incoherentClasses;
            this.hierarchy = hierarchy;
        }
    }

    public static class ConsistencyResult {
        public final boolean consistent;
        public final List<String> explanation;

        ConsistencyResult(boolean consistent, List<String> explanation) {
            this.consistent = consistent;
            this.explanation = explanation;
        }
    }

    public static class DLQueryResult {
        public final List<String> directSuperClasses;
        public final List<String> superClasses;
        public final List<String> equivalentClasses;
        public final List<String> directSubClasses;
        public final List<String> subClasses;
        public final List<String> instances;

        DLQueryResult(List<String> directSuperClasses, List<String> superClasses,
                      List<String> equivalentClasses, List<String> directSubClasses,
                      List<String> subClasses, List<String> instances) {
            this.directSuperClasses = directSuperClasses;
            this.superClasses = superClasses;
            this.equivalentClasses = equivalentClasses;
            this.directSubClasses = directSubClasses;
            this.subClasses = subClasses;
            this.instances = instances;
        }
    }

    // ---- public API ------------------------------------------------------------

    /**
     * Load an ontology from a file path using a fresh manager.
     * Avoids the cost of JSON-encoding/decoding the file content over the IPC pipe.
     */
    public OWLOntology loadFromFile(String filePath, String format) throws OWLOntologyCreationException {
        OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
        File file = new File(filePath);
        OWLDocumentFormat docFormat = mapFormat(format);
        if (docFormat == null) {
            return manager.loadOntologyFromOntologyDocument(Objects.requireNonNull(IRI.create(Objects.requireNonNull(file.toURI()))));
        }
        return manager.loadOntologyFromOntologyDocument(
            new FileDocumentSource(file, docFormat, null));
    }

    /**
     * Load an ontology from string content using a fresh manager.
     * @param content  The ontology serialization.
     * @param format   One of "functional", "manchester", "turtle", "rdf-xml", "owl-xml", or null for auto-detect.
     */
    public OWLOntology loadFromString(String content, String format) throws OWLOntologyCreationException {
        Objects.requireNonNull(content, "content");
        OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
        OWLDocumentFormat docFormat = mapFormat(format);
        StringDocumentSource source;
        if (docFormat == null) {
            // Auto-detect: OWLAPI sniffs format from content
            source = new StringDocumentSource(content);
        } else {
            source = new StringDocumentSource(
                content,
                Objects.requireNonNull(IRI.create("urn:onto-editor:input")),
                docFormat,
                null
            );
        }
        return manager.loadOntologyFromOntologyDocument(source);
    }

    /**
     * Classify the ontology: precompute hierarchy, detect incoherent classes.
     */
    public ClassificationResult classify(OWLOntology ontology, String engine, int contentLength)
            throws Exception {
        boolean useElk = shouldUseElk(engine, contentLength);
        OWLReasoner reasoner = useElk
            ? ElkAdapter.createReasoner(ontology)
            : HermiTAdapter.createReasoner(ontology);
        try {
            reasoner.precomputeInferences(
                InferenceType.CLASS_HIERARCHY,
                InferenceType.CLASS_ASSERTIONS
            );

            boolean consistent = reasoner.isConsistent();
            List<String> incoherent = new ArrayList<>();
            List<List<String>> hierarchy = new ArrayList<>(ontology.getClassesInSignature().size());

            if (consistent) {
                OWLDataFactory df = ontology.getOWLOntologyManager().getOWLDataFactory();
                OWLClass owlThing = df.getOWLThing();
                @SuppressWarnings("unused")
                OWLClass owlNothing = df.getOWLNothing(); // reserved for DL inconsistency reporting

                // Find incoherent (unsatisfiable) named classes
                Set<OWLClass> unsatisfiable = reasoner.getUnsatisfiableClasses().getEntities();
                for (OWLClass cls : unsatisfiable) {
                    if (!cls.isOWLNothing()) {
                        incoherent.add(cls.getIRI().toString());
                    }
                }

                // BFS from owl:Thing to collect all direct subclass edges
                Queue<OWLClass> queue = new ArrayDeque<>();
                Set<OWLClass> visited = new HashSet<>();
                queue.add(owlThing);
                visited.add(owlThing);

                while (!queue.isEmpty()) {
                    OWLClass parent = Objects.requireNonNull(queue.poll());
                    Set<OWLClass> children = reasoner.getSubClasses(parent, true).getFlattened();
                    for (OWLClass child : children) {
                        if (child.isOWLNothing()) continue;
                        List<String> edge = Arrays.asList(
                            parent.getIRI().toString(),
                            child.getIRI().toString()
                        );
                        hierarchy.add(edge);
                        if (!visited.contains(child)) {
                            visited.add(child);
                            queue.add(child);
                        }
                    }
                }
            }

            return new ClassificationResult(consistent, incoherent, hierarchy);
        } finally {
            reasoner.dispose();
        }
    }

    /**
     * Check ontology consistency.
     */
    public ConsistencyResult checkConsistency(OWLOntology ontology, String engine, int contentLength)
            throws Exception {
        boolean useElk = shouldUseElk(engine, contentLength);
        OWLReasoner reasoner = useElk
            ? ElkAdapter.createReasoner(ontology)
            : HermiTAdapter.createReasoner(ontology);
        try {
            boolean consistent = reasoner.isConsistent();
            if (consistent) {
                return new ConsistencyResult(true, Collections.emptyList());
            }
            // Inconsistent — return empty explanation list (Phase 6 feature)
            return new ConsistencyResult(false, Collections.emptyList());
        } finally {
            reasoner.dispose();
        }
    }

    /**
     * Convert ontology from one serialization format to another.
     */
    public String convertFormat(String content, String fromFormat, String toFormat)
            throws Exception {
        OWLOntology ontology = loadFromString(content, fromFormat);
        OWLDocumentFormat targetDocFormat = mapFormat(toFormat);
        if (targetDocFormat == null) {
            throw new IllegalArgumentException("Unknown target format: " + toFormat);
        }
        StringDocumentTarget target = new StringDocumentTarget();
        ontology.getOWLOntologyManager().saveOntology(ontology, targetDocFormat, target);
        return target.toString();
    }

    /**
     * Execute a DL query: evaluate a Manchester Syntax class expression against the ontology
     * and return entities matching the requested relationship types.
     *
     * @param ontology      Loaded ontology (use loadFromFile or loadFromString first).
     * @param classExpression Manchester Syntax class expression, e.g. "Animal and hasLegs some xsd:integer".
     * @param queryTypes    Subset of: directSuperClasses, superClasses, equivalentClasses,
     *                      directSubClasses, subClasses, instances.
     * @param engine        "auto", "elk", or "hermit".
     * @param contentLength Used for auto engine selection (proxy for ontology size).
     */
    @SuppressWarnings("null")
    public DLQueryResult dlQuery(OWLOntology ontology, String classExpression,
                                  List<String> queryTypes, String engine, int contentLength)
            throws Exception {
        OWLClassExpression expr = parseManchesterExpression(classExpression, ontology);

        OWLOntologyManager manager = ontology.getOWLOntologyManager();
        OWLDataFactory df = manager.getOWLDataFactory();

        IRI tempIri = IRI.create("urn:ontograph:dlquery#TempQuery");
        OWLClass tempClass = df.getOWLClass(tempIri);
        manager.addAxiom(ontology, df.getOWLDeclarationAxiom(tempClass));
        manager.addAxiom(ontology, df.getOWLEquivalentClassesAxiom(tempClass, expr));

        boolean useElk = shouldUseElk(engine, contentLength);
        OWLReasoner reasoner = useElk
            ? ElkAdapter.createReasoner(ontology)
            : HermiTAdapter.createReasoner(ontology);
        try {
            reasoner.precomputeInferences(InferenceType.CLASS_HIERARCHY, InferenceType.CLASS_ASSERTIONS);

            List<String> directSuperClasses = new ArrayList<>();
            List<String> superClasses       = new ArrayList<>();
            List<String> equivalentClasses  = new ArrayList<>();
            List<String> directSubClasses   = new ArrayList<>();
            List<String> subClasses         = new ArrayList<>();
            List<String> instances          = new ArrayList<>();

            for (String qt : queryTypes) {
                switch (qt) {
                    case "directSuperClasses":
                        for (OWLClass c : reasoner.getSuperClasses(tempClass, true).getFlattened())
                            directSuperClasses.add(c.getIRI().toString());
                        break;
                    case "superClasses":
                        for (OWLClass c : reasoner.getSuperClasses(tempClass, false).getFlattened())
                            superClasses.add(c.getIRI().toString());
                        break;
                    case "equivalentClasses":
                        for (OWLClass c : reasoner.getEquivalentClasses(tempClass).getEntities()) {
                            if (!tempIri.equals(c.getIRI()))
                                equivalentClasses.add(c.getIRI().toString());
                        }
                        break;
                    case "directSubClasses":
                        for (OWLClass c : reasoner.getSubClasses(tempClass, true).getFlattened())
                            directSubClasses.add(c.getIRI().toString());
                        break;
                    case "subClasses":
                        for (OWLClass c : reasoner.getSubClasses(tempClass, false).getFlattened())
                            subClasses.add(c.getIRI().toString());
                        break;
                    case "instances":
                        for (OWLNamedIndividual i : reasoner.getInstances(tempClass, false).getFlattened())
                            instances.add(i.getIRI().toString());
                        break;
                    default:
                        break;
                }
            }

            return new DLQueryResult(directSuperClasses, superClasses, equivalentClasses,
                                     directSubClasses, subClasses, instances);
        } finally {
            reasoner.dispose();
        }
    }

    // ---- private helpers -------------------------------------------------------

    @SuppressWarnings("null")
    private static OWLClassExpression parseManchesterExpression(String expression, OWLOntology ontology) {
        OWLOntologyManager manager = ontology.getOWLOntologyManager();
        OWLDataFactory df = manager.getOWLDataFactory();
        Set<OWLOntology> ontologies = ontology.getImportsClosure();

        // Label-based checker: resolves 'quoted rdfs:label names' like 'Body structure'
        OWLOntologySetProvider setProvider = ontologies::stream;
        List<OWLAnnotationProperty> labelProps = Collections.singletonList(df.getRDFSLabel());
        AnnotationValueShortFormProvider labelSfp = new AnnotationValueShortFormProvider(
            labelProps, Collections.emptyMap(), setProvider);
        BidirectionalShortFormProviderAdapter labelBsf = new BidirectionalShortFormProviderAdapter(
            manager, ontologies, labelSfp);
        ShortFormEntityChecker labelChecker = new ShortFormEntityChecker(labelBsf);

        // Local-name checker: resolves unquoted names like Mammal, hasHabitat
        BidirectionalShortFormProviderAdapter localBsf = new BidirectionalShortFormProviderAdapter(
            manager, ontologies, new SimpleShortFormProvider());
        ShortFormEntityChecker localChecker = new ShortFormEntityChecker(localBsf);

        // Combined: try label first, fall back to local name
        OWLEntityChecker checker = new OWLEntityChecker() {
            @Override public OWLClass getOWLClass(String n) {
                OWLClass c = labelChecker.getOWLClass(n);
                return c != null ? c : localChecker.getOWLClass(n);
            }
            @Override public OWLObjectProperty getOWLObjectProperty(String n) {
                OWLObjectProperty p = labelChecker.getOWLObjectProperty(n);
                return p != null ? p : localChecker.getOWLObjectProperty(n);
            }
            @Override public OWLDataProperty getOWLDataProperty(String n) {
                OWLDataProperty p = labelChecker.getOWLDataProperty(n);
                return p != null ? p : localChecker.getOWLDataProperty(n);
            }
            @Override public OWLAnnotationProperty getOWLAnnotationProperty(String n) {
                OWLAnnotationProperty p = labelChecker.getOWLAnnotationProperty(n);
                return p != null ? p : localChecker.getOWLAnnotationProperty(n);
            }
            @Override public OWLDatatype getOWLDatatype(String n) {
                OWLDatatype t = labelChecker.getOWLDatatype(n);
                return t != null ? t : localChecker.getOWLDatatype(n);
            }
            @Override public OWLNamedIndividual getOWLIndividual(String n) {
                OWLNamedIndividual i = labelChecker.getOWLIndividual(n);
                return i != null ? i : localChecker.getOWLIndividual(n);
            }
        };

        ManchesterOWLSyntaxParser parser = OWLManager.createManchesterParser();
        parser.setDefaultOntology(ontology);
        parser.setOWLEntityChecker(checker);
        parser.setStringToParse(expression);
        return parser.parseClassExpression();
    }

    private static boolean shouldUseElk(String engine, int contentLength) {
        if ("elk".equalsIgnoreCase(engine)) return true;
        if ("hermit".equalsIgnoreCase(engine)) return false;
        // auto: use ELK for very large functional-syntax ontologies
        return contentLength > 2_000_000;
    }

    /**
     * Map format string to OWLAPI OWLDocumentFormat. Returns null for auto-detect.
     * Supported values: "functional", "manchester", "turtle", "rdf-xml", "owl-xml".
     */
    static OWLDocumentFormat mapFormat(String format) {
        if (format == null) return null;
        switch (format.toLowerCase(Locale.ROOT)) {
            case "functional":  return new FunctionalSyntaxDocumentFormat();
            case "manchester":  return new ManchesterSyntaxDocumentFormat();
            case "turtle":      return new TurtleDocumentFormat();
            case "rdf-xml":     return new RDFXMLDocumentFormat();
            case "owl-xml":     return new OWLXMLDocumentFormat();
            default:            return null; // auto-detect
        }
    }
}
