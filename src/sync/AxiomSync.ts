import * as vscode from 'vscode';
import { generateEntityCluster } from '../serializer/FunctionalSerializer';
import { manchesterToFunctional } from '../utils/ExpressionUtils';
import { temporaryClassIris } from '../views/DLQueryState.js';
import { suppressReloadFor } from './reloadGuard';
import { RawTextDocument, applyWorkspaceEditsToText } from './RawTextDocument';
import type {
  OWLEntity,
  OWLClass,
  OWLObjectProperty,
  OWLDataProperty,
  OWLAnnotationProperty,
  OWLIndividual,
  OntologyModel,
} from '../model/OntologyModel';
import { createEmptyModel, BUILTIN_ANNOTATION_PROP_IRIS } from '../model/OntologyModel';

const BUILTIN_ANN_SET = new Set(BUILTIN_ANNOTATION_PROP_IRIS);

const RDFS_PREFIX = 'http://www.w3.org/2000/01/rdf-schema#';
const RDFS_ANN_TO_TOKEN = new Map<string, string>([
  [`${RDFS_PREFIX}label`,       'rdfs:label'],
  [`${RDFS_PREFIX}comment`,     'rdfs:comment'],
  [`${RDFS_PREFIX}seeAlso`,     'rdfs:seeAlso'],
  [`${RDFS_PREFIX}isDefinedBy`, 'rdfs:isDefinedBy'],
]);

// ── Shared helpers ─────────────────────────────────────────────────────────────

function detectFunctionalIndent(lines: string[]): string {
  for (const line of lines) {
    if (/^\s+[A-Za-z(]/.test(line) && !line.trimStart().startsWith('Prefix')) {
      return line.match(/^(\s+)/)?.[1] ?? '  ';
    }
  }
  return '  ';
}

function parsePrefixes(text: string, fmt: 'functional' | 'manchester' | 'turtle'): Map<string, string> {
  const map = new Map<string, string>();
  let re: RegExp;
  if (fmt === 'functional') {
    re = /Prefix\s*\(\s*([^=\s]*)\s*=\s*<([^>]+)>/g;
  } else if (fmt === 'manchester') {
    re = /^Prefix:\s+([^\s]+)\s+<([^>]+)>/gm;
  } else {
    re = /@prefix\s+([^\s:]*:?)\s*<([^>]+)>/g;
  }
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) { map.set(m[1], m[2]); }
  return map;
}

function resolveIri(token: string, prefixes: Map<string, string>): string {
  if (token.startsWith('<') && token.endsWith('>')) { return token.slice(1, -1); }
  const c = token.indexOf(':');
  if (c >= 0) {
    const exp = prefixes.get(token.slice(0, c + 1));
    if (exp !== undefined) { return exp + token.slice(c + 1); }
  }
  return token;
}

function abbreviateIri(iri: string, prefixes: Map<string, string>): string {
  const token = RDFS_ANN_TO_TOKEN.get(iri);
  if (token !== undefined) { return token; }
  return `<${iri}>`;
}

// Replace all bare full IRIs in a stored Manchester expression with abbreviated form
const BARE_IRI_RE = /https?:\/\/[^\s(),{}[\]]+/g;
function abbreviateExprIris(expr: string, prefixes: Map<string, string>): string {
  return expr.replace(BARE_IRI_RE, iri => abbreviateIri(iri, prefixes));
}

function fmtLiteral(value: string, lang?: string): string {
  const esc = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  return lang ? `"${esc}"@${lang}` : `"${esc}"`;
}

function fmtDataLiteral(value: string, datatype?: string): string {
  const esc = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  if (datatype) {
    return `"${esc}"^^${abbreviateIri(datatype, new Map())}`;
  }
  return `"${esc}"`;
}

// Produce annotation predicate segments from entity.labels and entity.annotations
function entityAnnotationSegs(entity: OWLEntity, prefixes: Map<string, string>): string[] {
  const segs: string[] = [];
  for (const [lang, vals] of Object.entries(entity.labels)) {
    for (const v of vals) {
      segs.push(`${abbreviateIri(`${RDFS_PREFIX}label`, prefixes)} ${fmtLiteral(v, lang || undefined)}`);
    }
  }
  for (const [propIri, vals] of Object.entries(entity.annotations)) {
    for (const raw of vals) {
      const at = raw.lastIndexOf('@');
      const hasLang = at > 0 && /^[A-Za-z][A-Za-z0-9\-]*$/.test(raw.slice(at + 1));
      const text = hasLang ? raw.slice(0, at) : raw;
      const lang = hasLang ? raw.slice(at + 1) : undefined;
      segs.push(`${abbreviateIri(propIri, prefixes)} ${fmtLiteral(text, lang)}`);
    }
  }
  return segs;
}

// ── OWL Functional Syntax (.ofn / .owf) ───────────────────────────────────────

// Keywords whose lines we manage (delete old, insert new) per entity
const CLASS_AXIOM_KWS = new Set([
  'SubClassOf', 'EquivalentClasses', 'DisjointClasses', 'DisjointUnion',
]);
const OBJ_PROP_AXIOM_KWS = new Set([
  'SubObjectPropertyOf', 'ObjectPropertyDomain', 'ObjectPropertyRange',
  'FunctionalObjectProperty', 'InverseFunctionalObjectProperty',
  'TransitiveObjectProperty', 'SymmetricObjectProperty', 'AsymmetricObjectProperty',
  'ReflexiveObjectProperty', 'IrreflexiveObjectProperty', 'InverseObjectProperties',
  'EquivalentObjectProperties', 'DisjointObjectProperties',
]);
const DATA_PROP_AXIOM_KWS = new Set([
  'SubDataPropertyOf', 'DataPropertyDomain', 'DataPropertyRange',
  'FunctionalDataProperty',
]);
const ANN_PROP_AXIOM_KWS = new Set([
  'SubAnnotationPropertyOf', 'AnnotationPropertyDomain', 'AnnotationPropertyRange',
]);
const INDIVIDUAL_AXIOM_KWS = new Set([
  'ClassAssertion', 'ObjectPropertyAssertion', 'DataPropertyAssertion',
  'NegativeObjectPropertyAssertion', 'NegativeDataPropertyAssertion',
  'SameIndividual', 'DifferentIndividuals',
]);

function entityAxiomKeywords(entity: OWLEntity): Set<string> {
  switch (entity.type) {
    case 'class':              return CLASS_AXIOM_KWS;
    case 'objectProperty':     return OBJ_PROP_AXIOM_KWS;
    case 'dataProperty':       return DATA_PROP_AXIOM_KWS;
    case 'annotationProperty': return ANN_PROP_AXIOM_KWS;
    case 'individual':         return INDIVIDUAL_AXIOM_KWS;
  }
}

function generateFunctionalAxiomLines(entity: OWLEntity): string[] {
  // Use a dummy model for the serializer helper
  const dummyModel = createEmptyModel('dummy.ofn');
  const clusterLines = generateEntityCluster(entity, dummyModel);
  
  // Strip the comment header and initial annotations from the cluster
  // because AxiomSync manages logical axioms separately from AnnotationSync.
  // EXCEPT: In the new consistent arrangement, we WANT them clustered.
  // Actually, AxiomSync and AnnotationSync might conflict if we are not careful.
  // For now, let's keep it minimal to just logical axioms but using the same formatting.
  
  const lines: string[] = [];
  const iri = entity.iri;
  const a = (i: string) => `<${i}>`;

  if (entity.type === 'class') {
    const cls = entity as OWLClass;
    for (const eq of cls.equivalentClassIris) {
      lines.push(`  EquivalentClasses(${a(iri)} ${a(eq)})`);
    }
    for (const expr of cls.equivalentClassExpressions) {
      const fn = manchesterToFunctional(expr);
      if (fn) lines.push(`  EquivalentClasses(${a(iri)} ${fn})`);
    }
    for (const sup of cls.superClassIris) {
      lines.push(`  SubClassOf(${a(iri)} ${a(sup)})`);
    }
    for (const expr of cls.superClassExpressions) {
      const fn = manchesterToFunctional(expr);
      if (fn) lines.push(`  SubClassOf(${a(iri)} ${fn})`);
    }
    for (const dj of cls.disjointClassIris) {
      lines.push(`  DisjointClasses(${a(iri)} ${a(dj)})`);
    }
  } else if (entity.type === 'objectProperty') {
    const prop = entity as OWLObjectProperty;
    for (const sup of prop.superPropertyIris) {
      lines.push(`  SubObjectPropertyOf(${a(iri)} ${a(sup)})`);
    }
    for (const dom of prop.domainIris) {
      lines.push(`  ObjectPropertyDomain(${a(iri)} ${a(dom)})`);
    }
    for (const rng of prop.rangeIris) {
      lines.push(`  ObjectPropertyRange(${a(iri)} ${a(rng)})`);
    }
    if (prop.isFunctional)         lines.push(`  FunctionalObjectProperty(${a(iri)})`);
    if (prop.isInverseFunctional)  lines.push(`  InverseFunctionalObjectProperty(${a(iri)})`);
    if (prop.isTransitive)         lines.push(`  TransitiveObjectProperty(${a(iri)})`);
    if (prop.isSymmetric)          lines.push(`  SymmetricObjectProperty(${a(iri)})`);
    if (prop.isReflexive)          lines.push(`  ReflexiveObjectProperty(${a(iri)})`);
    if (prop.isIrreflexive)        lines.push(`  IrreflexiveObjectProperty(${a(iri)})`);
    if (prop.isAsymmetric)         lines.push(`  AsymmetricObjectProperty(${a(iri)})`);
    if (prop.inverseOfIri)         lines.push(`  InverseObjectProperties(${a(iri)} ${a(prop.inverseOfIri)})`);
    for (const eq of (prop.equivalentPropertyIris ?? []))
      lines.push(`  EquivalentObjectProperties(${a(iri)} ${a(eq)})`);
    for (const disj of (prop.disjointPropertyIris ?? []))
      lines.push(`  DisjointObjectProperties(${a(iri)} ${a(disj)})`);
    for (const chain of (prop.propertyChains ?? []))
      lines.push(`  SubObjectPropertyOf(ObjectPropertyChain(${chain.map(a).join(' ')}) ${a(iri)})`);
  } else if (entity.type === 'dataProperty') {
    const prop = entity as OWLDataProperty;
    for (const sup of prop.superPropertyIris) {
      lines.push(`  SubDataPropertyOf(${a(iri)} ${a(sup)})`);
    }
    for (const dom of prop.domainIris) {
      lines.push(`  DataPropertyDomain(${a(iri)} ${a(dom)})`);
    }
    for (const rng of prop.rangeIris) {
      lines.push(`  DataPropertyRange(${a(iri)} ${a(rng)})`);
    }
    if (prop.isFunctional) lines.push(`  FunctionalDataProperty(${a(iri)})`);
  } else if (entity.type === 'annotationProperty') {
    const prop = entity as OWLAnnotationProperty;
    for (const sup of prop.superPropertyIris) {
      lines.push(`  SubAnnotationPropertyOf(${a(iri)} ${a(sup)})`);
    }
    for (const dom of prop.domainIris) {
      lines.push(`  AnnotationPropertyDomain(${a(iri)} ${a(dom)})`);
    }
    for (const rng of prop.rangeIris) {
      lines.push(`  AnnotationPropertyRange(${a(iri)} ${a(rng)})`);
    }
  } else if (entity.type === 'individual') {
    const ind = entity as OWLIndividual;
    for (const cls of ind.classIris) {
      lines.push(`  ClassAssertion(${a(cls)} ${a(iri)})`);
    }
    for (const opa of ind.objectPropertyAssertions) {
      lines.push(`  ObjectPropertyAssertion(${a(opa.propertyIri)} ${a(iri)} ${a(opa.targetIri)})`);
    }
    for (const dpa of ind.dataPropertyAssertions) {
      lines.push(`  DataPropertyAssertion(${a(dpa.propertyIri)} ${a(iri)} ${fmtDataLiteral(dpa.value, dpa.datatype)})`);
    }
  }

  return lines;
}

// Match a line to an axiom keyword and verify the entity IRI is in the owned
// position for that axiom. A parent IRI in SubClassOf(child parent) is not owned
// by the parent frame and must not be used as that parent's insertion point.
function isEntityAxiomLine(line: string, entity: OWLEntity, keywords: Set<string>): boolean {
  const trimmed = line.trimStart();
  const kw = trimmed.match(/^([A-Za-z]+)\s*\(/);
  if (!kw || !keywords.has(kw[1])) return false;
  const tokens = extractIriTokens(trimmed);
  const entityToken = `<${entity.iri}>`;
  const first = tokens[0];
  const second = tokens[1];
  const last = tokens[tokens.length - 1];

  switch (entity.type) {
    case 'class':
      if (kw[1] === 'SubClassOf') {
        // Named-class subclass axioms are owned by the subclass. GCIs emitted
        // for this class as superclass have a complex first operand and the
        // edited class as the final named IRI.
        return first === entityToken || (!trimmed.startsWith('SubClassOf(<') && last === entityToken);
      }
      return first === entityToken;

    case 'objectProperty':
      if (kw[1] === 'SubObjectPropertyOf' && trimmed.includes('ObjectPropertyChain(')) {
        return last === entityToken;
      }
      return first === entityToken;

    case 'dataProperty':
    case 'annotationProperty':
      return first === entityToken;

    case 'individual':
      if (kw[1] === 'ClassAssertion' || kw[1] === 'ObjectPropertyAssertion' || kw[1] === 'DataPropertyAssertion') {
        return second === entityToken;
      }
      return first === entityToken;
  }
}

function extractIriTokens(text: string): string[] {
  return Array.from(text.matchAll(/<[^>]+>/g), match => match[0]);
}

// True only for GCI SubClassOf lines: SubClassOf(complexExpr <entity>)
// These are distinguished from regular SubClassOf(<entity> ...) by the complex LHS.
function isGCIAxiomLine(line: string, entity: OWLEntity): boolean {
  if (entity.type !== 'class') return false;
  const trimmed = line.trimStart();
  if (!/^SubClassOf\s*\(/.test(trimmed)) return false;
  const entityToken = `<${entity.iri}>`;
  const tokens = extractIriTokens(trimmed);
  return (
    tokens.length >= 2 &&
    tokens[0] !== entityToken &&
    !trimmed.startsWith('SubClassOf(<') &&
    tokens[tokens.length - 1] === entityToken
  );
}

// Generates only the GCI axiom lines (SubClassOf(complexExpr <entity>)) for functional syntax.
function generateFunctionalGCILines(entity: OWLEntity): string[] {
  if (entity.type !== 'class') return [];
  const cls = entity as OWLClass;
  const a = (i: string) => `<${i}>`;
  const lines: string[] = [];
  for (const expr of cls.gciExpressions ?? []) {
    const fn = manchesterToFunctional(expr);
    if (fn) lines.push(`  SubClassOf(${fn} ${a(cls.iri)})`);
  }
  return lines;
}

// Returns the Declaration keyword for Declaration(Keyword(<iri>)) matching.
function entityDeclarationKeyword(entity: OWLEntity): string {
  switch (entity.type) {
    case 'class':              return 'Class';
    case 'objectProperty':     return 'ObjectProperty';
    case 'dataProperty':       return 'DataProperty';
    case 'annotationProperty': return 'AnnotationProperty';
    case 'individual':         return 'NamedIndividual';
  }
}

// Returns the last line index that "anchors" the entity in a functional-syntax document:
// the entity's Declaration line or its last AnnotationAssertion. Returns -1 if neither found.
function findEntityAnchorLine(lines: string[], entity: OWLEntity): number {
  const entityToken = `<${entity.iri}>`;
  const escapedToken = entityToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declKw = entityDeclarationKeyword(entity);
  const declarationRe = new RegExp(
    `^\\s*Declaration\\s*\\(\\s*${declKw}\\s*\\(\\s*${escapedToken}\\s*\\)`
  );
  let anchor = -1;
  for (let i = 0; i < lines.length; i++) {
    if (declarationRe.test(lines[i])) {
      anchor = Math.max(anchor, i);
      continue;
    }
    if (/\bAnnotationAssertion\b/.test(lines[i]) && lines[i].includes(entityToken)) {
      anchor = Math.max(anchor, i);
    }
  }
  return anchor;
}

interface SyncResult {
  edit: vscode.WorkspaceEdit;
  changedRanges: vscode.Range[];
}

function changedLineRanges(startLine: number, lines: readonly string[]): vscode.Range[] {
  return lines.map((line, i) => new vscode.Range(startLine + i, 0, startLine + i, line.length));
}

// ── Diff-based insertion helpers ──────────────────────────────────────────────

function getAxiomKeyword(line: string): string | null {
  const m = line.trimStart().match(/^([A-Za-z]+)\s*\(/);
  return m ? m[1] : null;
}

// Relative ordering within a class cluster (lower = earlier).
// Keywords absent from this map all share priority 99 (property/individual axioms).
const AXIOM_KW_PRIORITY: Readonly<Record<string, number>> = {
  EquivalentClasses: 0, EquivalentUnion: 0,
  SubClassOf: 1,
  DisjointClasses: 2, DisjointUnion: 2,
};

// Find where to insert a new axiom with the given keyword.
// Uses keyword priority so EquivalentClasses always lands before SubClassOf, etc.
// Falls back to the position of the first removed line of the same keyword (in-place replacement),
// then to after the last kept line, then to anchor+1.
function findInsertionPointForKeyword(
  kw: string,
  keptLineIdxs: number[],
  removedLineIdxs: number[],
  lines: string[],
  anchor: number,
  fallbackLine: number,
): number {
  const myPriority = AXIOM_KW_PRIORITY[kw] ?? 99;
  let lastSameIdx = -1;
  let lastLowerPriorityIdx = -1;
  let firstHigherPriorityIdx = -1;

  for (const i of keptLineIdxs) {
    const lineKw = getAxiomKeyword(lines[i]);
    if (!lineKw) { continue; }
    const p = AXIOM_KW_PRIORITY[lineKw] ?? 99;
    if (lineKw === kw) {
      lastSameIdx = i;
    } else if (p < myPriority && i > lastLowerPriorityIdx) {
      lastLowerPriorityIdx = i;
    } else if (p > myPriority && (firstHigherPriorityIdx < 0 || i < firstHigherPriorityIdx)) {
      firstHigherPriorityIdx = i;
    }
  }

  if (lastSameIdx >= 0) { return lastSameIdx + 1; }
  if (lastLowerPriorityIdx >= 0) { return lastLowerPriorityIdx + 1; }
  if (firstHigherPriorityIdx >= 0) { return firstHigherPriorityIdx; }
  // No kept line established a position; use the first removed line of the same keyword
  // (the new line replaces it in-place when combined with the delete in the same edit).
  const firstRemovedSameKw = removedLineIdxs.find(i => getAxiomKeyword(lines[i]) === kw);
  if (firstRemovedSameKw !== undefined) { return firstRemovedSameKw; }
  const lastKeptIdx = keptLineIdxs.length > 0 ? keptLineIdxs[keptLineIdxs.length - 1] : -1;
  if (lastKeptIdx >= 0) { return lastKeptIdx + 1; }
  return anchor >= 0 ? anchor + 1 : fallbackLine;
}

function syncAxiomsFunctional(doc: vscode.TextDocument, entity: OWLEntity): SyncResult | null {
  const text = doc.getText();
  const lines = text.split('\n');
  const keywords = entityAxiomKeywords(entity);

  // Collect all existing axiom lines for this entity
  const existingRegIdxs: number[] = [];
  const existingGciIdxs: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isEntityAxiomLine(lines[i], entity, keywords)) { continue; }
    if (isGCIAxiomLine(lines[i], entity)) { existingGciIdxs.push(i); }
    else { existingRegIdxs.push(i); }
  }

  // Detect indentation from existing axiom lines; fall back to file convention.
  const firstAxiomIdx = existingRegIdxs[0] ?? existingGciIdxs[0] ?? -1;
  const indent = firstAxiomIdx >= 0
    ? (lines[firstAxiomIdx].match(/^(\s+)/)?.[1] ?? detectFunctionalIndent(lines))
    : detectFunctionalIndent(lines);

  // Generate model's desired lines using the detected indentation.
  const modelRegLines = generateFunctionalAxiomLines(entity).map(l => indent + l.trimStart());
  const modelGciLines = generateFunctionalGCILines(entity).map(l => indent + l.trimStart());

  // Diff: lines only in file → remove; lines only in model → add.
  const fileRegMap = new Map<string, number>(existingRegIdxs.map(i => [lines[i].trim(), i]));
  const modelRegSet = new Set(modelRegLines.map(l => l.trim()));
  const fileGciMap = new Map<string, number>(existingGciIdxs.map(i => [lines[i].trim(), i]));
  const modelGciSet = new Set(modelGciLines.map(l => l.trim()));

  const regRemoveIdxs = existingRegIdxs.filter(i => !modelRegSet.has(lines[i].trim()));
  const regAddLines   = modelRegLines.filter(l => !fileRegMap.has(l.trim()));
  const gciRemoveIdxs = existingGciIdxs.filter(i => !modelGciSet.has(lines[i].trim()));
  const gciAddLines   = modelGciLines.filter(l => !fileGciMap.has(l.trim()));

  if (regRemoveIdxs.length === 0 && regAddLines.length === 0 &&
      gciRemoveIdxs.length === 0 && gciAddLines.length === 0) {
    return null;
  }

  const anchor = findEntityAnchorLine(lines, entity);

  // GCI boundary: before Property Chains or before closing paren.
  let closingParenLine = lines.length > 1 ? lines.length - 1 : lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === ')') { closingParenLine = i; break; }
  }
  let gciInsertAt = closingParenLine;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('SubObjectPropertyOf(ObjectPropertyChain')) {
      gciInsertAt = i; break;
    }
  }

  // Lines that stay in the file (not being removed)
  const regRemoveSet = new Set(regRemoveIdxs);
  const keptLineIdxs = existingRegIdxs.filter(i => !regRemoveSet.has(i));

  // Group toAdd lines by their insertion point in the original document.
  const insertsByLine = new Map<number, string[]>();
  for (const line of regAddLines) {
    const kw = getAxiomKeyword(line) ?? '';
    const at = findInsertionPointForKeyword(kw, keptLineIdxs, regRemoveIdxs, lines, anchor, gciInsertAt);
    if (!insertsByLine.has(at)) { insertsByLine.set(at, []); }
    insertsByLine.get(at)!.push(line);
  }

  const edit = new vscode.WorkspaceEdit();

  // Deletions (reverse order so line indices stay valid within the WorkspaceEdit)
  for (const i of [...regRemoveIdxs, ...gciRemoveIdxs].sort((a, b) => b - a)) {
    edit.delete(doc.uri, doc.lineAt(i).rangeIncludingLineBreak);
  }

  // Regular insertions
  for (const [lineIdx, insertLines] of insertsByLine) {
    edit.insert(doc.uri, new vscode.Position(lineIdx, 0), insertLines.join('\n') + '\n');
  }

  // GCI insertions
  if (gciAddLines.length > 0) {
    edit.insert(doc.uri, new vscode.Position(gciInsertAt, 0), gciAddLines.join('\n') + '\n');
  }

  // Compute changedRanges in post-edit coordinates.
  // Post-edit line = orig_line − deleted_before + inserted_before.
  const changedRanges: vscode.Range[] = [];
  const allRemovesSorted = [...regRemoveIdxs, ...gciRemoveIdxs].sort((a, b) => a - b);
  const allInsertions: Array<[number, string[]]> = [
    ...[...insertsByLine.entries()],
    ...(gciAddLines.length > 0 ? [[gciInsertAt, gciAddLines] as [number, string[]]] : []),
  ].sort((a, b) => a[0] - b[0]);

  for (const [origLine, insertedLines] of allInsertions) {
    const deletedBefore  = allRemovesSorted.filter(d => d < origLine).length;
    const insertedBefore = allInsertions
      .filter(([pos]) => pos < origLine)
      .reduce((sum, [, ls]) => sum + ls.length, 0);
    const postStart = origLine - deletedBefore + insertedBefore;
    for (let i = 0; i < insertedLines.length; i++) {
      changedRanges.push(new vscode.Range(postStart + i, 0, postStart + i, insertedLines[i].length));
    }
  }

  return { edit, changedRanges };
}

// ── Manchester Syntax (.omn) ───────────────────────────────────────────────────

const FRAME_KW_RE = /^(Class|ObjectProperty|DataProperty|AnnotationProperty|Individual)\s*:\s*(.*)/;
const TOPLEVEL_KW_RE = /^(Class|ObjectProperty|DataProperty|AnnotationProperty|Individual|DisjointClasses|EquivalentClasses|Prefix|Ontology)\s*:/;
const SECTION_KW_RE = /^\s+(Annotations|SubClassOf|EquivalentTo|DisjointWith|Domain|Range|Characteristics|InverseOf|SubPropertyOf|Types|Facts)\s*:/;

function findManchesterEntityFrame(
  lines: string[], entityIri: string, prefixes: Map<string, string>,
): { start: number; end: number } | null {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FRAME_KW_RE);
    if (!m) continue;
    if (resolveIri(m[2].trim(), prefixes) !== entityIri) continue;
    let end = i + 1;
    while (end < lines.length && !TOPLEVEL_KW_RE.test(lines[end])) { end++; }
    return { start: i, end };
  }
  return null;
}

function generateManchesterAxiomSections(entity: OWLEntity, prefixes: Map<string, string>): string {
  const ab = (iri: string) => abbreviateIri(iri, prefixes);
  const abExpr = (e: string) => abbreviateExprIris(e, prefixes);
  const lines: string[] = [];

  if (entity.type === 'class') {
    const cls = entity as OWLClass;
    const subItems = [
      ...cls.superClassIris.map(ab),
      ...cls.superClassExpressions.map(abExpr),
    ];
    if (subItems.length > 0) {
      lines.push(`    SubClassOf: ${subItems.join(',\n        ')}`);
    }
    const eqItems = [
      ...cls.equivalentClassIris.map(ab),
      ...cls.equivalentClassExpressions.map(abExpr),
    ];
    if (eqItems.length > 0) {
      lines.push(`    EquivalentTo: ${eqItems.join(',\n        ')}`);
    }
    if (cls.disjointClassIris.length > 0) {
      lines.push(`    DisjointWith: ${cls.disjointClassIris.map(ab).join(',\n        ')}`);
    }
  } else if (entity.type === 'objectProperty') {
    const prop = entity as OWLObjectProperty;
    if (prop.superPropertyIris.length > 0) {
      lines.push(`    SubPropertyOf: ${prop.superPropertyIris.map(ab).join(',\n        ')}`);
    }
    if (prop.domainIris.length > 0) {
      lines.push(`    Domain: ${prop.domainIris.map(ab).join(',\n        ')}`);
    }
    if (prop.rangeIris.length > 0) {
      lines.push(`    Range: ${prop.rangeIris.map(ab).join(',\n        ')}`);
    }
    const chars: string[] = [];
    if (prop.isFunctional)         chars.push('Functional');
    if (prop.isInverseFunctional)  chars.push('InverseFunctional');
    if (prop.isTransitive)         chars.push('Transitive');
    if (prop.isSymmetric)          chars.push('Symmetric');
    if (prop.isReflexive)          chars.push('Reflexive');
    if (prop.isIrreflexive)        chars.push('Irreflexive');
    if (prop.isAsymmetric)         chars.push('Asymmetric');
    if (chars.length > 0) lines.push(`    Characteristics: ${chars.join(', ')}`);
    if (prop.inverseOfIri) lines.push(`    InverseOf: ${ab(prop.inverseOfIri)}`);
    if ((prop.equivalentPropertyIris ?? []).length > 0)
      lines.push(`    EquivalentTo: ${prop.equivalentPropertyIris!.map(ab).join(',\n        ')}`);
    if ((prop.disjointPropertyIris ?? []).length > 0)
      lines.push(`    DisjointWith: ${prop.disjointPropertyIris!.map(ab).join(',\n        ')}`);
    for (const chain of (prop.propertyChains ?? []))
      lines.push(`    SubPropertyChain: ${chain.map(ab).join(' o ')}`);
  } else if (entity.type === 'dataProperty') {
    const prop = entity as OWLDataProperty;
    if (prop.superPropertyIris.length > 0) {
      lines.push(`    SubPropertyOf: ${prop.superPropertyIris.map(ab).join(',\n        ')}`);
    }
    if (prop.domainIris.length > 0) {
      lines.push(`    Domain: ${prop.domainIris.map(ab).join(',\n        ')}`);
    }
    if (prop.rangeIris.length > 0) {
      lines.push(`    Range: ${prop.rangeIris.map(ab).join(',\n        ')}`);
    }
    if (prop.isFunctional) lines.push('    Characteristics: Functional');
  } else if (entity.type === 'annotationProperty') {
    const prop = entity as OWLAnnotationProperty;
    if (prop.superPropertyIris.length > 0) {
      lines.push(`    SubPropertyOf: ${prop.superPropertyIris.map(ab).join(',\n        ')}`);
    }
    if (prop.domainIris.length > 0) {
      lines.push(`    Domain: ${prop.domainIris.map(ab).join(',\n        ')}`);
    }
    if (prop.rangeIris.length > 0) {
      lines.push(`    Range: ${prop.rangeIris.map(ab).join(',\n        ')}`);
    }
  } else if (entity.type === 'individual') {
    const ind = entity as OWLIndividual;
    if (ind.classIris.length > 0) {
      lines.push(`    Types: ${ind.classIris.map(ab).join(',\n        ')}`);
    }
    const facts: string[] = [
      ...ind.objectPropertyAssertions.map(a => `${ab(a.propertyIri)} ${ab(a.targetIri)}`),
      ...ind.dataPropertyAssertions.map(a => {
        const lit = fmtDataLiteralManchester(a.value, a.datatype, prefixes);
        return `${ab(a.propertyIri)} ${lit}`;
      }),
    ];
    if (facts.length > 0) {
      lines.push(`    Facts: ${facts.join(',\n        ')}`);
    }
  }

  return lines.join('\n');
}

function fmtDataLiteralManchester(value: string, datatype: string | undefined, prefixes: Map<string, string>): string {
  const esc = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  if (datatype) {
    return `"${esc}"^^${abbreviateIri(datatype, prefixes)}`;
  }
  return `"${esc}"`;
}

// Axiom section keywords we manage (NOT Annotations — that's AnnotationSync's job)
const MANAGED_SECTION_KWS = new Set([
  'SubClassOf', 'EquivalentTo', 'DisjointWith',
  'SubPropertyOf', 'Domain', 'Range', 'Characteristics', 'InverseOf',
  'SubPropertyChain',
  'Types', 'Facts',
]);

function syncAxiomsManchester(doc: vscode.TextDocument, entity: OWLEntity): SyncResult | null {
  const text = doc.getText();
  const lines = text.split('\n');
  const prefixes = parsePrefixes(text, 'manchester');
  const frame = findManchesterEntityFrame(lines, entity.iri, prefixes);
  if (!frame) return null;

  // Find ranges of existing managed sections within the frame
  // Collect: [{ start, end }] sorted by start
  const managedRanges: { start: number; end: number }[] = [];
  let i = frame.start + 1;
  while (i < frame.end) {
    const secM = lines[i].match(/^\s+(Annotations|SubClassOf|EquivalentTo|DisjointWith|Domain|Range|Characteristics|InverseOf|SubPropertyOf|Types|Facts)\s*:/);
    if (secM) {
      const kw = secM[1];
      const secStart = i;
      let secEnd = i + 1;
      while (secEnd < frame.end && !SECTION_KW_RE.test(lines[secEnd])) { secEnd++; }
      if (MANAGED_SECTION_KWS.has(kw)) {
        managedRanges.push({ start: secStart, end: secEnd });
      }
      i = secEnd;
    } else {
      i++;
    }
  }

  const newSections = generateManchesterAxiomSections(entity, prefixes);

  // If nothing to delete and nothing to add, no-op
  if (managedRanges.length === 0 && newSections === '') return null;

  // Idempotency: if the existing managed section text equals the new content, skip the write.
  // trimEnd() strips trailing whitespace/empty lines that appear between the last section
  // and the next frame keyword (or EOF), which are included in managedRanges.end but not
  // in the generated output.
  if (managedRanges.length > 0 && newSections !== '') {
    const existingText = managedRanges
      .map(r => lines.slice(r.start, r.end).join('\n'))
      .join('\n');
    if (existingText.trimEnd() === newSections.trimEnd()) { return null; }
  }

  const edit = new vscode.WorkspaceEdit();
  let changedAt = frame.start + 1;

  if (managedRanges.length > 0) {
    // Replace the first managed range with new content, delete the rest
    const first = managedRanges[0];
    changedAt = first.start;
    const newContent = newSections.length > 0 ? newSections + '\n' : '';
    const startPos = doc.lineAt(first.start).range.start;
    const endPos = doc.lineAt(first.end - 1).rangeIncludingLineBreak.end;
    edit.replace(doc.uri, new vscode.Range(startPos, endPos), newContent);

    // Delete remaining managed ranges in reverse order
    for (const r of [...managedRanges.slice(1)].reverse()) {
      const s = doc.lineAt(r.start).range.start;
      const e = doc.lineAt(r.end - 1).rangeIncludingLineBreak.end;
      edit.delete(doc.uri, new vscode.Range(s, e));
    }
  } else if (newSections.length > 0) {
    // No existing managed sections — find insertion point: after Annotations if present, else after frame header
    let insertLine = frame.start + 1;
    for (let j = frame.start + 1; j < frame.end; j++) {
      if (/^\s+Annotations\s*:/.test(lines[j])) {
        // skip to end of annotations section
        insertLine = j + 1;
        while (insertLine < frame.end && !SECTION_KW_RE.test(lines[insertLine])) { insertLine++; }
        break;
      }
    }
    changedAt = insertLine;
    edit.insert(doc.uri, new vscode.Position(insertLine, 0), newSections + '\n');
  }

  return { edit, changedRanges: changedLineRanges(changedAt, newSections ? newSections.split('\n') : []) };
}

// ── Turtle Syntax (.ttl / .n3) ────────────────────────────────────────────────

function splitTurtlePredicates(blockText: string): string[] {
  const segments: string[] = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < blockText.length; i++) {
    const ch = blockText[i];
    if (ch === '"' && blockText[i - 1] !== '\\') { inStr = !inStr; cur += ch; continue; }
    if (!inStr && ch === ';') { segments.push(cur.trim()); cur = ''; continue; }
    if (!inStr && ch === '.' && (i + 1 >= blockText.length || /\s/.test(blockText[i + 1]))) {
      const t = cur.trim(); if (t) segments.push(t); cur = ''; continue;
    }
    cur += ch;
  }
  const t = cur.trim(); if (t) segments.push(t);
  return segments.filter(Boolean);
}

function generateTurtleStructuralSegs(entity: OWLEntity, prefixes: Map<string, string>): string[] {
  const ab = (iri: string) => abbreviateIri(iri, prefixes);
  const segs: string[] = [];

  if (entity.type === 'class') {
    const cls = entity as OWLClass;
    segs.push(`rdf:type owl:Class`);
    for (const sup of cls.superClassIris) segs.push(`rdfs:subClassOf ${ab(sup)}`);
    for (const eq of cls.equivalentClassIris) segs.push(`owl:equivalentClass ${ab(eq)}`);
    for (const dj of cls.disjointClassIris) segs.push(`owl:disjointWith ${ab(dj)}`);
    // Complex expressions (superClassExpressions, equivalentClassExpressions) require blank nodes — skip for Turtle
  } else if (entity.type === 'objectProperty') {
    const prop = entity as OWLObjectProperty;
    // Build rdf:type values
    const types = ['owl:ObjectProperty'];
    if (prop.isTransitive)        types.push('owl:TransitiveProperty');
    if (prop.isSymmetric)         types.push('owl:SymmetricProperty');
    if (prop.isFunctional)        types.push('owl:FunctionalProperty');
    if (prop.isInverseFunctional) types.push('owl:InverseFunctionalProperty');
    if (prop.isReflexive)         types.push('owl:ReflexiveProperty');
    if (prop.isIrreflexive)       types.push('owl:IrreflexiveProperty');
    if (prop.isAsymmetric)        types.push('owl:AsymmetricProperty');
    segs.push(`rdf:type ${types.join(' , ')}`);
    for (const sup of prop.superPropertyIris) segs.push(`rdfs:subPropertyOf ${ab(sup)}`);
    for (const dom of prop.domainIris) segs.push(`rdfs:domain ${ab(dom)}`);
    for (const rng of prop.rangeIris) segs.push(`rdfs:range ${ab(rng)}`);
    if (prop.inverseOfIri) segs.push(`owl:inverseOf ${ab(prop.inverseOfIri)}`);
    for (const eq of (prop.equivalentPropertyIris ?? [])) segs.push(`owl:equivalentProperty ${ab(eq)}`);
    for (const disj of (prop.disjointPropertyIris ?? [])) segs.push(`owl:propertyDisjointWith ${ab(disj)}`);
    for (const chain of (prop.propertyChains ?? []))
      segs.push(`owl:propertyChainAxiom ( ${chain.map(ab).join(' ')} )`);
  } else if (entity.type === 'dataProperty') {
    const prop = entity as OWLDataProperty;
    const types = ['owl:DatatypeProperty'];
    if (prop.isFunctional) types.push('owl:FunctionalProperty');
    segs.push(`rdf:type ${types.join(' , ')}`);
    for (const sup of prop.superPropertyIris) segs.push(`rdfs:subPropertyOf ${ab(sup)}`);
    for (const dom of prop.domainIris) segs.push(`rdfs:domain ${ab(dom)}`);
    for (const rng of prop.rangeIris) segs.push(`rdfs:range ${ab(rng)}`);
  } else if (entity.type === 'annotationProperty') {
    const prop = entity as OWLAnnotationProperty;
    segs.push(`rdf:type owl:AnnotationProperty`);
    for (const sup of prop.superPropertyIris) segs.push(`rdfs:subPropertyOf ${ab(sup)}`);
    for (const dom of prop.domainIris) segs.push(`rdfs:domain ${ab(dom)}`);
    for (const rng of prop.rangeIris) segs.push(`rdfs:range ${ab(rng)}`);
  } else if (entity.type === 'individual') {
    const ind = entity as OWLIndividual;
    const types = ['owl:NamedIndividual', ...ind.classIris.map(ab)];
    segs.push(`rdf:type ${types.join(' , ')}`);
    for (const opa of ind.objectPropertyAssertions) {
      segs.push(`${ab(opa.propertyIri)} ${ab(opa.targetIri)}`);
    }
    for (const dpa of ind.dataPropertyAssertions) {
      segs.push(`${ab(dpa.propertyIri)} ${fmtDataLiteralTurtle(dpa.value, dpa.datatype, prefixes)}`);
    }
  }

  return segs;
}

function fmtDataLiteralTurtle(value: string, datatype: string | undefined, prefixes: Map<string, string>): string {
  const esc = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  if (datatype) {
    return `"${esc}"^^${abbreviateIri(datatype, prefixes)}`;
  }
  return `"${esc}"`;
}

function syncAxiomsTurtle(doc: vscode.TextDocument, entity: OWLEntity): SyncResult | null {
  const text = doc.getText();
  const lines = text.split('\n');
  const prefixes = parsePrefixes(text, 'turtle');

  const entityFull = `<${entity.iri}>`;
  const entityAbbrev = abbreviateIri(entity.iri, prefixes);
  const entityTokens = [entityFull, entityAbbrev].filter((v, i, a) => a.indexOf(v) === i);
  const subjectRe = new RegExp(
    `^(${entityTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s`,
  );

  let blockStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (subjectRe.test(lines[i])) { blockStart = i; break; }
  }
  if (blockStart < 0) return null;

  let blockEnd = blockStart;
  while (blockEnd < lines.length) {
    if (lines[blockEnd].trim().endsWith('.')) { blockEnd++; break; }
    blockEnd++;
  }

  const blockText = lines.slice(blockStart, blockEnd).join('\n');
  const segments = splitTurtlePredicates(blockText);
  if (segments.length === 0) return null;

  // Extract subject token and first predicate-object segment from first block segment
  const firstSeg = segments[0];
  const subjectMatch = firstSeg.match(subjectRe);
  const subjectToken = subjectMatch ? subjectMatch[0].trim() : entityAbbrev;
  const firstPredSeg = subjectMatch ? firstSeg.slice(subjectMatch[0].length).trim() : firstSeg;

  // Structural segments are always regenerated from the model (authoritative).
  const newStructSegs = generateTurtleStructuralSegs(entity, prefixes);

  // Extract existing annotation segments from the file block in file order and key them.
  // This preserves the on-disk annotation order for unchanged annotations.
  const existingAnnotSegs: Array<{ seg: string; key: string }> = [];
  const allFileSegs = [firstPredSeg, ...segments.slice(1)].filter(Boolean);
  for (const seg of allFileSegs) {
    const pred = seg.split(/\s+/)[0];
    const predIri = resolveIri(pred, prefixes);
    if (BUILTIN_ANN_SET.has(predIri)) {
      const litMatch = seg.match(/"((?:[^"\\]|\\.)*)"\s*(?:@([A-Za-z][A-Za-z0-9-]*))?/);
      if (litMatch) {
        const rawText = litMatch[1]
          .replace(/\\n/g, '\n').replace(/\\r/g, '\r')
          .replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        const lang = litMatch[2] || undefined;
        existingAnnotSegs.push({ seg, key: `${predIri}|${rawText}|${lang ?? ''}` });
      }
    }
  }
  const fileAnnotKeySet = new Set(existingAnnotSegs.map(x => x.key));

  // Model annotation segments with their canonical keys.
  const modelAnnotSegs = entityAnnotationSegs(entity, prefixes).map(seg => {
    const pred = seg.split(/\s+/)[0];
    const predIri = resolveIri(pred, prefixes);
    const litMatch = seg.match(/"((?:[^"\\]|\\.)*)"\s*(?:@([A-Za-z][A-Za-z0-9-]*))?/);
    if (!litMatch) { return null; }
    const rawText = litMatch[1]
      .replace(/\\n/g, '\n').replace(/\\r/g, '\r')
      .replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const lang = litMatch[2] || undefined;
    return { seg, key: `${predIri}|${rawText}|${lang ?? ''}` };
  }).filter((x): x is { seg: string; key: string } => x !== null);
  const modelAnnotKeySet = new Set(modelAnnotSegs.map(x => x.key));

  // Diff: kept annotations in file order, new annotations appended.
  const keptAnnot = existingAnnotSegs.filter(x => modelAnnotKeySet.has(x.key));
  const toAddAnnot = modelAnnotSegs.filter(x => !fileAnnotKeySet.has(x.key));

  const allSegs = [...newStructSegs, ...keptAnnot.map(x => x.seg), ...toAddAnnot.map(x => x.seg)];
  if (allSegs.length === 0) return null;

  // Detect continuation indent from the existing block; fall back to 4 spaces.
  const existingIndent = (() => {
    for (let i = blockStart + 1; i < blockEnd; i++) {
      const m = lines[i].match(/^(\s+)/);
      if (m) { return m[1]; }
    }
    return '    ';
  })();

  const rebuiltLines: string[] = [];
  rebuiltLines.push(`${subjectToken} ${allSegs[0]}${allSegs.length === 1 ? ' .' : ' ;'}`);
  for (let i = 1; i < allSegs.length; i++) {
    rebuiltLines.push(`${existingIndent}${allSegs[i]}${i === allSegs.length - 1 ? ' .' : ' ;'}`);
  }

  // Idempotency: skip write if rebuilt block matches existing block exactly.
  const existingBlock = lines.slice(blockStart, blockEnd).join('\n');
  if (rebuiltLines.join('\n') === existingBlock) { return null; }

  const edit = new vscode.WorkspaceEdit();
  const replaceStart = doc.lineAt(blockStart).range.start;
  const replaceEnd = doc.lineAt(blockEnd - 1).rangeIncludingLineBreak.end;
  edit.replace(doc.uri, new vscode.Range(replaceStart, replaceEnd), rebuiltLines.join('\n') + '\n');
  return { edit, changedRanges: changedLineRanges(blockStart, rebuiltLines) };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function syncAxiomsToDocument(
  uri: vscode.Uri,
  entity: OWLEntity,
  sourceFormat?: string,
): Promise<{ changedRanges: vscode.Range[]; updatedText: string } | null> {
  if (temporaryClassIris.has(entity.iri)) { return null; }
  const fmt = sourceFormat ?? extensionFormat(uri.fsPath.toLowerCase());
  if (!fmt) { return null; }

  let bytes: Uint8Array;
  try {
    bytes = await vscode.workspace.fs.readFile(uri);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const fname = uri.fsPath.split(/[\\/]/).pop() ?? '';
    void vscode.window.showErrorMessage(`OntoGraph: cannot read '${fname}' — ${msg}.`);
    return null;
  }
  const text = new TextDecoder().decode(bytes);
  const doc = new RawTextDocument(uri, text) as unknown as vscode.TextDocument;

  let result: SyncResult | null = null;
  if (fmt === 'functional') {
    result = syncAxiomsFunctional(doc, entity);
  } else if (fmt === 'manchester') {
    result = syncAxiomsManchester(doc, entity);
  } else if (fmt === 'turtle') {
    result = syncAxiomsTurtle(doc, entity);
  }

  if (!result) { return null; }

  const updatedText = applyWorkspaceEditsToText(text, result.edit);
  suppressReloadFor(3000);
  try {
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(updatedText));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const fname = uri.fsPath.split(/[\\/]/).pop() ?? '';
    void vscode.window.showErrorMessage(`OntoGraph: cannot write '${fname}' — ${msg}.`);
    return null;
  }

  // Mirror the edit to the open text document (if any, and clean) so VS Code's
  // auto-save writes the updated content rather than stale text-document content.
  const openTextDoc = vscode.workspace.textDocuments.find(
    d => d.uri.toString() === uri.toString() && !d.isDirty,
  );
  if (openTextDoc) {
    await vscode.workspace.applyEdit(result.edit);
  }

  return { changedRanges: result.changedRanges, updatedText };
}

function extensionFormat(fsPath: string): string | undefined {
  if (fsPath.endsWith('.ofn') || fsPath.endsWith('.owf')) return 'functional';
  if (fsPath.endsWith('.omn')) return 'manchester';
  if (fsPath.endsWith('.ttl') || fsPath.endsWith('.n3')) return 'turtle';
  return undefined;
}
