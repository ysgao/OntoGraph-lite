package org.ihtsdo.ontoeditor;

import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.*;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.io.StringDocumentTarget;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.reasoner.InferenceType;
import org.semanticweb.owlapi.reasoner.OWLReasoner;

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

    // ---- public API ------------------------------------------------------------

    /**
     * Load an ontology from string content using a fresh manager.
     * @param content  The ontology serialization.
     * @param format   One of "functional", "manchester", "turtle", "rdf-xml", "owl-xml", or null for auto-detect.
     */
    @SuppressWarnings("null")
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
    @SuppressWarnings("null")
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
            List<List<String>> hierarchy = new ArrayList<>();

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
                    OWLClass parent = queue.poll();
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

    // ---- private helpers -------------------------------------------------------

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
