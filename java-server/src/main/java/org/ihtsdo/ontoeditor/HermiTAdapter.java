package org.ihtsdo.ontoeditor;

import org.semanticweb.HermiT.Configuration;
import org.semanticweb.HermiT.ReasonerFactory;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.reasoner.OWLReasoner;
import org.semanticweb.owlapi.reasoner.OWLReasonerFactory;

/**
 * Thin wrapper around HermiT 1.4.5 for OWLAPI 5.
 */
public class HermiTAdapter {

    /**
     * Create a HermiT reasoner for the given ontology.
     * Uses a silent Configuration to avoid spurious console output.
     */
    public static OWLReasoner createReasoner(OWLOntology ontology) {
        Configuration config = new Configuration();
        config.ignoreUnsupportedDatatypes = true;
        OWLReasonerFactory factory = new ReasonerFactory();
        return factory.createReasoner(ontology, config);
    }
}
