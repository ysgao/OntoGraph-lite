import * as vscode from 'vscode';
import type { OWLEntity } from '../model/OntologyModel';
import { BUILTIN_ANNOTATION_PROP_IRIS } from '../model/OntologyModel';
import { temporaryClassIris } from '../views/DLQueryState.js';
import { suppressReloadFor } from './reloadGuard';
import { RawTextDocument, applyWorkspaceEditsToText } from './RawTextDocument';

const RDFS_PREFIX = 'http://www.w3.org/2000/01/rdf-schema#';
const RDFS_ANN_TO_TOKEN = new Map<string, string>([
  [`${RDFS_PREFIX}label`,       'rdfs:label'],
  [`${RDFS_PREFIX}comment`,     'rdfs:comment'],
  [`${RDFS_PREFIX}seeAlso`,     'rdfs:seeAlso'],
  [`${RDFS_PREFIX}isDefinedBy`, 'rdfs:isDefinedBy'],
]);
const RDFS_TOKEN_TO_IRI = new Map<string, string>(
  [...RDFS_ANN_TO_TOKEN.entries()].map(([k, v]) => [v, k]),
);

// ── Shared helpers ─────────────────────────────────────────────────────────────

function fmtLiteral(value: string, lang?: string): string {
  const esc = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return lang ? `"${esc}"@${lang}` : `"${esc}"`;
}

function hasUnclosedString(s: string): boolean {
  let open = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '"') { open = !open; }
  }
  return open;
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

interface AnnotationPair { propIri: string; text: string; lang?: string; }

function entityAnnotationPairs(entity: OWLEntity): AnnotationPair[] {
  const pairs: AnnotationPair[] = [];
  for (const [lang, vals] of Object.entries(entity.labels)) {
    for (const v of vals) {
      pairs.push({ propIri: `${RDFS_PREFIX}label`, text: v, lang: lang || undefined });
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

interface AnnotationKey {
  propIri: string;
  text: string;
  lang?: string;
  key: string;
}

// Parse an AnnotationAssertion line to extract its identity key for the given entity.
// Returns null if the line doesn't match or isn't for this entity.
function parseFunctionalAnnotationItem(
  line: string,
  entity: OWLEntity,
  prefixes: Map<string, string>,
): AnnotationKey | null {
  if (extractFunctionalSubject(line, prefixes) !== entity.iri) return null;

  const inner = line.match(/\bAnnotationAssertion\s*\(\s*(.*)/s)?.[1];
  if (!inner) return null;

  const tokens = extractLeadingIriTokens(inner, 1);
  if (tokens.length < 1) return null;
  const propToken = tokens[0];
  const propIri = RDFS_TOKEN_TO_IRI.get(propToken) ?? resolveIri(propToken, prefixes);

  const litMatch = line.match(/"((?:[^"\\]|\\.)*)"\s*(?:@([A-Za-z][A-Za-z0-9-]*))?/);
  if (!litMatch) return null;

  const rawText = litMatch[1];
  const text = rawText
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
  const lang = litMatch[2] || undefined;

  return { propIri, text, lang, key: `${propIri}|${text}|${lang ?? ''}` };
}

function annotationModelKey(propIri: string, text: string, lang?: string): string {
  return `${propIri}|${text}|${lang ?? ''}`;
}

// Detect the leading whitespace convention used by non-comment, non-Prefix lines
// in the Ontology body (e.g. "  SubClassOf...", "    Declaration...").
// Falls back to '  ' (2 spaces) if nothing is found.
function detectFunctionalIndent(lines: string[]): string {
  for (const line of lines) {
    if (/^\s+[A-Za-z(]/.test(line) && !line.trimStart().startsWith('Prefix')) {
      return line.match(/^(\s+)/)?.[1] ?? '  ';
    }
  }
  return '  ';
}

function syncFunctional(doc: vscode.TextDocument, entity: OWLEntity): SyncResult | null {
  const text = doc.getText();
  const lines = text.split('\n');
  const prefixes = parsePrefixes(text, 'functional');

  // Build file's current annotation set in document order (preserving positions).
  // Annotations whose values contain real newlines span multiple physical lines;
  // join continuation lines before parsing.
  const fileItems: Array<{ key: string; lineIdx: number; lineCount: number }> = [];
  let i = 0;
  while (i < lines.length) {
    let combined = lines[i];
    let lineCount = 1;
    while (hasUnclosedString(combined) && i + lineCount < lines.length) {
      combined += '\n' + lines[i + lineCount];
      lineCount++;
    }
    const parsed = parseFunctionalAnnotationItem(combined, entity, prefixes);
    if (parsed) fileItems.push({ key: parsed.key, lineIdx: i, lineCount });
    i += lineCount;
  }
  const fileKeySet = new Set(fileItems.map(f => f.key));

  // Use the indentation of existing annotation lines; fall back to file convention.
  const indent = fileItems.length > 0
    ? (lines[fileItems[0].lineIdx].match(/^(\s+)/)?.[1] ?? detectFunctionalIndent(lines))
    : detectFunctionalIndent(lines);

  // Build model's desired annotation set
  const modelItems: Array<{ key: string; line: string }> = entityAnnotationPairs(entity)
    .map(({ propIri, text: t, lang }) => ({
      key: annotationModelKey(propIri, t, lang),
      line: `${indent}AnnotationAssertion(${abbreviateIri(propIri, new Map())} ${abbreviateIri(entity.iri, new Map())} ${fmtLiteral(t, lang)})`,
    }));
  const modelKeySet = new Set(modelItems.map(m => m.key));

  // Diff: items only in file must be deleted; items only in model must be inserted
  const toRemove = fileItems.filter(f => !modelKeySet.has(f.key));
  const toAdd = modelItems.filter(m => !fileKeySet.has(m.key));

  if (toRemove.length === 0 && toAdd.length === 0) return null;

  // Insertion point: after the last existing annotation for this entity.
  // If there are none, fall back to cluster header or closing paren.
  let insertAt: number;
  if (fileItems.length > 0) {
    const last = fileItems[fileItems.length - 1];
    insertAt = last.lineIdx + last.lineCount;
  } else {
    const entityToken = `<${entity.iri}>`;
    const typeLabel = entity.type.charAt(0).toUpperCase() + entity.type.slice(1);
    const headerMatch = `# ${typeLabel}: ${entityToken}`;
    let clusterHeaderIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(headerMatch)) { clusterHeaderIdx = i; break; }
    }
    if (clusterHeaderIdx >= 0) {
      insertAt = clusterHeaderIdx + 1;
    } else {
      insertAt = lines.length > 1 ? lines.length - 1 : lines.length;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim() === ')') { insertAt = i; break; }
      }
    }
  }

  const edit = new vscode.WorkspaceEdit();

  // Delete removed annotations (reverse order preserves original line indices).
  // Multi-line annotations span lineCount physical lines.
  for (const item of [...toRemove].sort((a, b) => b.lineIdx - a.lineIdx)) {
    edit.delete(doc.uri, new vscode.Range(
      item.lineIdx, 0,
      item.lineIdx + item.lineCount, 0,
    ));
  }

  // Insert new annotations after the last existing annotation.
  // Each m.line may contain real newlines if the annotation value is multi-line.
  if (toAdd.length > 0) {
    edit.insert(doc.uri, new vscode.Position(insertAt, 0), toAdd.map(m => m.line).join('\n') + '\n');
  }

  let currentLine = insertAt;
  const addedRanges: vscode.Range[] = [];
  for (const m of toAdd) {
    const mLines = m.line.split('\n');
    addedRanges.push(new vscode.Range(currentLine, 0, currentLine + mLines.length - 1, mLines[mLines.length - 1].length));
    currentLine += mLines.length;
  }
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

// Parse one annotation item line from within a Manchester Annotations: section.
// Returns null for the header line, blank lines, or lines that don't match.
function parseManchesterAnnotationLine(
  line: string,
  prefixes: Map<string, string>,
): AnnotationKey | null {
  const trimmed = line.trimStart().replace(/,\s*$/, '');
  if (!trimmed || /^Annotations\s*:/.test(trimmed)) { return null; }
  const tokens = extractLeadingIriTokens(trimmed, 1);
  if (tokens.length < 1) { return null; }
  const propToken = tokens[0];
  const propIri = RDFS_TOKEN_TO_IRI.get(propToken) ?? resolveIri(propToken, prefixes);
  const litMatch = trimmed.match(/"((?:[^"\\]|\\.)*)"\s*(?:@([A-Za-z][A-Za-z0-9-]*))?/);
  if (!litMatch) { return null; }
  const rawText = litMatch[1]
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r')
    .replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const lang = litMatch[2] || undefined;
  return { propIri, text: rawText, lang, key: `${propIri}|${rawText}|${lang ?? ''}` };
}

function syncManchester(doc: vscode.TextDocument, entity: OWLEntity): SyncResult | null {
  const text = doc.getText();
  const lines = text.split('\n');
  const prefixes = parsePrefixes(text, 'manchester');
  const frame = findManchesterEntityFrame(lines, entity.iri, prefixes);
  if (!frame) { return null; }

  // Find existing Annotations: section within frame.
  // annotEnd is determined by the SECTION_KW_RE check on lines that are NOT inside
  // a multi-line string, so we scan carefully.
  let annotStart = -1;
  let annotEnd = frame.end;
  for (let i = frame.start + 1; i < frame.end; i++) {
    if (/^\s+Annotations\s*:/.test(lines[i])) {
      annotStart = i;
      annotEnd = i + 1;
      while (annotEnd < frame.end) {
        // Do not let a section keyword inside a multi-line string end the block.
        if (!hasUnclosedString(lines.slice(annotStart + 1, annotEnd).join('\n')) &&
            SECTION_KW_RE.test(lines[annotEnd])) { break; }
        annotEnd++;
      }
      break;
    }
  }

  // Parse existing annotation items; join continuation lines for multi-line values.
  const fileItems: Array<{ key: string; lineText: string }> = [];
  if (annotStart >= 0) {
    let i = annotStart + 1;
    while (i < annotEnd) {
      let combined = lines[i].replace(/,\s*$/, '');
      let lineCount = 1;
      while (hasUnclosedString(combined) && i + lineCount < annotEnd) {
        combined += '\n' + lines[i + lineCount].replace(/,\s*$/, '');
        lineCount++;
      }
      const parsed = parseManchesterAnnotationLine(combined, prefixes);
      if (parsed) {
        fileItems.push({ key: parsed.key, lineText: combined });
      }
      i += lineCount;
    }
  }
  const fileKeySet = new Set(fileItems.map(f => f.key));

  // Build model items and key set.
  const modelPairs = entityAnnotationPairs(entity);
  const modelKeySet = new Set(
    modelPairs.map(({ propIri, text: t, lang }) => annotationModelKey(propIri, t, lang))
  );
  const toAdd = modelPairs.filter(
    ({ propIri, text: t, lang }) => !fileKeySet.has(annotationModelKey(propIri, t, lang))
  );
  const toRemoveKeys = new Set(fileItems.filter(f => !modelKeySet.has(f.key)).map(f => f.key));

  // Key-based idempotency: order in file does not matter.
  if (toAdd.length === 0 && toRemoveKeys.size === 0) { return null; }

  // Detect item indentation from existing lines; fall back to 8 spaces.
  const itemIndent = fileItems.length > 0
    ? (fileItems[0].lineText.match(/^(\s+)/)?.[1] ?? '        ')
    : '        ';

  // Rebuild block: kept items in file order (original text) + new items appended.
  const keptLines = fileItems.filter(f => !toRemoveKeys.has(f.key)).map(f => f.lineText);
  const newLines = toAdd.map(({ propIri, text: t, lang }) =>
    `${itemIndent}${abbreviateIri(propIri, prefixes)} ${fmtLiteral(t, lang)}`
  );
  const allItemLines = [...keptLines, ...newLines];

  const headerIndent = annotStart >= 0
    ? (lines[annotStart].match(/^(\s+)/)?.[1] ?? '    ')
    : '    ';
  const newAnnotBlock = allItemLines.length > 0
    ? `${headerIndent}Annotations:\n${allItemLines.join(',\n')}`
    : '';

  const edit = new vscode.WorkspaceEdit();
  let insertAt: number;

  if (annotStart >= 0) {
    const startPos = doc.lineAt(annotStart).range.start;
    const endPos = doc.lineAt(annotEnd - 1).rangeIncludingLineBreak.end;
    edit.replace(doc.uri, new vscode.Range(startPos, endPos),
      newAnnotBlock.length > 0 ? newAnnotBlock + '\n' : '');
    insertAt = annotStart;
  } else {
    insertAt = frame.start + 1;
    if (newAnnotBlock.length > 0) {
      edit.insert(doc.uri, doc.lineAt(insertAt).range.start, newAnnotBlock + '\n');
    } else {
      return null;
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

  // Extract existing annotation segments from the file block (file order) and build keys.
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
        existingAnnotSegs.push({ seg, key: annotationModelKey(predIri, rawText, lang) });
      }
    }
  }
  const fileAnnotKeySet = new Set(existingAnnotSegs.map(x => x.key));

  // Model annotation items with keys.
  const modelAnnotItems = entityAnnotationPairs(entity).map(({ propIri, text: t, lang }) => ({
    seg: `${abbreviateIri(propIri, prefixes)} ${fmtLiteral(t, lang)}`,
    key: annotationModelKey(propIri, t, lang),
  }));
  const modelAnnotKeySet = new Set(modelAnnotItems.map(x => x.key));

  const keptAnnot = existingAnnotSegs.filter(x => modelAnnotKeySet.has(x.key));
  const toAddAnnot = modelAnnotItems.filter(x => !fileAnnotKeySet.has(x.key));

  const allSegs = [...structuralSegs, ...keptAnnot.map(x => x.seg), ...toAddAnnot.map(x => x.seg)];
  if (allSegs.length === 0) { return null; }

  // Detect the continuation indent used by the existing block (fall back to 4 spaces).
  const existingIndent = (() => {
    for (let i = blockStart + 1; i < blockEnd; i++) {
      const m = lines[i].match(/^(\s+)/);
      if (m) { return m[1]; }
    }
    return '    ';
  })();

  // Rebuild block
  const rebuiltLines: string[] = [];
  rebuiltLines.push(`${subjectToken} ${allSegs[0]}${allSegs.length === 1 ? ' .' : ' ;'}`);
  for (let i = 1; i < allSegs.length; i++) {
    const isLast = i === allSegs.length - 1;
    rebuiltLines.push(`${existingIndent}${allSegs[i]}${isLast ? ' .' : ' ;'}`);
  }

  // Idempotency: if the rebuilt block is identical to the existing block, no write needed.
  const existingBlock = lines.slice(blockStart, blockEnd).join('\n');
  if (rebuiltLines.join('\n') === existingBlock) { return null; }

  const edit = new vscode.WorkspaceEdit();
  const replaceStart = doc.lineAt(blockStart).range.start;
  const replaceEnd = doc.lineAt(blockEnd - 1).rangeIncludingLineBreak.end;
  edit.replace(doc.uri, new vscode.Range(replaceStart, replaceEnd), rebuiltLines.join('\n') + '\n');

  // Decorate only the newly added annotation lines at the end of the rebuilt block.
  const numAdded = toAddAnnot.length;
  const annotLineStart = blockStart + rebuiltLines.length - numAdded;
  const addedRanges = toAddAnnot.map((_, i) => {
    const lineIdx = annotLineStart + i;
    return new vscode.Range(lineIdx, 0, lineIdx, rebuiltLines[rebuiltLines.length - numAdded + i].length);
  });

  return { edit, addedRanges };
}

// ── Public API ─────────────────────────────────────────────────────────────────

interface SyncResult {
  edit: vscode.WorkspaceEdit;
  addedRanges: vscode.Range[];
}

export async function syncAnnotationsToDocument(
  uri: vscode.Uri,
  entity: OWLEntity,
  sourceFormat?: string,
): Promise<{ changedRanges: vscode.Range[]; updatedText: string } | null> {
  if (temporaryClassIris.has(entity.iri)) { return null; }

  // Resolve format: prefer the caller-supplied sourceFormat (derived from parse-time detection),
  // then fall back to file extension so the function still works standalone.
  const fmt = sourceFormat ?? extensionFormat(uri.fsPath.toLowerCase());

  if (!fmt) {
    void vscode.window.showInformationMessage(
      'OntoGraph: Annotation sync is supported for functional (.ofn, .owl), Manchester (.omn), and Turtle (.ttl) files.'
    );
    return null;
  }

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
    result = syncFunctional(doc, entity);
  } else if (fmt === 'manchester') {
    result = syncManchester(doc, entity);
  } else if (fmt === 'turtle') {
    result = syncTurtle(doc, entity);
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

  // If the file is open as a VS Code text document (e.g., < 50 MB), mirror the
  // edit so the text document stays in sync with what we wrote to disk.  Without
  // this, VS Code's auto-save writes the stale text-document content back over
  // our changes.  Skip if the document is dirty (user has unsaved edits) to
  // avoid clobbering in-progress work.
  const openTextDoc = vscode.workspace.textDocuments.find(
    d => d.uri.toString() === uri.toString() && !d.isDirty,
  );
  if (openTextDoc) {
    await vscode.workspace.applyEdit(result.edit);
  }

  return { changedRanges: result.addedRanges, updatedText };
}

function extensionFormat(fsPath: string): string | undefined {
  if (fsPath.endsWith('.ofn') || fsPath.endsWith('.owf')) { return 'functional'; }
  if (fsPath.endsWith('.omn')) { return 'manchester'; }
  if (fsPath.endsWith('.ttl') || fsPath.endsWith('.n3')) { return 'turtle'; }
  return undefined;
}
