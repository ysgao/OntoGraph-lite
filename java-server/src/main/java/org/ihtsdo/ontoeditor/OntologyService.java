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
import org.semanticweb.owlapi.model.RemoveAxiom;
import org.semanticweb.owlapi.reasoner.InferenceType;
import org.semanticweb.owlapi.reasoner.OWLReasoner;
import org.semanticweb.owlapi.util.AnnotationValueShortFormProvider;
import org.semanticweb.owlapi.util.BidirectionalShortFormProviderAdapter;
import org.semanticweb.owlapi.util.SimpleShortFormProvider;
import org.semanticweb.owlapi.util.mansyntax.ManchesterOWLSyntaxParser;

import javax.annotation.Nonnull;
import java.io.File;
import java.util.*;

/**
 * Wraps OWLAPI 5 for ontology loading, reasoning, and format conversion.
 *
 * Caches the last classified ontology+reasoner by cache key (filePath@mtime) so
 * repeated classify calls and subsequent DL queries skip load+precompute entirely.
 * Content-based requests (no file path) are never cached.
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

    public static class ValidationResult {
        public final boolean valid;
        public final String error;

        ValidationResult(boolean valid, String error) {
            this.valid = valid;
            this.error = error;
        }
    }

    // ---- reasoner cache --------------------------------------------------------
    // Key = filePath + "@" + lastModified. File edits change mtime → cache miss →
    // full reload+reclassify. Content-based requests (no filePath) use null key (never cached).

    private String cachedKey;
    private OWLOntology cachedOntology;
    private OWLReasoner cachedReasoner;
    private ClassificationResult cachedClassification;

    /** True when both ontology and reasoner are cached (full classify cache hit). */
    boolean isCached(String key) {
        return key != null && key.equals(this.cachedKey) && this.cachedReasoner != null;
    }

    /** True when the parsed ontology is cached — even if the reasoner is not yet stored. */
    private boolean isOntologyCached(String key) {
        return key != null && key.equals(this.cachedKey) && this.cachedOntology != null;
    }

    private void evictCache() {
        if (this.cachedReasoner != null) {
            try { this.cachedReasoner.dispose(); } catch (Exception ignored) {}
            this.cachedReasoner = null;
        }
        this.cachedOntology = null;
        this.cachedKey = null;
        this.cachedClassification = null;
    }

    // ---- public API ------------------------------------------------------------

    public OWLOntology loadFromFile(String filePath, String format) throws OWLOntologyCreationException {
        OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
        File file = new File(filePath);
        OWLDocumentFormat docFormat = mapFormat(format);
        if (docFormat == null) {
            return manager.loadOntologyFromOntologyDocument(
                Objects.requireNonNull(IRI.create(Objects.requireNonNull(file.toURI()))));
        }
        return manager.loadOntologyFromOntologyDocument(
            new FileDocumentSource(file, docFormat, null));
    }

    public OWLOntology loadFromString(String content, String format) throws OWLOntologyCreationException {
        Objects.requireNonNull(content, "content");
        OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
        OWLDocumentFormat docFormat = mapFormat(format);
        StringDocumentSource source;
        if (docFormat == null) {
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
     *
     * @param ontology  Loaded ontology. May be null only when isCached(cacheKey) is true.
     * @param cacheKey  filePath + "@" + lastModified, or null (no caching, always disposes reasoner).
     */
    public ClassificationResult classify(OWLOntology ontology, String engine,
                                         int contentLength, String cacheKey) throws Exception {
        // Full cache hit: skip load, skip precompute, skip BFS traversal
        if (isCached(cacheKey) && cachedClassification != null) {
            System.err.println("[timing] classify: cache HIT");
            return cachedClassification;
        }

        OWLReasoner reasoner;
        OWLOntology work;

        if (isCached(cacheKey)) {
            // Reasoner cached but classification result missing — re-traverse only
            reasoner = cachedReasoner;
            work = cachedOntology;
        } else {
            evictCache();
            work = Objects.requireNonNull(ontology, "ontology required on cache miss");
            boolean useElk = shouldUseElk(engine, contentLength);
            long t0 = System.currentTimeMillis();
            reasoner = useElk ? ElkAdapter.createReasoner(work) : HermiTAdapter.createReasoner(work);
            System.err.println("[timing] reasoner-init=" + (System.currentTimeMillis() - t0)
                    + "ms  cpus=" + Runtime.getRuntime().availableProcessors());
            try {
                long t1 = System.currentTimeMillis();
                reasoner.precomputeInferences(InferenceType.CLASS_HIERARCHY);
                System.err.println("[timing] precompute=" + (System.currentTimeMillis() - t1) + "ms");
            } catch (Exception e) {
                reasoner.dispose();
                throw e;
            }
        }

        // Build result outside any cache-write: if this throws, reasoner is disposed and
        // no partial cache entry is left (cachedReasoner without cachedClassification).
        ClassificationResult result;
        try {
            result = buildClassificationResult(work, reasoner);
        } catch (Exception e) {
            reasoner.dispose();
            throw e;
        }

        if (cacheKey != null) {
            cachedKey = cacheKey;
            cachedOntology = work;
            cachedReasoner = reasoner;
            cachedClassification = result;
        } else {
            reasoner.dispose();
        }
        return result;
    }

    /**
     * Check ontology consistency. Reuses cached reasoner when available.
     *
     * @param ontology  May be null when isCached(cacheKey) is true.
     * @param cacheKey  filePath + "@" + lastModified, or null.
     */
    public ConsistencyResult checkConsistency(OWLOntology ontology, String engine,
                                              int contentLength, String cacheKey) throws Exception {
        boolean fromCache = isCached(cacheKey);
        OWLReasoner reasoner;

        if (fromCache) {
            reasoner = cachedReasoner;
        } else {
            evictCache();
            OWLOntology work = Objects.requireNonNull(ontology, "ontology required on cache miss");
            boolean useElk = shouldUseElk(engine, contentLength);
            reasoner = useElk ? ElkAdapter.createReasoner(work) : HermiTAdapter.createReasoner(work);
            // Cache only after isConsistent() succeeds to avoid storing a broken reasoner.
            // isConsistent() call and cache population happen below.
            final OWLOntology finalWork = work;
            boolean consistent;
            try {
                consistent = reasoner.isConsistent();
            } catch (Exception e) {
                reasoner.dispose();
                throw e;
            }
            if (cacheKey != null) {
                cachedKey = cacheKey;
                cachedOntology = finalWork;
                cachedReasoner = reasoner;
            } else {
                reasoner.dispose();
            }
            if (consistent) return new ConsistencyResult(true, Collections.emptyList());
            return new ConsistencyResult(false, Collections.emptyList());
        }

        // fromCache path — reasoner already verified; no dispose needed
        boolean consistent = reasoner.isConsistent();
        if (consistent) return new ConsistencyResult(true, Collections.emptyList());
        return new ConsistencyResult(false, Collections.emptyList());
    }

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
     * Execute a DL query against the ontology.
     *
     * On cache hit, reuses the pre-classified ELK reasoner: adds the temp class axioms,
     * triggers incremental classification (~200ms), queries, then removes the axioms.
     * On cache miss, classifies from scratch and caches.
     *
     * @param ontology  May be null when isCached(cacheKey) is true.
     * @param cacheKey  filePath + "@" + lastModified, or null.
     */
    /**
     * Execute a DL query against the ontology.
     *
     * Temp axioms are added to the ontology BEFORE creating the ELK reasoner so that
     * ELK classifies the temp class during initial load rather than via incremental mode.
     * ELK incremental classification does not reliably handle complex EquivalentClasses
     * expressions (e.g. SNOMED role-group patterns), so we always use a fresh reasoner here.
     *
     * If classify was previously run on the same file (cache hit), the cached ontology is
     * reused to skip the 13s parse. The classify reasoner cache is unaffected.
     *
     * @param ontology  Freshly loaded ontology from ReasonerServer. May be null when
     *                  isOntologyCached(cacheKey) is true.
     * @param cacheKey  filePath + "@" + lastModified, or null.
     */
    @SuppressWarnings("null")
    public DLQueryResult dlQuery(OWLOntology ontology, String classExpression,
                                 List<String> queryTypes, String engine,
                                 int contentLength, String cacheKey) throws Exception {
        // Reuse the cached ontology to skip the 13s parse phase if available.
        // The classify reasoner cache is preserved — we only read cachedOntology here.
        OWLOntology work;
        if (isOntologyCached(cacheKey)) {
            work = cachedOntology;
            System.err.println("[timing] dlQuery: using cached ontology (load skipped)");
        } else {
            work = Objects.requireNonNull(ontology, "ontology required on cache miss");
        }

        OWLOntologyManager manager = work.getOWLOntologyManager();
        OWLDataFactory df = manager.getOWLDataFactory();
        OWLClassExpression expr = isFunctionalSyntaxExpression(classExpression)
            ? parseFunctionalClassExpression(classExpression)
            : parseManchesterExpression(classExpression, work);

        // Add temp axioms BEFORE creating the reasoner so ELK classifies them from scratch.
        IRI tempIri = IRI.create("urn:ontograph:dlquery#TempQuery");
        OWLClass tempClass = df.getOWLClass(tempIri);
        OWLAxiom declAxiom = df.getOWLDeclarationAxiom(tempClass);
        OWLAxiom eqAxiom = df.getOWLEquivalentClassesAxiom(tempClass, expr);
        manager.addAxiom(work, declAxiom);
        manager.addAxiom(work, eqAxiom);
        // Pre-allocate undo changes before the try block so the finally cleanup does not
        // allocate on a potentially heap-exhausted JVM (OOM in precomputeInferences).
        RemoveAxiom removeDecl = new RemoveAxiom(work, declAxiom);
        RemoveAxiom removeEq   = new RemoveAxiom(work, eqAxiom);

        boolean useElk = shouldUseElk(engine, contentLength);
        OWLReasoner freshReasoner = useElk ? ElkAdapter.createReasoner(work) : HermiTAdapter.createReasoner(work);
        try {
            long t0 = System.currentTimeMillis();
            if (queryTypes.contains("instances")) {
                freshReasoner.precomputeInferences(InferenceType.CLASS_HIERARCHY, InferenceType.CLASS_ASSERTIONS);
            } else {
                freshReasoner.precomputeInferences(InferenceType.CLASS_HIERARCHY);
            }
            System.err.println("[timing] dlQuery precompute=" + (System.currentTimeMillis() - t0) + "ms");

            List<String> directSuperClasses = new ArrayList<>();
            List<String> superClasses       = new ArrayList<>();
            List<String> equivalentClasses  = new ArrayList<>();
            List<String> directSubClasses   = new ArrayList<>();
            List<String> subClasses         = new ArrayList<>();
            List<String> instances          = new ArrayList<>();

            for (String qt : queryTypes) {
                switch (qt) {
                    case "directSuperClasses":
                        for (OWLClass c : freshReasoner.getSuperClasses(tempClass, true).getFlattened())
                            directSuperClasses.add(c.getIRI().toString());
                        break;
                    case "superClasses":
                        for (OWLClass c : freshReasoner.getSuperClasses(tempClass, false).getFlattened())
                            superClasses.add(c.getIRI().toString());
                        break;
                    case "equivalentClasses":
                        for (OWLClass c : freshReasoner.getEquivalentClasses(tempClass).getEntities()) {
                            if (!tempIri.equals(c.getIRI()))
                                equivalentClasses.add(c.getIRI().toString());
                        }
                        break;
                    case "directSubClasses":
                        for (OWLClass c : freshReasoner.getSubClasses(tempClass, true).getFlattened())
                            directSubClasses.add(c.getIRI().toString());
                        break;
                    case "subClasses":
                        for (OWLClass c : freshReasoner.getSubClasses(tempClass, false).getFlattened())
                            subClasses.add(c.getIRI().toString());
                        break;
                    case "instances":
                        for (OWLNamedIndividual i : freshReasoner.getInstances(tempClass, false).getFlattened())
                            instances.add(i.getIRI().toString());
                        break;
                    default:
                        break;
                }
            }

            return new DLQueryResult(directSuperClasses, superClasses, equivalentClasses,
                                     directSubClasses, subClasses, instances);
        } finally {
            freshReasoner.dispose();
            // Remove temp axioms to restore the cached ontology to its original state.
            // Uses pre-allocated objects; wrapped in catch(Throwable) so a secondary OOM
            // in applyChange is logged rather than suppressing the original exception.
            try {
                manager.applyChange(removeDecl);
                manager.applyChange(removeEq);
            } catch (Throwable t) {
                System.err.println("[warn] dlQuery: temp axiom removal failed: " + t.getMessage());
            }
        }
    }

    public ValidationResult validateClassExpression(@Nonnull String expression) {
        OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
        OWLDataFactory df = manager.getOWLDataFactory();

        OWLEntityChecker permissiveChecker = new OWLEntityChecker() {
            @Override public OWLClass getOWLClass(@Nonnull String n) {
                return df.getOWLClass(Objects.requireNonNull(IRI.create("urn:validate:" + n)));
            }
            @Override public OWLObjectProperty getOWLObjectProperty(@Nonnull String n) {
                return df.getOWLObjectProperty(Objects.requireNonNull(IRI.create("urn:validate:" + n)));
            }
            @Override public OWLDataProperty getOWLDataProperty(@Nonnull String n) {
                return df.getOWLDataProperty(Objects.requireNonNull(IRI.create("urn:validate:" + n)));
            }
            @Override public OWLAnnotationProperty getOWLAnnotationProperty(@Nonnull String n) {
                return df.getOWLAnnotationProperty(Objects.requireNonNull(IRI.create("urn:validate:" + n)));
            }
            @Override public OWLDatatype getOWLDatatype(@Nonnull String n) {
                return df.getOWLDatatype(Objects.requireNonNull(IRI.create("urn:validate:" + n)));
            }
            @Override public OWLNamedIndividual getOWLIndividual(@Nonnull String n) {
                return df.getOWLNamedIndividual(Objects.requireNonNull(IRI.create("urn:validate:" + n)));
            }
        };

        ManchesterOWLSyntaxParser parser = OWLManager.createManchesterParser();
        parser.setOWLEntityChecker(permissiveChecker);
        parser.setStringToParse(expression);

        try {
            parser.parseClassExpression();
            return new ValidationResult(true, null);
        } catch (Exception e) {
            String msg = e.getMessage();
            return new ValidationResult(false, msg != null ? msg : e.getClass().getSimpleName());
        }
    }

    // ---- private helpers -------------------------------------------------------

    private ClassificationResult buildClassificationResult(OWLOntology ontology, OWLReasoner reasoner) {
        boolean consistent = reasoner.isConsistent();
        List<String> incoherent = new ArrayList<>();
        List<List<String>> hierarchy = new ArrayList<>(ontology.getClassesInSignature().size());

        if (consistent) {
            OWLDataFactory df = ontology.getOWLOntologyManager().getOWLDataFactory();
            OWLClass owlThing = df.getOWLThing();

            Set<OWLClass> unsatisfiable = reasoner.getUnsatisfiableClasses().getEntities();
            for (OWLClass cls : unsatisfiable) {
                if (!cls.isOWLNothing()) incoherent.add(cls.getIRI().toString());
            }

            Queue<OWLClass> queue = new ArrayDeque<>();
            Set<OWLClass> visited = new HashSet<>();
            queue.add(owlThing);
            visited.add(owlThing);

            while (!queue.isEmpty()) {
                OWLClass parent = Objects.requireNonNull(queue.poll());
                Set<OWLClass> children = reasoner.getSubClasses(parent, true).getFlattened();
                for (OWLClass child : children) {
                    if (child.isOWLNothing()) continue;
                    hierarchy.add(Arrays.asList(parent.getIRI().toString(), child.getIRI().toString()));
                    if (!visited.contains(child)) {
                        visited.add(child);
                        queue.add(child);
                    }
                }
            }
        }

        return new ClassificationResult(consistent, incoherent, hierarchy);
    }

    private static boolean isFunctionalSyntaxExpression(String expr) {
        String t = expr.trim();
        return t.startsWith("Object") || t.startsWith("Data") || t.startsWith("<");
    }

    @SuppressWarnings("null")
    private static OWLClassExpression parseFunctionalClassExpression(String expr)
            throws OWLOntologyCreationException {
        IRI tIri = IRI.create("urn:ontograph:tmp#T");
        String mini = "Prefix(:=<urn:ontograph:tmp#>)\nOntology(<urn:ontograph:tmp>\n"
                + "EquivalentClasses(<urn:ontograph:tmp#T> " + expr + ")\n)";
        StringDocumentSource src = new StringDocumentSource(
                mini, IRI.create("urn:ontograph:tmp"),
                new FunctionalSyntaxDocumentFormat(), null);
        OWLOntology tmp = OWLManager.createOWLOntologyManager()
                .loadOntologyFromOntologyDocument(src);
        return tmp.getAxioms(AxiomType.EQUIVALENT_CLASSES).stream()
                .flatMap(ax -> ax.getClassExpressions().stream())
                .filter(ce -> ce.isAnonymous() || !((OWLClass) ce).getIRI().equals(tIri))
                .findFirst()
                .orElseThrow(() -> new RuntimeException(
                        "Cannot parse functional class expression: " + expr));
    }

    @SuppressWarnings("null")
    private static OWLClassExpression parseManchesterExpression(String expression, OWLOntology ontology) {
        OWLOntologyManager manager = ontology.getOWLOntologyManager();
        OWLDataFactory df = manager.getOWLDataFactory();
        Set<OWLOntology> ontologies = ontology.getImportsClosure();

        OWLOntologySetProvider setProvider = ontologies::stream;
        List<OWLAnnotationProperty> labelProps = Collections.singletonList(df.getRDFSLabel());
        AnnotationValueShortFormProvider labelSfp = new AnnotationValueShortFormProvider(
            labelProps, Collections.emptyMap(), setProvider);
        BidirectionalShortFormProviderAdapter labelBsf = new BidirectionalShortFormProviderAdapter(
            manager, ontologies, labelSfp);
        ShortFormEntityChecker labelChecker = new ShortFormEntityChecker(labelBsf);

        BidirectionalShortFormProviderAdapter localBsf = new BidirectionalShortFormProviderAdapter(
            manager, ontologies, new SimpleShortFormProvider());
        ShortFormEntityChecker localChecker = new ShortFormEntityChecker(localBsf);

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
        return contentLength > 2_000_000;
    }

    static OWLDocumentFormat mapFormat(String format) {
        if (format == null) return null;
        switch (format.toLowerCase(Locale.ROOT)) {
            case "functional":  return new FunctionalSyntaxDocumentFormat();
            case "manchester":  return new ManchesterSyntaxDocumentFormat();
            case "turtle":      return new TurtleDocumentFormat();
            case "rdf-xml":     return new RDFXMLDocumentFormat();
            case "owl-xml":     return new OWLXMLDocumentFormat();
            default:            return null;
        }
    }
}
