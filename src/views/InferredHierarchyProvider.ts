import * as vscode from 'vscode';
import type { OntologyModel } from '../model/OntologyModel';
import { getLabel } from '../model/OntologyModel';

const OWL_THING = 'http://www.w3.org/2002/07/owl#Thing';

export class InferredClassTreeItem extends vscode.TreeItem {
  constructor(
    public readonly iri: string,
    label: string,
    hasChildren: boolean,
  ) {
    super(label, hasChildren
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None);
    this.id = `inferred:${iri}`;
    this.tooltip = iri;
    this.contextValue = 'owlEntity';
    this.iconPath = new vscode.ThemeIcon('symbol-class');
    this.description = '(inferred)';
  }
}

export class InferredHierarchyProvider implements vscode.TreeDataProvider<InferredClassTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<InferredClassTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private model: OntologyModel | undefined;
  private preferredLang = 'en';
  private readonly collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  /** parent IRI → child IRIs pre-sorted by label */
  private sortedSubClasses = new Map<string, string[]>();
  /** child IRI → first parent IRI (for getParent) */
  private childToParent = new Map<string, string>();

  setModel(model: OntologyModel, preferredLang = 'en'): void {
    this.model = model;
    this.preferredLang = preferredLang;
    this.buildSortedIndex();
    this._onDidChangeTreeData.fire();
  }

  private buildSortedIndex(): void {
    this.sortedSubClasses.clear();
    this.childToParent.clear();
    if (!this.model?.isClassified) { return; }
    for (const [parent, children] of this.model.inferredSubClasses) {
      const sorted = [...children].sort((a, b) => {
        const ca = this.model!.classes.get(a);
        const cb = this.model!.classes.get(b);
        return this.collator.compare(
          ca ? getLabel(ca, this.preferredLang) : a,
          cb ? getLabel(cb, this.preferredLang) : b,
        );
      });
      this.sortedSubClasses.set(parent, sorted);
      for (const child of children) {
        if (!this.childToParent.has(child)) {
          this.childToParent.set(child, parent);
        }
      }
    }
  }

  refresh(): void {
    this.buildSortedIndex();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: InferredClassTreeItem): vscode.TreeItem {
    return element;
  }

  getParent(element: InferredClassTreeItem): InferredClassTreeItem | undefined {
    if (!this.model?.isClassified) { return undefined; }
    const parentIri = this.childToParent.get(element.iri);
    if (!parentIri || parentIri === OWL_THING) { return undefined; }
    const cls = this.model.classes.get(parentIri);
    const label = cls ? getLabel(cls, this.preferredLang) : parentIri;
    return new InferredClassTreeItem(parentIri, label, (this.sortedSubClasses.get(parentIri)?.length ?? 0) > 0);
  }

  makeItem(iri: string): InferredClassTreeItem | undefined {
    if (!this.model?.isClassified) { return undefined; }
    const cls = this.model.classes.get(iri);
    if (!cls) { return undefined; }
    return new InferredClassTreeItem(iri, getLabel(cls, this.preferredLang), (this.sortedSubClasses.get(iri)?.length ?? 0) > 0);
  }

  getChildren(element?: InferredClassTreeItem): InferredClassTreeItem[] {
    if (!this.model?.isClassified) { return []; }
    const parentIri = element?.iri ?? OWL_THING;
    const childIris = this.sortedSubClasses.get(parentIri) ?? [];
    return childIris.map(iri => {
      const cls = this.model!.classes.get(iri);
      const label = cls ? getLabel(cls, this.preferredLang) : iri;
      const hasChildren = (this.sortedSubClasses.get(iri)?.length ?? 0) > 0;
      return new InferredClassTreeItem(iri, label, hasChildren);
    });
  }
}
