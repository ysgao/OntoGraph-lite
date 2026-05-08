package org.ihtsdo.ontoeditor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Main entry point. Reads newline-delimited JSON-RPC from stdin, writes responses to stdout.
 * All diagnostics go to stderr.
 */
public class ReasonerServer {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final PrintStream OUT = System.out;
    private static final PrintStream ERR = System.err;

    public static void main(String[] args) {
        // Suppress noisy OWLAPI / reasoner INFO logging
        suppressVerboseLogging();

        ERR.println("OntoEditor reasoner server ready");
        ERR.flush();

        OntologyService service = new OntologyService();

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty()) continue;
                String response = handleLine(line, service);
                OUT.println(response);
                OUT.flush();
            }
        } catch (Exception e) {
            ERR.println("Fatal error in main loop: " + e.getMessage());
            e.printStackTrace(ERR);
        }
    }

    private static String handleLine(String line, OntologyService service) {
        JsonNode root;
        JsonNode idNode = null;
        try {
            root = MAPPER.readTree(line);
            idNode = root.get("id");
            String method = root.path("method").asText();
            JsonNode params = root.path("params");

            switch (method) {
                case "ping":
                    return success(idNode, ping());
                case "classify":
                    return success(idNode, classify(params, service));
                case "checkConsistency":
                    return success(idNode, checkConsistency(params, service));
                case "convertFormat":
                    return success(idNode, convertFormat(params, service));
                default:
                    return error(idNode, "Unknown method: " + method);
            }
        } catch (Exception e) {
            ERR.println("Error handling request: " + e.getMessage());
            e.printStackTrace(ERR);
            return error(idNode, e.getMessage() != null ? e.getMessage() : e.getClass().getName());
        }
    }

    // ---- method handlers -------------------------------------------------------

    private static ObjectNode ping() {
        ObjectNode result = MAPPER.createObjectNode();
        result.put("pong", true);
        return result;
    }

    private static ObjectNode classify(JsonNode params, OntologyService service) throws Exception {
        String format = params.path("format").asText(null);
        String content = params.path("content").asText();
        String engine = params.path("engine").asText("auto");

        org.semanticweb.owlapi.model.OWLOntology ontology = service.loadFromString(content, format);
        OntologyService.ClassificationResult result = service.classify(ontology, engine, content.length());

        ObjectNode node = MAPPER.createObjectNode();
        node.put("consistent", result.consistent);
        node.set("incoherentClasses", MAPPER.valueToTree(result.incoherentClasses));
        node.set("hierarchy", MAPPER.valueToTree(result.hierarchy));
        return node;
    }

    private static ObjectNode checkConsistency(JsonNode params, OntologyService service) throws Exception {
        String format = params.path("format").asText(null);
        String content = params.path("content").asText();
        String engine = params.path("engine").asText("auto");

        org.semanticweb.owlapi.model.OWLOntology ontology = service.loadFromString(content, format);
        OntologyService.ConsistencyResult result = service.checkConsistency(ontology, engine, content.length());

        ObjectNode node = MAPPER.createObjectNode();
        node.put("consistent", result.consistent);
        if (!result.consistent) {
            node.set("explanation", MAPPER.valueToTree(result.explanation));
        }
        return node;
    }

    private static ObjectNode convertFormat(JsonNode params, OntologyService service) throws Exception {
        String content = params.path("content").asText();
        String fromFormat = params.path("fromFormat").asText(null);
        String toFormat = params.path("toFormat").asText();

        String output = service.convertFormat(content, fromFormat, toFormat);
        ObjectNode node = MAPPER.createObjectNode();
        node.put("output", output);
        return node;
    }

    // ---- response helpers ------------------------------------------------------

    private static String success(JsonNode id, ObjectNode result) {
        ObjectNode resp = MAPPER.createObjectNode();
        if (id != null) resp.set("id", id);
        resp.set("result", result);
        return resp.toString();
    }

    private static String error(JsonNode id, String message) {
        ObjectNode resp = MAPPER.createObjectNode();
        if (id != null) resp.set("id", id);
        ObjectNode err = MAPPER.createObjectNode();
        err.put("message", message != null ? message : "unknown error");
        resp.set("error", err);
        return resp.toString();
    }

    // ---- logging suppression ---------------------------------------------------

    private static void suppressVerboseLogging() {
        try {
            Logger rootLogger = Logger.getLogger("");
            rootLogger.setLevel(Level.SEVERE);
            for (java.util.logging.Handler h : rootLogger.getHandlers()) {
                h.setLevel(Level.SEVERE);
            }
            // Suppress specific noisy loggers
            String[] loggers = {
                "org.semanticweb.owlapi",
                "org.semanticweb.HermiT",
                "org.semanticweb.elk",
                "uk.ac.manchester.cs.owl"
            };
            for (String name : loggers) {
                Logger.getLogger(name).setLevel(Level.SEVERE);
            }
        } catch (Exception e) {
            // ignore
        }
    }
}
