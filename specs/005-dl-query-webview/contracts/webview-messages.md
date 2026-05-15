# Contract: DL Query Webview Message Protocol

**Interface**: Extension Host (`DLQueryPanel.ts`) ↔ Webview (`DLQueryApp.ts`)  
**Transport**: `postMessage` / `onDidReceiveMessage`  
**TypeScript types in**: `src/views/DLQueryMessages.ts`

---

## Extension → Webview Messages

### `dlQueryResult`
Sent after the Java reasoner returns a successful result.

```typescript
{
  type: 'dlQueryResult';
  groups: {
    queryType: DLQueryType;
    label: string;           // Display label, e.g., "Direct subclasses"
    entities: EntityRef[];
  }[];
}

interface EntityRef {
  iri: string;
  label: string;         // rdfs:label or IRI local name
  entityType: 'class' | 'individual';
}
```

### `dlQueryError`
Sent when the reasoner returns an error or the expression fails syntax pre-check.

```typescript
{
  type: 'dlQueryError';
  message: string;   // Human-readable error text
}
```

### `dlQueryLoading`
Sent immediately when Execute is triggered, before Java responds.

```typescript
{
  type: 'dlQueryLoading';
}
```

### `ontologyStatus`
Sent when the active ontology changes (loaded/unloaded), so the webview can enable/disable the Execute button.

```typescript
{
  type: 'ontologyStatus';
  hasOntology: boolean;
}
```

---

## Webview → Extension Messages

### `execute`
Sent when the user clicks Execute.

```typescript
{
  type: 'execute';
  classExpression: string;
  queryTypes: DLQueryType[];
}
```

### `navigate`
Sent when the user clicks an entity in the results list.

```typescript
{
  type: 'navigate';
  iri: string;
  entityType: 'class' | 'individual';
}
```

### `ready`
Sent once when the webview script has loaded and is ready to receive messages.

```typescript
{
  type: 'ready';
}
```

---

## Discriminated Union Types

```typescript
// src/views/DLQueryMessages.ts

export type DLQueryExtToWebview =
  | { type: 'dlQueryResult'; groups: ResultGroup[] }
  | { type: 'dlQueryError';  message: string }
  | { type: 'dlQueryLoading' }
  | { type: 'ontologyStatus'; hasOntology: boolean };

export type DLQueryWebviewToExt =
  | { type: 'execute'; classExpression: string; queryTypes: DLQueryType[] }
  | { type: 'navigate'; iri: string; entityType: 'class' | 'individual' }
  | { type: 'ready' };
```
