import * as vscode from 'vscode';
import type { OntologyModel } from '../model/OntologyModel';
import { getLabel } from '../model/OntologyModel';

type IndividualNode =
  | { kind: 'class'; iri: string; label: string; count: number }
  | { kind: 'individual'; iri: string; label: string };

export class IndividualTreeItem extends vscode.TreeItem {
  /** Top-level IRI so context-menu commands (copyIri, showEntityInfo, openGraph) can read it */
  public readonly iri: string;

  constructor(public readonly node: IndividualNode) {
    const isClass = node.kind === 'class';
    super(
      isClass ? `${node.label} (${node.count})` : node.label,
      isClass
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.iri = node.iri;
    this.id = `individual:${node.kind}:${node.iri}`;
    this.tooltip = node.iri;
    this.contextValue = node.kind === 'individual' ? 'owlEntity' : 'owlClassGroup';
    this.iconPath = new vscode.ThemeIcon(isClass ? 'symbol-class' : 'symbol-object');
  }
}

export class IndividualBrowserProvider implements vscode.TreeDataProvider<IndividualTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<IndividualTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private model: OntologyModel | undefined;
  /** class IRI → individual IRIs */
  private byClass = new Map<string, string[]>();
  /** individuals with no class assertion */
  private unclassified: string[] = [];
  private preferredLang = 'en';

  setModel(model: OntologyModel, preferredLang = 'en'): void {
    this.model = model;
    this.preferredLang = preferredLang;
    this.buildIndex();
    this._onDidChangeTreeData.fire();
  }

  private buildIndex(): void {
    this.byClass.clear();
    this.unclassified = [];
    if (!this.model) { return; }
    for (const ind of this.model.individuals.values()) {
      if (ind.classIris.length === 0) {
        this.unclassified.push(ind.iri);
      } else {
        for (const classIri of ind.classIris) {
          const members = this.byClass.get(classIri) ?? [];
          members.push(ind.iri);
          this.byClass.set(classIri, members);
        }
      }
    }
  }

  refresh(): void { this._onDidChangeTreeData.fire(); }

  getTreeItem(element: IndividualTreeItem): vscode.TreeItem { return element; }

  getChildren(element?: IndividualTreeItem): IndividualTreeItem[] {
    if (!this.model) { return []; }

    if (!element) {
      // Top level: one node per class that has individuals
      const items: IndividualTreeItem[] = [];
      for (const [classIri, indIris] of this.byClass) {
        const cls = this.model.classes.get(classIri);
        const label = cls ? getLabel(cls, this.preferredLang) : classIri;
        items.push(new IndividualTreeItem({ kind: 'class', iri: classIri, label, count: indIris.length }));
      }
      if (this.unclassified.length > 0) {
        items.push(new IndividualTreeItem({
          kind: 'class', iri: '_unclassified', label: '(no type)',
          count: this.unclassified.length,
        }));
      }
      return items.sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
    }

    if (element.node.kind === 'class') {
      const indIris = element.node.iri === '_unclassified'
        ? this.unclassified
        : (this.byClass.get(element.node.iri) ?? []);
      return indIris
        .map(iri => {
          const ind = this.model!.individuals.get(iri);
          const label = ind ? getLabel(ind, this.preferredLang) : iri;
          return new IndividualTreeItem({ kind: 'individual', iri, label });
        })
        .sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
    }
    return [];
  }
}
