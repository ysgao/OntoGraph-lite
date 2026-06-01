package org.ihtsdo.ontoeditor;

import org.semanticweb.elk.owlapi.ElkReasonerConfiguration;
import org.semanticweb.elk.owlapi.ElkReasonerFactory;
import org.semanticweb.elk.reasoner.config.ReasonerConfiguration;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.reasoner.OWLReasoner;
import org.semanticweb.owlapi.reasoner.OWLReasonerConfiguration;
import org.semanticweb.owlapi.reasoner.OWLReasonerFactory;

/**
 * Thin wrapper around ELK 0.5.0 for OWLAPI 5.
 * ELK does not support explanation — callers should not request it.
 */
public class ElkAdapter {

    /**
     * Create an ELK reasoner for the given ontology.
     * Uses all available CPUs minus one for ELK's parallel saturation worker pool.
     */
    @SuppressWarnings("null")
    public static OWLReasoner createReasoner(OWLOntology ontology) {
        int threads = Math.max(1, Runtime.getRuntime().availableProcessors() - 1);
        ReasonerConfiguration elkConfig = ReasonerConfiguration.getConfiguration();
        elkConfig.setParameter(ReasonerConfiguration.NUM_OF_WORKING_THREADS, String.valueOf(threads));
        OWLReasonerConfiguration owlConfig = ElkReasonerConfiguration.getDefaultOwlReasonerConfiguration();
        OWLReasonerFactory factory = new ElkReasonerFactory();
        return factory.createReasoner(ontology, new ElkReasonerConfiguration(owlConfig, elkConfig));
    }
}
