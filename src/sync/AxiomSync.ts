import * as vscode from 'vscode';
import type {
  OWLEntity,
  OWLClass,
  OWLObjectProperty,
  OWLDataProperty,
  OWLAnnotationProperty,
  OWLIndividual,
} from '../model/OntologyModel';

const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';

// ── Shared helpers ─────────────────────────────────────────────────────────────

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
  let bestPfx = '';
  let bestExp = '';
  for (const [pfx, exp] of prefixes) {
    if (iri.startsWith(exp) && exp.length > bestExp.length) {
      bestPfx = pfx; bestExp = exp;
    }
  }
  return bestExp ? bestPfx + iri.slice(bestExp.length) : `<${iri}>`;
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
    return `"${esc}"^^<${datatype}>`;
  }
  return `"${esc}"`;
}

// Produce annotation predicate segments from entity.labels and entity.annotations
function entityAnnotationSegs(entity: OWLEntity, prefixes: Map<string, string>): string[] {
  const segs: string[] = [];
  for (const [lang, vals] of Object.entries(entity.labels)) {
    for (const v of vals) {
      segs.push(`${abbreviateIri(RDFS_LABEL, prefixes)} ${fmtLiteral(v, lang || undefined)}`);
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

// ── Manchester → Functional expression converter ──────────────────────────────
// Stored expressions use full bare IRIs: e.g. "http://e.org/P some http://e.org/C"

type MToken = { t: 'IRI' | 'KW' | 'NUM' | 'LP' | 'RP' | 'LB' | 'RB' | 'COMMA'; v: string };

function tokenizeMExpr(expr: string): MToken[] {
  const toks: MToken[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (' \t\n\r'.includes(c)) { i++; continue; }
    if (c === '(') { toks.push({ t: 'LP', v: '(' }); i++; continue; }
    if (c === ')') { toks.push({ t: 'RP', v: ')' }); i++; continue; }
    if (c === '{') { toks.push({ t: 'LB', v: '{' }); i++; continue; }
    if (c === '}') { toks.push({ t: 'RB', v: '}' }); i++; continue; }
    if (c === ',') { toks.push({ t: 'COMMA', v: ',' }); i++; continue; }
    if (expr.startsWith('http://', i) || expr.startsWith('https://', i)) {
      const m = /^https?:\/\/[^\s(),{}[\]]+/.exec(expr.slice(i));
      if (m) { toks.push({ t: 'IRI', v: m[0] }); i += m[0].length; continue; }
    }
    if (/\d/.test(c)) {
      const m = /^\d+/.exec(expr.slice(i));
      if (m) { toks.push({ t: 'NUM', v: m[0] }); i += m[0].length; continue; }
    }
    const m = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(expr.slice(i));
    if (m) { toks.push({ t: 'KW', v: m[0] }); i += m[0].length; continue; }
    i++;
  }
  return toks;
}

function manchesterToFunctional(expr: string): string {
  const toks = tokenizeMExpr(expr);
  let pos = 0;
  const peek = (): MToken | undefined => toks[pos];
  const consume = (): MToken => toks[pos++] ?? { t: 'KW', v: '' };

  function parseOr(): string {
    const parts = [parseAnd()];
    while (peek()?.v === 'or') { consume(); parts.push(parseAnd()); }
    return parts.length === 1 ? parts[0] : `ObjectUnionOf(${parts.join(' ')})`;
  }

  function parseAnd(): string {
    const parts = [parseAtom()];
    while (peek()?.v === 'and') { consume(); parts.push(parseAtom()); }
    return parts.length === 1 ? parts[0] : `ObjectIntersectionOf(${parts.join(' ')})`;
  }

  function parseAtom(): string {
    const t = peek();
    if (!t) return '';

    if (t.v === 'not') {
      consume();
      // handle optional parens: not (X) or not X
      if (peek()?.t === 'LP') { consume(); const inner = parseOr(); if (peek()?.t === 'RP') consume(); return `ObjectComplementOf(${inner})`; }
      return `ObjectComplementOf(${parseAtom()})`;
    }

    if (t.t === 'LP') {
      consume();
      const inner = parseOr();
      if (peek()?.t === 'RP') consume();
      return inner;
    }

    if (t.t === 'LB') {
      consume();
      const iris: string[] = [];
      while (peek() && peek()?.t !== 'RB') {
        const tk = consume();
        if (tk.t === 'IRI') iris.push(`<${tk.v}>`);
      }
      if (peek()?.t === 'RB') consume();
      return `ObjectOneOf(${iris.join(' ')})`;
    }

    if (t.t === 'KW' && t.v === '[data]') {
      consume();
      return '';
    }

    if (t.t === 'IRI') {
      const iri = consume().v;
      const nxt = peek();
      if (nxt?.v === 'some') { consume(); return `ObjectSomeValuesFrom(<${iri}> ${parseAtom()})`; }
      if (nxt?.v === 'only') { consume(); return `ObjectAllValuesFrom(<${iri}> ${parseAtom()})`; }
      if (nxt?.v === 'value') { consume(); return `ObjectHasValue(<${iri}> ${parseAtom()})`; }
      if (nxt?.v === 'Self') { consume(); return `ObjectHasSelf(<${iri}>)`; }
      if (nxt?.v === 'min') {
        consume(); const n = consume().v;
        const f = peek(); const filler = (f?.t === 'IRI' || f?.t === 'LP' || f?.v === 'not') ? ` ${parseAtom()}` : '';
        return `ObjectMinCardinality(${n} <${iri}>${filler})`;
      }
      if (nxt?.v === 'max') {
        consume(); const n = consume().v;
        const f = peek(); const filler = (f?.t === 'IRI' || f?.t === 'LP' || f?.v === 'not') ? ` ${parseAtom()}` : '';
        return `ObjectMaxCardinality(${n} <${iri}>${filler})`;
      }
      if (nxt?.v === 'exactly') {
        consume(); const n = consume().v;
        const f = peek(); const filler = (f?.t === 'IRI' || f?.t === 'LP' || f?.v === 'not') ? ` ${parseAtom()}` : '';
        return `ObjectExactCardinality(${n} <${iri}>${filler})`;
      }
      return `<${iri}>`;
    }

    consume();
    return '';
  }

  try {
    const result = parseOr();
    return result;
  } catch {
    return '';
  }
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
  const lines: string[] = [];
  const iri = entity.iri;
  const a = (i: string) => `<${i}>`;

  if (entity.type === 'class') {
    const cls = entity as OWLClass;
    for (const sup of cls.superClassIris) {
      lines.push(`  SubClassOf(${a(iri)} ${a(sup)})`);
    }
    for (const expr of cls.superClassExpressions) {
      const fn = manchesterToFunctional(expr);
      if (fn) lines.push(`  SubClassOf(${a(iri)} ${fn})`);
    }
    for (const eq of cls.equivalentClassIris) {
      lines.push(`  EquivalentClasses(${a(iri)} ${a(eq)})`);
    }
    for (const expr of cls.equivalentClassExpressions) {
      const fn = manchesterToFunctional(expr);
      if (fn) lines.push(`  EquivalentClasses(${a(iri)} ${fn})`);
    }
    for (const dj of cls.disjointClassIris) {
      lines.push(`  DisjointClasses(${a(iri)} ${a(dj)})`);
    }
    for (const expr of cls.gciExpressions ?? []) {
      const fn = manchesterToFunctional(expr);
      if (fn) lines.push(`  SubClassOf(${fn} ${a(iri)})`);
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

// Match a line to an axiom keyword and verify the entity IRI appears in it
function isEntityAxiomLine(line: string, entityIri: string, keywords: Set<string>): boolean {
  const trimmed = line.trimStart();
  const kw = trimmed.match(/^([A-Za-z]+)\s*\(/);
  if (!kw || !keywords.has(kw[1])) return false;
  return line.includes(`<${entityIri}>`);
}

interface SyncResult {
  edit: vscode.WorkspaceEdit;
  changedRanges: vscode.Range[];
}

function changedLineRanges(startLine: number, lines: readonly string[]): vscode.Range[] {
  return lines.map((line, i) => new vscode.Range(startLine + i, 0, startLine + i, line.length));
}

function syncAxiomsFunctional(doc: vscode.TextDocument, entity: OWLEntity): SyncResult | null {
  const text = doc.getText();
  const lines = text.split('\n');
  const keywords = entityAxiomKeywords(entity);
  const newLines = generateFunctionalAxiomLines(entity);

  const toDelete: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isEntityAxiomLine(lines[i], entity.iri, keywords)) {
      toDelete.push(i);
    }
  }

  // Find insertion point: where first existing axiom was, or before closing ')' of Ontology block
  let insertAt: number;
  if (toDelete.length > 0) {
    insertAt = toDelete[0];
  } else {
    insertAt = lines.length > 1 ? lines.length - 1 : lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() === ')') { insertAt = i; break; }
    }
  }

  const edit = new vscode.WorkspaceEdit();

  if (toDelete.length > 0) {
    // Replace first deleted line with new content, delete the rest
    const newContent = newLines.length > 0 ? newLines.join('\n') + '\n' : '';
    edit.replace(doc.uri, doc.lineAt(insertAt).rangeIncludingLineBreak, newContent);
    for (const i of [...toDelete.slice(1)].reverse()) {
      edit.delete(doc.uri, doc.lineAt(i).rangeIncludingLineBreak);
    }
  } else if (newLines.length > 0) {
    edit.insert(doc.uri, new vscode.Position(insertAt, 0), newLines.join('\n') + '\n');
  }

  if (toDelete.length === 0 && newLines.length === 0) return null;
  return { edit, changedRanges: changedLineRanges(insertAt, newLines) };
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

  // Extract subject token from first segment
  const firstSeg = segments[0];
  const subjectMatch = firstSeg.match(subjectRe);
  const subjectToken = subjectMatch ? subjectMatch[0].trim() : entityAbbrev;

  // Generate both structural and annotation segments from entity model.
  // This is a combined single-pass operation so both are written atomically,
  // avoiding the two-edit race that would occur if annotation sync and axiom sync
  // ran as separate applyEdit calls (each incrementing doc.version independently).
  const newStructSegs = generateTurtleStructuralSegs(entity, prefixes);
  const newAnnotSegs = entityAnnotationSegs(entity, prefixes);
  const allSegs = [...newStructSegs, ...newAnnotSegs];
  if (allSegs.length === 0) return null;

  const rebuiltLines: string[] = [];
  rebuiltLines.push(`${subjectToken} ${allSegs[0]}${allSegs.length === 1 ? ' .' : ' ;'}`);
  for (let i = 1; i < allSegs.length; i++) {
    rebuiltLines.push(`    ${allSegs[i]}${i === allSegs.length - 1 ? ' .' : ' ;'}`);
  }

  const edit = new vscode.WorkspaceEdit();
  const replaceStart = doc.lineAt(blockStart).range.start;
  const replaceEnd = doc.lineAt(blockEnd - 1).rangeIncludingLineBreak.end;
  edit.replace(doc.uri, new vscode.Range(replaceStart, replaceEnd), rebuiltLines.join('\n') + '\n');
  return { edit, changedRanges: changedLineRanges(blockStart, rebuiltLines) };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function syncAxiomsToDocument(
  doc: vscode.TextDocument,
  entity: OWLEntity,
  sourceFormat?: string,
): Promise<vscode.Range[] | null> {
  const fsPath = doc.uri.fsPath.toLowerCase();
  const fmt = sourceFormat ?? extensionFormat(fsPath);
  let result: SyncResult | null = null;

  if (fmt === 'functional') {
    result = syncAxiomsFunctional(doc, entity);
  } else if (fmt === 'manchester') {
    result = syncAxiomsManchester(doc, entity);
  } else if (fmt === 'turtle') {
    result = syncAxiomsTurtle(doc, entity);
  } else {
    return null;
  }

  if (!result) return null;
  const ok = await vscode.workspace.applyEdit(result.edit);
  return ok ? result.changedRanges : null;
}

function extensionFormat(fsPath: string): string | undefined {
  if (fsPath.endsWith('.ofn') || fsPath.endsWith('.owf')) return 'functional';
  if (fsPath.endsWith('.omn')) return 'manchester';
  if (fsPath.endsWith('.ttl') || fsPath.endsWith('.n3')) return 'turtle';
  return undefined;
}
