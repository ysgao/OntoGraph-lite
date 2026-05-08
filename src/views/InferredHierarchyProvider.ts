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

  setModel(model: OntologyModel, preferredLang = 'en'): void {
    this.model = model;
    this.preferredLang = preferredLang;
    this._onDidChangeTreeData.fire();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: InferredClassTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: InferredClassTreeItem): InferredClassTreeItem[] {
    if (!this.model?.isClassified) { return []; }
    const parentIri = element?.iri ?? OWL_THING;
    const childIris = [...(this.model.inferredSubClasses.get(parentIri) ?? [])];
    return childIris
      .map(iri => {
        const cls = this.model!.classes.get(iri);
        const label = cls ? getLabel(cls, this.preferredLang) : iri;
        const hasChildren = (this.model!.inferredSubClasses.get(iri)?.size ?? 0) > 0;
        return new InferredClassTreeItem(iri, label, hasChildren);
      })
      .sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
  }
}
