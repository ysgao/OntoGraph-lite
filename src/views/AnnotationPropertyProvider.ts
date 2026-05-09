import * as vscode from 'vscode';
import type { OntologyModel } from '../model/OntologyModel';
import { getLabel } from '../model/OntologyModel';

const TOP_ANNOTATION_PROPERTY = 'http://www.w3.org/2002/07/owl#topAnnotationProperty';

export class AnnotationPropertyProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private model: OntologyModel | undefined;
  private childrenOf = new Map<string, string[]>();
  private preferredLang = 'en';
  private readonly icon = new vscode.ThemeIcon('tag');
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
    for (const prop of this.model.annotationProperties.values()) {
      const parents = prop.superPropertyIris.length > 0
        ? prop.superPropertyIris
        : [TOP_ANNOTATION_PROPERTY];
      for (const parent of parents) {
        const siblings = this.childrenOf.get(parent) ?? [];
        siblings.push(prop.iri);
        this.childrenOf.set(parent, siblings);
      }
    }
    for (const [, children] of this.childrenOf) {
      children.sort((a, b) => {
        const pa = this.model!.annotationProperties.get(a);
        const pb = this.model!.annotationProperties.get(b);
        return this.collator.compare(
          pa ? getLabel(pa, this.preferredLang) : a,
          pb ? getLabel(pb, this.preferredLang) : b,
        );
      });
    }
  }

  refresh(): void { this._onDidChangeTreeData.fire(); }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

  getChildren(element?: vscode.TreeItem & { iri?: string }): vscode.TreeItem[] {
    if (!this.model) { return []; }
    const parentIri = (element as { iri?: string } | undefined)?.iri ?? TOP_ANNOTATION_PROPERTY;
    const childIris = this.childrenOf.get(parentIri) ?? [];
    return childIris.map(iri => {
      const prop = this.model!.annotationProperties.get(iri);
      const label = prop ? getLabel(prop, this.preferredLang) : iri;
      const hasChildren = (this.childrenOf.get(iri)?.length ?? 0) > 0;
      const item = Object.assign(
        new vscode.TreeItem(label, hasChildren
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None),
        { iri }
      );
      item.tooltip = iri;
      item.contextValue = 'owlEntity';
      item.iconPath = this.icon;
      return item;
    });
  }
}
