import type { EntitySnapshot } from './EntityEditorMessages';

export class EntityEditHistory {
  private readonly undoStack: EntitySnapshot[] = [];
  private readonly redoStack: EntitySnapshot[] = [];
  private current: EntitySnapshot;
  private readonly maxSize: number;

  constructor(initial: EntitySnapshot, maxSize = 50) {
    this.current = initial;
    this.maxSize = maxSize;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get currentSnapshot(): EntitySnapshot { return this.current; }

  recordSave(newSnapshot: EntitySnapshot): void {
    if (this.undoStack.length >= this.maxSize) { this.undoStack.shift(); }
    this.undoStack.push(this.current);
    this.current = newSnapshot;
    this.redoStack.length = 0;
  }

  undo(): EntitySnapshot | undefined {
    if (this.undoStack.length === 0) { return undefined; }
    this.redoStack.push(this.current);
    this.current = this.undoStack.pop()!;
    return this.current;
  }

  redo(): EntitySnapshot | undefined {
    if (this.redoStack.length === 0) { return undefined; }
    this.undoStack.push(this.current);
    this.current = this.redoStack.pop()!;
    return this.current;
  }

  /** Replace current snapshot without touching the undo/redo stacks (used after auto-save). */
  updateCurrentSnapshot(snapshot: EntitySnapshot): void {
    this.current = snapshot;
  }

  clear(newInitial: EntitySnapshot): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.current = newInitial;
  }
}
