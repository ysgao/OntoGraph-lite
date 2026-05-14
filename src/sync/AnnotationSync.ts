import * as vscode from 'vscode';
import type { OWLEntity } from '../model/OntologyModel';
import { BUILTIN_ANNOTATION_PROP_IRIS } from '../model/OntologyModel';

const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';

// ── Shared helpers ─────────────────────────────────────────────────────────────

function fmtLiteral(value: string, lang?: string): string {
  const esc = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  return lang ? `"${esc}"@${lang}` : `"${esc}"`;
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
  if (iri === RDFS_LABEL) { return 'rdfs:label'; }
  return `<${iri}>`;
}

interface AnnotationPair { propIri: string; text: string; lang?: string; }

function entityAnnotationPairs(entity: OWLEntity): AnnotationPair[] {
  const pairs: AnnotationPair[] = [];
  for (const [lang, vals] of Object.entries(entity.labels)) {
    for (const v of vals) {
      pairs.push({ propIri: RDFS_LABEL, text: v, lang: lang || undefined });
    }
  }
  for (const [propIri, vals] of Object.entries(entity.annotations)) {
    for (const raw of vals) {
      const at = raw.lastIndexOf('@');
      const hasLang = at > 0 && /^[A-Za-z][A-Za-z0-9\-]*$/.test(raw.slice(at + 1));
      pairs.push({
        propIri,
        text: hasLang ? raw.slice(0, at) : raw,
        lang: hasLang ? raw.slice(at + 1) : undefined,
      });
    }
  }
  return pairs;
}

// ── OWL Functional Syntax (.ofn / .owf) ───────────────────────────────────────

function extractFunctionalSubject(line: string, prefixes: Map<string, string>): string | null {
  if (!/AnnotationAssertion\s*\(/.test(line)) { return null; }
  const m = line.match(/AnnotationAssertion\s*\((.*)/s);
  if (!m) { return null; }
  const tokens = extractLeadingIriTokens(m[1], 2);
  if (tokens.length < 2) { return null; }
  return resolveIri(tokens[1], prefixes);
}

function extractLeadingIriTokens(s: string, count: number): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < s.length && tokens.length < count) {
    while (i < s.length && (s[i] === ' ' || s[i] === '\t')) { i++; }
    if (i >= s.length || s[i] === '"' || s[i] === ')') { break; }
    if (s[i] === '<') {
      const e = s.indexOf('>', i); if (e < 0) { break; }
      tokens.push(s.slice(i, e + 1)); i = e + 1;
    } else {
      const start = i;
      while (i < s.length && s[i] !== ' ' && s[i] !== '\t' && s[i] !== '(' && s[i] !== ')') { i++; }
      if (i > start) { tokens.push(s.slice(start, i)); }
    }
  }
  return tokens;
}

function generateFunctionalLines(entity: OWLEntity): string[] {
  return entityAnnotationPairs(entity).map(({ propIri, text, lang }) =>
    `  AnnotationAssertion(${abbreviateIri(propIri, new Map())} ${abbreviateIri(entity.iri, new Map())} ${fmtLiteral(text, lang)})`
  );
}

function syncFunctional(doc: vscode.TextDocument, entity: OWLEntity): SyncResult {
  const text = doc.getText();
  const lines = text.split('\n');
  const prefixes = parsePrefixes(text, 'functional');
  const newLines = generateFunctionalLines(entity);

  const toDelete: number[] = [];
  let clusterHeaderIdx = -1;
  const entityToken = `<${entity.iri}>`;
  const typeLabel = entity.type.charAt(0).toUpperCase() + entity.type.slice(1);
  const headerMatch = `# ${typeLabel}: ${entityToken}`;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(headerMatch)) {
      clusterHeaderIdx = i;
    }
    if (extractFunctionalSubject(lines[i], prefixes) === entity.iri) {
      toDelete.push(i);
    }
  }

  let insertAt: number;
  if (toDelete.length > 0) {
    insertAt = toDelete[0];
  } else if (clusterHeaderIdx >= 0) {
    insertAt = clusterHeaderIdx + 1;
  } else {
    // Insert before the closing ')' of the Ontology(...) block
    insertAt = lines.length > 1 ? lines.length - 1 : lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() === ')') { insertAt = i; break; }
    }
  }

  const edit = new vscode.WorkspaceEdit();

  if (toDelete.length > 0) {
    const newContent = newLines.length > 0 ? newLines.join('\n') + '\n' : '';
    edit.replace(doc.uri, doc.lineAt(insertAt).rangeIncludingLineBreak, newContent);
    for (const i of [...toDelete.slice(1)].reverse()) {
      edit.delete(doc.uri, doc.lineAt(i).rangeIncludingLineBreak);
    }
  } else if (newLines.length > 0) {
    edit.insert(doc.uri, new vscode.Position(insertAt, 0), newLines.join('\n') + '\n');
  }

  const addedRanges = newLines.map((l, i) =>
    new vscode.Range(insertAt + i, 0, insertAt + i, l.length)
  );
  return { edit, addedRanges };
}

// ── Manchester Syntax (.omn) ───────────────────────────────────────────────────

const FRAME_KW_RE = /^(Class|ObjectProperty|DataProperty|AnnotationProperty|Individual)\s*:\s*(.*)/;
const SECTION_KW_RE = /^\s+(Annotations|SubClassOf|EquivalentTo|DisjointWith|Domain|Range|Characteristics|InverseOf|SubPropertyOf|Types|Facts)\s*:/;
const TOPLEVEL_KW_RE = /^(Class|ObjectProperty|DataProperty|AnnotationProperty|Individual|DisjointClasses|EquivalentClasses)\s*:/;

function findManchesterEntityFrame(
  lines: string[], entityIri: string, prefixes: Map<string, string>,
): { start: number; end: number } | null {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FRAME_KW_RE);
    if (!m) { continue; }
    if (resolveIri(m[2].trim(), prefixes) !== entityIri) { continue; }
    // Frame ends at next top-level keyword or EOF
    let end = i + 1;
    while (end < lines.length && !TOPLEVEL_KW_RE.test(lines[end])) { end++; }
    return { start: i, end };
  }
  return null;
}

function generateManchesterAnnotationBlock(entity: OWLEntity, prefixes: Map<string, string>): string {
  const pairs = entityAnnotationPairs(entity);
  if (pairs.length === 0) { return ''; }
  const items = pairs.map(({ propIri, text, lang }) =>
    `        ${abbreviateIri(propIri, prefixes)} ${fmtLiteral(text, lang)}`
  );
  return '    Annotations:\n' + items.join(',\n');
}

function syncManchester(doc: vscode.TextDocument, entity: OWLEntity): SyncResult | null {
  const text = doc.getText();
  const lines = text.split('\n');
  const prefixes = parsePrefixes(text, 'manchester');
  const frame = findManchesterEntityFrame(lines, entity.iri, prefixes);
  if (!frame) { return null; }

  // Find existing Annotations: section within frame
  let annotStart = -1;
  let annotEnd = frame.end;
  for (let i = frame.start + 1; i < frame.end; i++) {
    if (/^\s+Annotations\s*:/.test(lines[i])) {
      annotStart = i;
      annotEnd = i + 1;
      while (annotEnd < frame.end && !SECTION_KW_RE.test(lines[annotEnd])) { annotEnd++; }
      break;
    }
  }

  const newAnnotBlock = generateManchesterAnnotationBlock(entity, prefixes);
  const edit = new vscode.WorkspaceEdit();
  let insertAt: number;

  if (annotStart >= 0) {
    // Replace existing Annotations section
    const startPos = doc.lineAt(annotStart).range.start;
    const endLineIdx = annotEnd - 1;
    const endPos = doc.lineAt(endLineIdx).rangeIncludingLineBreak.end;
    edit.replace(doc.uri, new vscode.Range(startPos, endPos),
      newAnnotBlock.length > 0 ? newAnnotBlock + '\n' : '');
    insertAt = annotStart;
  } else {
    // Insert after frame header line
    insertAt = frame.start + 1;
    if (newAnnotBlock.length > 0) {
      edit.insert(doc.uri, doc.lineAt(insertAt).range.start, newAnnotBlock + '\n');
    }
  }

  const blockLines = newAnnotBlock.split('\n');
  const addedRanges = blockLines.map((l, i) =>
    new vscode.Range(insertAt + i, 0, insertAt + i, l.length)
  );
  return { edit, addedRanges };
}

// ── Turtle Syntax (.ttl / .n3) ────────────────────────────────────────────────

const BUILTIN_ANN_SET = new Set(BUILTIN_ANNOTATION_PROP_IRIS);

function splitTurtlePredicates(blockText: string): string[] {
  // Split by ';' and '.' while respecting quoted strings
  const segments: string[] = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < blockText.length; i++) {
    const ch = blockText[i];
    if (ch === '"' && blockText[i - 1] !== '\\') { inStr = !inStr; cur += ch; continue; }
    if (!inStr && ch === ';') { segments.push(cur.trim()); cur = ''; continue; }
    if (!inStr && ch === '.' && (i + 1 >= blockText.length || /\s/.test(blockText[i + 1]))) {
      const t = cur.trim(); if (t) { segments.push(t); } cur = ''; continue;
    }
    cur += ch;
  }
  const t = cur.trim(); if (t) { segments.push(t); }
  return segments.filter(Boolean);
}

function syncTurtle(doc: vscode.TextDocument, entity: OWLEntity): SyncResult | null {
  const text = doc.getText();
  const lines = text.split('\n');
  const prefixes = parsePrefixes(text, 'turtle');

  const entityFull = `<${entity.iri}>`;
  const entityAbbrev = abbreviateIri(entity.iri, prefixes);
  const entityTokens = [entityFull, entityAbbrev].filter((v, i, a) => a.indexOf(v) === i);
  const subjectRe = new RegExp(
    `^(${entityTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s`
  );

  // Find block start
  let blockStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (subjectRe.test(lines[i])) { blockStart = i; break; }
  }
  if (blockStart < 0) { return null; }

  // Find block end (inclusive of the line ending with '.')
  let blockEnd = blockStart;
  while (blockEnd < lines.length) {
    const l = lines[blockEnd].trim();
    if (l.endsWith('.')) { blockEnd++; break; }
    blockEnd++;
  }

  const blockText = lines.slice(blockStart, blockEnd).join('\n');
  const segments = splitTurtlePredicates(blockText);
  if (segments.length === 0) { return null; }

  // First segment contains "subject pred1 obj1"; extract subject
  const firstSeg = segments[0];
  const subjectMatch = firstSeg.match(subjectRe);
  const subjectToken = subjectMatch ? subjectMatch[0].trim() : entityAbbrev;
  const firstPredSeg = subjectMatch ? firstSeg.slice(subjectMatch[0].length).trim() : firstSeg;

  // Separate structural vs annotation segments
  const structuralSegs: string[] = [];
  if (firstPredSeg) {
    const pred = firstPredSeg.split(/\s+/)[0];
    const predIri = resolveIri(pred, prefixes);
    if (!BUILTIN_ANN_SET.has(predIri)) {
      structuralSegs.push(firstPredSeg);
    }
  }
  for (let si = 1; si < segments.length; si++) {
    const seg = segments[si];
    const pred = seg.split(/\s+/)[0];
    const predIri = resolveIri(pred, prefixes);
    if (!BUILTIN_ANN_SET.has(predIri)) { structuralSegs.push(seg); }
  }

  // Generate new annotation segments
  const newAnnotSegs = entityAnnotationPairs(entity).map(({ propIri, text, lang }) =>
    `${abbreviateIri(propIri, prefixes)} ${fmtLiteral(text, lang)}`
  );

  const allSegs = [...structuralSegs, ...newAnnotSegs];
  if (allSegs.length === 0) { return null; }

  // Rebuild block
  const rebuiltLines: string[] = [];
  rebuiltLines.push(`${subjectToken} ${allSegs[0]}${allSegs.length === 1 ? ' .' : ' ;'}`);
  for (let i = 1; i < allSegs.length; i++) {
    const isLast = i === allSegs.length - 1;
    rebuiltLines.push(`    ${allSegs[i]}${isLast ? ' .' : ' ;'}`);
  }

  const edit = new vscode.WorkspaceEdit();
  const replaceStart = doc.lineAt(blockStart).range.start;
  const replaceEnd = doc.lineAt(blockEnd - 1).rangeIncludingLineBreak.end;
  edit.replace(doc.uri, new vscode.Range(replaceStart, replaceEnd), rebuiltLines.join('\n') + '\n');

  // Decorate the annotation lines at the end of the rebuilt block
  const annotLineStart = blockStart + rebuiltLines.length - newAnnotSegs.length;
  const addedRanges = newAnnotSegs.map((_, i) => {
    const lineIdx = annotLineStart + i;
    return new vscode.Range(lineIdx, 0, lineIdx, rebuiltLines[rebuiltLines.length - newAnnotSegs.length + i].length);
  });

  return { edit, addedRanges };
}

// ── Public API ─────────────────────────────────────────────────────────────────

interface SyncResult {
  edit: vscode.WorkspaceEdit;
  addedRanges: vscode.Range[];
}

export async function syncAnnotationsToDocument(
  doc: vscode.TextDocument,
  entity: OWLEntity,
  sourceFormat?: string,
): Promise<vscode.Range[] | null> {
  const fsPath = doc.uri.fsPath.toLowerCase();
  let result: SyncResult | null = null;

  // Resolve format: prefer the caller-supplied sourceFormat (derived from parse-time detection),
  // then fall back to file extension so the function still works standalone.
  const fmt = sourceFormat ?? extensionFormat(fsPath);

  if (fmt === 'functional') {
    result = syncFunctional(doc, entity);
  } else if (fmt === 'manchester') {
    result = syncManchester(doc, entity);
  } else if (fmt === 'turtle') {
    result = syncTurtle(doc, entity);
  } else {
    void vscode.window.showInformationMessage(
      'OntoGraph: Annotation sync is supported for functional (.ofn, .owl), Manchester (.omn), and Turtle (.ttl) files.'
    );
    return null;
  }

  if (!result) { return null; }
  const ok = await vscode.workspace.applyEdit(result.edit);
  return ok ? result.addedRanges : null;
}

function extensionFormat(fsPath: string): string | undefined {
  if (fsPath.endsWith('.ofn') || fsPath.endsWith('.owf')) { return 'functional'; }
  if (fsPath.endsWith('.omn')) { return 'manchester'; }
  if (fsPath.endsWith('.ttl') || fsPath.endsWith('.n3')) { return 'turtle'; }
  return undefined;
}
