import * as vscode from 'vscode';
import type { OntologyModel, OWLEntity, OWLClass, OWLObjectProperty, OWLDataProperty, OWLAnnotationProperty, OWLIndividual } from '../model/OntologyModel';
import { getLabel } from '../model/OntologyModel';
import { computeShortIri, type AxiomDisplayStyle } from '../model/AxiomDisplay';

// ── Singleton panel ───────────────────────────────────────────────────────────

let panel: vscode.WebviewPanel | undefined;

export function showEntityInfo(
  context: vscode.ExtensionContext,
  model: OntologyModel,
  iri: string,
): void {
  const cfg = vscode.workspace.getConfiguration('ontograph');
  const preferredLang = cfg.get<string>('display.preferredLabelLanguage') ?? 'en';
  const axiomStyle = (cfg.get<string>('display.axiomEntityStyle') ?? 'label') as AxiomDisplayStyle;

  const html = buildHtml(model, iri, preferredLang, axiomStyle);
  const entityLabel = entityDisplayLabel(model, iri, preferredLang);

  if (panel) {
    panel.title = `ℹ ${entityLabel}`;
    panel.webview.html = html;
    panel.reveal(vscode.ViewColumn.Beside);
  } else {
    panel = vscode.window.createWebviewPanel(
      'ontograph.entityInfo',
      `ℹ ${entityLabel}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.html = html;

    // Navigate to linked entity on link click
    panel.webview.onDidReceiveMessage(
      (msg: { type: 'navigate'; iri: string }) => {
        if (msg.type === 'navigate') {
          showEntityInfo(context, model, msg.iri);
        }
      },
      undefined,
      context.subscriptions,
    );

    panel.onDidDispose(() => { panel = undefined; }, undefined, context.subscriptions);
  }
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function buildHtml(model: OntologyModel, iri: string, lang: string, axiomStyle: AxiomDisplayStyle = 'label'): string {
  const entity = findEntity(model, iri);

  if (!entity) {
    return wrap(`<p class="empty">Entity not found in loaded ontology: <code>${esc(iri)}</code></p>`);
  }

  const sections: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────────
  const typeLabel = typeOf(entity);
  const typeClass = entity.type;
  const displayLabel = getLabel(entity, lang);
  sections.push(`
    <div class="header">
      <span class="type-badge ${typeClass}">${typeLabel}</span>
      <h1>${esc(displayLabel)}</h1>
      <div class="iri-row">
        <code class="iri">${esc(iri)}</code>
        <button onclick="copyIri()" title="Copy IRI">⎘ Copy</button>
      </div>
    </div>
  `);

  // ── Labels (all languages) ────────────────────────────────────────────────
  const allLabels = Object.entries(entity.labels)
    .flatMap(([lc, vals]) => vals.map(v => ({ lang: lc, value: v })));
  if (allLabels.length > 0) {
    sections.push(section('Labels', `
      <table>
        ${allLabels.map(l => `<tr><td class="lang-tag">${esc(l.lang || '(none)')}</td><td>${esc(l.value)}</td></tr>`).join('')}
      </table>
    `));
  }

  // ── Type-specific details ──────────────────────────────────────────────────
  if (entity.type === 'class') {
    sections.push(...classDetails(entity as OWLClass, model, lang, axiomStyle));
  } else if (entity.type === 'objectProperty') {
    sections.push(...objectPropertyDetails(entity as OWLObjectProperty, model, lang));
  } else if (entity.type === 'dataProperty') {
    sections.push(...dataPropertyDetails(entity as OWLDataProperty, model, lang));
  } else if (entity.type === 'annotationProperty') {
    sections.push(...annotationPropertyDetails(entity as OWLAnnotationProperty, model, lang));
  } else if (entity.type === 'individual') {
    sections.push(...individualDetails(entity as OWLIndividual, model, lang));
  }

  // ── Annotations ───────────────────────────────────────────────────────────
  const annEntries = Object.entries(entity.annotations).filter(([, vals]) => vals.length > 0);
  if (annEntries.length > 0) {
    const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
    const filtered = annEntries.filter(([k]) => k !== RDFS_LABEL);
    if (filtered.length > 0) {
      sections.push(section('Annotations', `
        <table>
          ${filtered.map(([prop, vals]) => `
            <tr>
              <td class="prop-iri">${esc(localName(prop))}</td>
              <td>${vals.map(v => `<span class="ann-value">${esc(v)}</span>`).join('<br>')}</td>
            </tr>
          `).join('')}
        </table>
      `));
    }
  }

  return wrap(sections.join('\n'), iri);
}

// ── Class details ─────────────────────────────────────────────────────────────

function renderExpressionToHtml(
  expr: string,
  model: OntologyModel,
  style: AxiomDisplayStyle,
  lang: string,
): string {
  const BARE_IRI = /https?:\/\/[^\s(),{}]+/g;
  let lastIndex = 0;
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  BARE_IRI.lastIndex = 0;
  while ((m = BARE_IRI.exec(expr)) !== null) {
    parts.push(esc(expr.slice(lastIndex, m.index)));
    let display: string;
    if (style === 'fullIri') {
      display = `<${m[0]}>`;
    } else if (style === 'shortIri') {
      display = computeShortIri(m[0], model.metadata.iri);
    } else {
      display = entityDisplayLabel(model, m[0], lang);
    }
    parts.push(iriLink(m[0], display));
    lastIndex = m.index + m[0].length;
  }
  parts.push(esc(expr.slice(lastIndex)));
  return parts.join('');
}

function classDetails(cls: OWLClass, model: OntologyModel, lang: string, axiomStyle: AxiomDisplayStyle = 'label'): string[] {
  const out: string[] = [];

  if (cls.superClassIris.length > 0) {
    out.push(section('SubClassOf', irisTable(cls.superClassIris, model, lang)));
  }
  if (cls.superClassExpressions.length > 0) {
    out.push(section('SubClassOf (expressions)', `
      <ul>${cls.superClassExpressions.map(e =>
        `<li><code>${renderExpressionToHtml(e, model, axiomStyle, lang)}</code></li>`
      ).join('')}</ul>
    `));
  }
  if (cls.equivalentClassIris.length > 0) {
    out.push(section('EquivalentTo', irisTable(cls.equivalentClassIris, model, lang)));
  }
  if (cls.equivalentClassExpressions.length > 0) {
    out.push(section('EquivalentTo (expressions)', `
      <ul>${cls.equivalentClassExpressions.map(e =>
        `<li><code>${renderExpressionToHtml(e, model, axiomStyle, lang)}</code></li>`
      ).join('')}</ul>
    `));
  }
  if (cls.disjointClassIris.length > 0) {
    out.push(section('DisjointWith', irisTable(cls.disjointClassIris, model, lang)));
  }

  // Direct subclasses
  const subs = [...model.classes.values()].filter(c => c.superClassIris.includes(cls.iri));
  if (subs.length > 0) {
    out.push(section(`Direct Subclasses (${subs.length})`, irisTable(subs.map(c => c.iri), model, lang)));
  }

  return out;
}

// ── Object property details ───────────────────────────────────────────────────

function objectPropertyDetails(p: OWLObjectProperty, model: OntologyModel, lang: string): string[] {
  const out: string[] = [];
  const chars: string[] = [];
  if (p.isTransitive)          { chars.push('Transitive'); }
  if (p.isSymmetric)           { chars.push('Symmetric'); }
  if (p.isFunctional)          { chars.push('Functional'); }
  if (p.isInverseFunctional)   { chars.push('InverseFunctional'); }
  if (chars.length > 0) {
    out.push(section('Characteristics', chars.map(c => `<span class="badge">${c}</span>`).join(' ')));
  }
  if (p.domainIris.length > 0)  { out.push(section('Domain', irisTable(p.domainIris, model, lang))); }
  if (p.rangeIris.length > 0)   { out.push(section('Range',  irisTable(p.rangeIris, model, lang))); }
  if (p.inverseOfIri)           { out.push(section('InverseOf', irisTable([p.inverseOfIri], model, lang))); }
  if (p.superPropertyIris.length > 0) {
    out.push(section('SubPropertyOf', irisTable(p.superPropertyIris, model, lang)));
  }
  return out;
}

// ── Data property details ─────────────────────────────────────────────────────

function dataPropertyDetails(p: OWLDataProperty, model: OntologyModel, lang: string): string[] {
  const out: string[] = [];
  if (p.isFunctional) { out.push(section('Characteristics', '<span class="badge">Functional</span>')); }
  if (p.domainIris.length > 0) { out.push(section('Domain', irisTable(p.domainIris, model, lang))); }
  if (p.rangeIris.length > 0)  { out.push(section('Range',  irisTable(p.rangeIris, model, lang))); }
  if (p.superPropertyIris.length > 0) {
    out.push(section('SubPropertyOf', irisTable(p.superPropertyIris, model, lang)));
  }
  return out;
}

// ── Annotation property details ───────────────────────────────────────────────

function annotationPropertyDetails(p: OWLAnnotationProperty, model: OntologyModel, lang: string): string[] {
  const out: string[] = [];
  if (p.superPropertyIris.length > 0) {
    out.push(section('SubPropertyOf', irisTable(p.superPropertyIris, model, lang)));
  }
  return out;
}

// ── Individual details ────────────────────────────────────────────────────────

function individualDetails(ind: OWLIndividual, model: OntologyModel, lang: string): string[] {
  const out: string[] = [];
  if (ind.classIris.length > 0)  { out.push(section('Types', irisTable(ind.classIris, model, lang))); }
  if (ind.objectPropertyAssertions.length > 0) {
    out.push(section('Object Property Assertions', `
      <table>
        ${ind.objectPropertyAssertions.map(a => `
          <tr>
            <td>${iriLink(a.propertyIri, entityDisplayLabel(model, a.propertyIri, lang))}</td>
            <td>→</td>
            <td>${iriLink(a.targetIri, entityDisplayLabel(model, a.targetIri, lang))}</td>
          </tr>
        `).join('')}
      </table>
    `));
  }
  if (ind.dataPropertyAssertions.length > 0) {
    out.push(section('Data Property Assertions', `
      <table>
        ${ind.dataPropertyAssertions.map(a => `
          <tr>
            <td>${iriLink(a.propertyIri, entityDisplayLabel(model, a.propertyIri, lang))}</td>
            <td>→</td>
            <td><code>${esc(a.value)}</code>${a.datatype ? ` <span class="lang-tag">${esc(localName(a.datatype))}</span>` : ''}</td>
          </tr>
        `).join('')}
      </table>
    `));
  }
  return out;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findEntity(model: OntologyModel, iri: string): OWLEntity | undefined {
  return model.classes.get(iri)
    ?? model.objectProperties.get(iri)
    ?? model.dataProperties.get(iri)
    ?? model.annotationProperties.get(iri)
    ?? model.individuals.get(iri);
}

function entityDisplayLabel(model: OntologyModel, iri: string, lang: string): string {
  const e = findEntity(model, iri);
  return e ? getLabel(e, lang) : localName(iri);
}

function localName(iri: string): string {
  const h = iri.lastIndexOf('#');
  const s = iri.lastIndexOf('/');
  const pos = Math.max(h, s);
  return pos >= 0 ? iri.slice(pos + 1) : iri;
}

function typeOf(e: OWLEntity): string {
  switch (e.type) {
    case 'class':               return 'Class';
    case 'objectProperty':      return 'Object Property';
    case 'dataProperty':        return 'Data Property';
    case 'annotationProperty':  return 'Annotation Property';
    case 'individual':          return 'Named Individual';
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function iriLink(iri: string, label: string): string {
  return `<a href="#" onclick="navigate(${JSON.stringify(iri)});return false;">${esc(label)}</a>`;
}

function irisTable(iris: string[], model: OntologyModel, lang: string): string {
  return `<table>${iris.map(iri => `
    <tr>
      <td>${iriLink(iri, entityDisplayLabel(model, iri, lang))}</td>
      <td class="iri-cell"><code>${esc(iri)}</code></td>
    </tr>
  `).join('')}</table>`;
}

function section(title: string, body: string): string {
  return `
    <div class="section">
      <h2>${esc(title)}</h2>
      <div class="section-body">${body}</div>
    </div>
  `;
}

// ── HTML wrapper ──────────────────────────────────────────────────────────────

function wrap(content: string, iri = ''): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  :root {
    --bg:      var(--vscode-editor-background, #1e1e1e);
    --fg:      var(--vscode-editor-foreground, #d4d4d4);
    --link:    var(--vscode-textLink-foreground, #4fc1ff);
    --border:  var(--vscode-panel-border, #444);
    --code-bg: var(--vscode-textCodeBlock-background, #2d2d2d);
    --h2-fg:   var(--vscode-sideBarSectionHeader-foreground, #bbb);
    --badge-bg:var(--vscode-badge-background, #4d4d4d);
    --badge-fg:var(--vscode-badge-foreground, #fff);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family, sans-serif);
         font-size: var(--vscode-font-size, 13px);
         background: var(--bg); color: var(--fg);
         padding: 16px; max-width: 900px; }

  .header { margin-bottom: 20px; }
  h1 { font-size: 1.4em; margin: 6px 0 8px; font-weight: 600; }
  h2 { font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.06em;
       color: var(--h2-fg); margin-bottom: 8px; }

  .type-badge {
    display: inline-block; padding: 2px 8px; border-radius: 3px;
    font-size: 0.78em; font-weight: 600; letter-spacing: 0.04em;
    background: var(--badge-bg); color: var(--badge-fg);
  }
  .type-badge.class               { background: #1a5ea8; color: #d0e8ff; }
  .type-badge.objectProperty      { background: #7a4800; color: #ffd9a0; }
  .type-badge.dataProperty        { background: #1a6e3a; color: #a8ffc4; }
  .type-badge.annotationProperty  { background: #5a2a88; color: #e0c4ff; }
  .type-badge.individual          { background: #7a7a00; color: #ffffa0; }

  .iri-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
  .iri { font-size: 0.8em; background: var(--code-bg); padding: 2px 6px;
         border-radius: 3px; word-break: break-all; }
  button { padding: 2px 8px; cursor: pointer; border: 1px solid var(--border);
           background: var(--badge-bg); color: var(--fg);
           border-radius: 3px; font-size: 0.78em; }
  button:hover { opacity: 0.8; }

  .section { margin-bottom: 18px; border-top: 1px solid var(--border); padding-top: 14px; }
  .section-body { padding-left: 4px; }

  table { border-collapse: collapse; width: 100%; }
  td { padding: 3px 8px; vertical-align: top; }
  td:first-child { white-space: nowrap; }
  tr:hover td { background: rgba(255,255,255,0.04); }

  .lang-tag { font-size: 0.78em; opacity: 0.7; background: var(--code-bg);
              padding: 1px 4px; border-radius: 2px; }
  .prop-iri { font-size: 0.82em; opacity: 0.75; }
  .iri-cell code { font-size: 0.78em; opacity: 0.55; }
  .ann-value { font-size: 0.9em; }
  code { background: var(--code-bg); padding: 1px 4px; border-radius: 2px;
         font-family: var(--vscode-editor-font-family, monospace); }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 0.8em;
           background: var(--badge-bg); color: var(--badge-fg); margin-right: 4px; }
  ul { padding-left: 18px; }
  li { margin: 3px 0; }
  .empty { opacity: 0.6; font-style: italic; }
</style>
</head>
<body>
${content}
<script>
const vscode = acquireVsCodeApi();
function navigate(iri) { vscode.postMessage({ type: 'navigate', iri }); }
function copyIri() {
  navigator.clipboard.writeText(${JSON.stringify(iri)}).then(() => {
    const btn = document.querySelector('button');
    if (btn) { const old = btn.textContent; btn.textContent = '✓ Copied'; setTimeout(() => btn.textContent = old, 1200); }
  });
}
</script>
</body>
</html>`;
}
