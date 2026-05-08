package org.ihtsdo.ontoeditor;

import org.semanticweb.elk.owlapi.ElkReasonerFactory;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.reasoner.OWLReasoner;
import org.semanticweb.owlapi.reasoner.OWLReasonerFactory;
import org.semanticweb.owlapi.reasoner.SimpleConfiguration;

/**
 * Thin wrapper around ELK 0.5.0 for OWLAPI 5.
 * ELK does not support explanation — callers should not request it.
 */
public class ElkAdapter {

    /**
     * Create an ELK reasoner for the given ontology.
     */
    public static OWLReasoner createReasoner(OWLOntology ontology) {
        OWLReasonerFactory factory = new ElkReasonerFactory();
        return factory.createReasoner(ontology, new SimpleConfiguration());
    }
}
