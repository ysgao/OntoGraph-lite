import * as vscode from 'vscode';
import type { OntologyModel } from '../model/OntologyModel';
import { getLabel } from '../model/OntologyModel';

const OWL_THING = 'http://www.w3.org/2002/07/owl#Thing';

export class ClassTreeItem extends vscode.TreeItem {
  constructor(
    public readonly iri: string,
    label: string,
    hasChildren: boolean,
    public readonly isRoot = false,
    autoExpand = false,
  ) {
    super(label, hasChildren
      ? (autoExpand ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed)
      : vscode.TreeItemCollapsibleState.None);
    this.id = `class:${iri}`;
    this.tooltip = iri;
    this.contextValue = 'owlEntity';
    this.iconPath = new vscode.ThemeIcon('symbol-class');
  }
}

export class ClassHierarchyProvider implements vscode.TreeDataProvider<ClassTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ClassTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private model: OntologyModel | undefined;
  /** parent IRI → child IRIs (asserted, pre-sorted by label) */
  private childrenOf = new Map<string, string[]>();
  private preferredLang = 'en';
  private readonly collator = new Intl.Collator(undefined, { sensitivity: 'base' });

  setModel(model: OntologyModel, preferredLang = 'en'): void {
    this.model = model;
    this.preferredLang = preferredLang;
    this.buildIndex();
    this._onDidChangeTreeData.fire();
  }

  private buildIndex(): void {
    this.childrenOf.clear();
    if (!this.model) { return; }
    for (const cls of this.model.classes.values()) {
      const parents = cls.superClassIris.length > 0 ? cls.superClassIris : [OWL_THING];
      for (const parent of parents) {
        const siblings = this.childrenOf.get(parent) ?? [];
        siblings.push(cls.iri);
        this.childrenOf.set(parent, siblings);
      }
    }
    for (const [, children] of this.childrenOf) {
      children.sort((a, b) => {
        const la = this.model!.classes.get(a);
        const lb = this.model!.classes.get(b);
        return this.collator.compare(
          la ? getLabel(la, this.preferredLang) : a,
          lb ? getLabel(lb, this.preferredLang) : b,
        );
      });
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ClassTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ClassTreeItem): ClassTreeItem[] {
    if (!this.model) { return []; }

    // No element → return owl:Thing as the single visible root (auto-expanded)
    if (!element) {
      const childCount = (this.childrenOf.get(OWL_THING)?.length ?? 0);
      return [new ClassTreeItem(OWL_THING, 'owl:Thing', childCount > 0, true, childCount > 0)];
    }

    const childIris = this.childrenOf.get(element.iri) ?? [];
    return childIris.map(iri => {
      const cls = this.model!.classes.get(iri);
      const label = cls ? getLabel(cls, this.preferredLang) : iri;
      const hasChildren = (this.childrenOf.get(iri)?.length ?? 0) > 0;
      return new ClassTreeItem(iri, label, hasChildren);
    });
  }

  getParent(element: ClassTreeItem): ClassTreeItem | undefined {
    if (!this.model) { return undefined; }
    const cls = this.model.classes.get(element.iri);
    if (!cls || cls.superClassIris.length === 0) { return undefined; }
    const parentIri = cls.superClassIris[0];
    const parent = this.model.classes.get(parentIri);
    if (!parent) { return undefined; }
    const label = getLabel(parent, this.preferredLang);
    const hasChildren = (this.childrenOf.get(parentIri)?.length ?? 0) > 0;
    return new ClassTreeItem(parentIri, label, hasChildren);
  }
}
