# Tasks: Clickable URL Links in Annotations

**Input**: Design documents from `specs/004-annotation-url-links/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

No new infrastructure required. `jsdom` is already installed. No new runtime dependencies are added.

---

## Phase 2: Foundational (Red Tests — write ALL before implementing)

**Purpose**: Write failing tests for the core `annotationValueDisplay` module before any implementation. Constitution Principle I is non-negotiable.

**⚠️ CRITICAL**: Confirm EVERY test below FAILS with `npm test -- webview-src/entity-editor/annotationValueDisplay.test.ts` before proceeding to Phase 3.

- [x] T001 Create `webview-src/entity-editor/annotationValueDisplay.test.ts` with `// @vitest-environment jsdom` at the top and the following failing tests for `segmentAnnotationValue` (import from `./annotationValueDisplay`): (a) `'http://example.org'` → `[{type:'url', content:'http://example.org'}]`; (b) `'See http://example.org more'` → `[{type:'text',content:'See '},{type:'url',content:'http://example.org'},{type:'text',content:' more'}]`; (c) `'plain text'` → `[{type:'text',content:'plain text'}]`; (d) empty string → `[{type:'text',content:''}]`; (e) two URLs `'http://a.org and http://b.org'` → three segments with two url entries

- [x] T002 Add failing tests for `createAnnotationDisplayElement` (import from `./annotationValueDisplay`) to `webview-src/entity-editor/annotationValueDisplay.test.ts`: (a) a `url` segment produces an `<a class="annotation-link">` child; (b) clicking that `<a>` calls the `onOpen` callback with the URL and does not navigate (no href-follow); (c) a `text` segment produces a Text node; (d) an `imageUrl` segment produces both an `<a class="annotation-link">` and an `<img class="annotation-image-preview">` in the returned element

- [x] T003 Add failing tests for image-URL detection in `segmentAnnotationValue` to `webview-src/entity-editor/annotationValueDisplay.test.ts`: (a) `'http://example.org/img.png'` → `[{type:'imageUrl',content:'...'}]`; (b) `'http://example.org/img.PNG'` → `imageUrl` (case-insensitive); (c) `'http://example.org/img.jpg'` → `imageUrl`; (d) `'http://example.org/img.jpeg?size=100'` → `imageUrl` (query string present); (e) `'http://example.org/img.gif'` → `imageUrl`; (f) `'http://example.org/img.svg'` → `imageUrl`; (g) `'http://example.org/img.webp'` → `imageUrl`; (h) `'http://example.org/page.html'` → `url` (not imageUrl)

**Checkpoint**: Run `npm test -- webview-src/entity-editor/annotationValueDisplay.test.ts`. ALL tests must FAIL (module does not exist yet). Do not proceed until confirmed.

---

## Phase 3: User Story 1 — URL Values Open in Browser (Priority: P1) 🎯 MVP

**Goal**: Annotation rows display a linkified div (display mode). Clicking a URL opens the default browser.

**Independent Test**: Open any entity with a `rdfs:seeAlso` annotation whose value is a URL. The annotation panel shows the URL as an underlined link. Clicking it opens the URL in the browser. Non-URL values render as plain text, indistinguishable from current behaviour.

### Implementation for User Story 1

- [x] T004 [US1] Create `webview-src/entity-editor/annotationValueDisplay.ts` exporting `AnnotationValueSegment` type (`{ type: 'text' | 'url' | 'imageUrl'; content: string }`) and two functions: `segmentAnnotationValue(value: string): AnnotationValueSegment[]` (uses regex `/https?:\/\/[^\s"<>[\]()]+/g`, strips trailing `.,:;!?)` chars from each match, classifies image URLs via `/\.(?:png|jpe?g|gif|svg|webp)(?:[?#]|$)/i`) and `createAnnotationDisplayElement(value: string, onOpen: (url: string) => void): HTMLElement` (returns `<div class="annotation-value-display">` built from segments: Text nodes for `text`, `<a class="annotation-link" href="#">` with click handler `e.preventDefault(); onOpen(segment.content)` for `url`/`imageUrl`, and additionally `<img class="annotation-image-preview" src="{url}" alt="" loading="lazy">` with `img.addEventListener('error', () => { img.style.display = 'none'; })` for `imageUrl` segments). This task makes T001–T003 pass.

- [x] T005 [P] [US1] Add `export interface OpenExternalMessage { type: 'openExternal'; url: string }` to `src/views/EntityEditorMessages.ts` and add `| OpenExternalMessage` to the `EntityEditorWebviewToExt` union (after the `FocusEntityMessage` line).

- [x] T006 [P] [US1] Add a `case 'openExternal':` branch to the `handleMessage` switch in `src/views/EntityEditorPanel.ts` (inside the function called around line 139): `await vscode.env.openExternal(vscode.Uri.parse(message.url)); return;`. No response message is needed.

- [x] T007 [US1] In `renderAnnotationsSection` in `webview-src/entity-editor/EntityEditorApp.ts`, add `import { createAnnotationDisplayElement } from './annotationValueDisplay';` at the top of the file; then in the per-row loop (Col 3), after creating the `valueWidget` via `createValueWidget`, also create `const displayDiv = createAnnotationDisplayElement(entry.value, (url) => vscode.postMessage({ type: 'openExternal', url }));`; set `valueWidget.style.display = 'none'`; append both `displayDiv` and `valueWidget` to `tdValue` (display div first). Rows now start in display mode showing linkified content.

- [x] T008 [US1] Add the following CSS rules to the inline `<style>` block in `webview-src/entity-editor/EntityEditorApp.ts` (after the `textarea.annotation-value-input` rule): `.annotation-value-display { cursor: text; padding: 3px 6px; min-height: 1.5em; white-space: pre-wrap; word-break: break-all; }` and `.annotation-link { color: var(--vscode-textLink-foreground); text-decoration: underline; cursor: pointer; }` and `.annotation-image-preview { display: block; max-width: 100%; max-height: 200px; margin-top: 4px; }`.

**Checkpoint**: `npm test` passes. Annotation rows display linkified content. Clicking a URL opens the browser. Clicking the text area of the row does nothing yet (edit mode not wired).

---

## Phase 4: User Story 2 — Display/Edit Mode Toggle (Priority: P2)

**Goal**: Clicking the display div (non-link area) enters edit mode showing the raw text widget. Blurring the widget returns to display mode, refreshing the linkified view.

**Independent Test**: Click an annotation row's text area. The edit widget (input/textarea) becomes visible. Edit the value, then click elsewhere. The row reverts to display mode with the updated value linkified.

### Implementation for User Story 2

- [x] T009 [US2] In the per-row loop inside `renderAnnotationsSection` in `webview-src/entity-editor/EntityEditorApp.ts`, after appending `displayDiv` and `valueWidget` to `tdValue`, add a click handler to `displayDiv`: `displayDiv.addEventListener('click', (e) => { const t = e.target as HTMLElement; if (t.tagName === 'A' || t.tagName === 'IMG') return; displayDiv.style.display = 'none'; valueWidget.style.display = ''; (valueWidget as HTMLElement).focus(); });`. Add a blur handler to `valueWidget` (cast to `HTMLElement`): `(valueWidget as HTMLElement).addEventListener('blur', () => { valueWidget.style.display = 'none'; const fresh = createAnnotationDisplayElement(annotationState[i].value, (url) => vscode.postMessage({ type: 'openExternal', url })); fresh.addEventListener('click', /* same handler as displayDiv above */); tdValue.replaceChild(fresh, displayDiv); (displayDiv as unknown as { _ref: HTMLElement })._ref = fresh; displayDiv.style.display = ''; });` — **NOTE**: to avoid capturing a stale `displayDiv` reference, use a mutable wrapper variable per row: `let currentDisplay = displayDiv;` and in the blur handler replace via `currentDisplay.replaceWith(fresh); currentDisplay = fresh;` and re-attach click handler to `fresh`.

**Checkpoint**: `npm test` passes. Click-to-edit and blur-to-display work. Links are not affected by the toggle. Saving the entity preserves the edited value.

---

## Phase 5: User Story 3 — Inline Image Preview (Priority: P3)

**Goal**: Annotation values that are image URLs show an inline `<img>` preview below the link. Unreachable images are silently hidden. Clicking the image opens the URL in the browser.

**Independent Test**: Add an annotation with value `https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/320px-Cat03.jpg`. The annotation panel shows the URL as a link AND renders the image inline below it.

### Implementation for User Story 3

- [x] T010 [US3] In `src/views/EntityEditorPanel.ts`, locate the CSP `Content-Security-Policy` meta tag in `buildHtml` (around line 652). Change `img-src ${webview.cspSource} data:;` to `img-src ${webview.cspSource} data: https:;`. This allows the webview to load external HTTPS images for inline preview. (The `annotationValueDisplay.ts` already emits `<img>` tags for imageUrl segments from T004; this task enables them to load.)

**Checkpoint**: `npm test` passes. Image-URL annotation values show an inline preview. Unreachable images are silently hidden (onerror handler from T004). Clicking the image opens the URL in the browser.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T011 [P] Run `npm run compile:webview` and confirm zero TypeScript errors across all modified webview files (`EntityEditorApp.ts`, `annotationValueDisplay.ts`)

- [x] T012 [P] Run `npm run compile` and confirm zero TypeScript errors in `src/views/EntityEditorMessages.ts` and `src/views/EntityEditorPanel.ts`

- [x] T013 Run `npm test` and confirm all tests pass, including the new tests in `webview-src/entity-editor/annotationValueDisplay.test.ts`

- [x] T014 Run `npm run build` and confirm the bundle builds without errors (all 6 bundles, especially `entity-editor-webview.js`)

- [x] T015 c3acd67 Manual verification in VS Code per all 7 scenarios in `specs/004-annotation-url-links/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks — proceed immediately to Phase 2
- **Foundational (Phase 2)**: No dependencies — start immediately; BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 (tests written and failing)
- **User Story 2 (Phase 4)**: Depends on Phase 3 (display mode must exist before toggle can be wired)
- **User Story 3 (Phase 5)**: Depends on Phase 3 (annotationValueDisplay.ts must exist with imageUrl support)
- **Polish (Phase 6)**: Depends on Phases 3–5

### User Story Dependencies

- **US1 (P1)**: Depends only on Phase 2 (foundational tests)
- **US2 (P2)**: Depends on US1 (`displayDiv` and `valueWidget` must be in the DOM from T007)
- **US3 (P3)**: Depends on US1 (`annotationValueDisplay.ts` already emits `<img>` from T004; only CSP change needed)

### Within Each Phase

- T001 → T002 → T003 (build test file incrementally; all in same file)
- T005 and T006 can run in parallel with each other (different files); both can run in parallel with T004 (different files)
- T007 depends on T004 (must import `createAnnotationDisplayElement`)
- T008 is independent of T007 (CSS only; can run in parallel)
- T011 and T012 can run in parallel

### Parallel Opportunities

```bash
# Phase 3 parallelism (after T004):
T005: Add OpenExternalMessage to EntityEditorMessages.ts
T006: Handle openExternal in EntityEditorPanel.ts
# T005 and T006 can run in parallel with T004 (different files)

# Phase 6 parallelism:
T011: npm run compile:webview
T012: npm run compile
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Write all failing tests — CONFIRM they fail
2. Complete Phase 3: Implement `annotationValueDisplay.ts` + message type + panel handler + EntityEditorApp display mode + CSS
3. **STOP and VALIDATE**: `npm test` passes; URLs in annotation panel are clickable links; browser opens on click
4. Ship Phase 3 as MVP — this alone covers FR-001, FR-002, FR-003, FR-006, FR-007, FR-008

### Incremental Delivery

1. Phase 2 → Red tests in place
2. Phase 3 → US1 (link rendering, browser open) — independently testable MVP
3. Phase 4 → US2 (click-to-edit, blur-to-display) — extends US1 smoothly
4. Phase 5 → US3 (image preview, CSP extension) — independent CSP + onerror extension
5. Phase 6 → Build validation + manual verification

---

## Notes

- [P] tasks = different files, no dependencies on other in-progress tasks
- T009 (display/edit toggle) is the most complex task — use a `let currentDisplay` mutable reference per row to avoid stale closure over the replaced `<div>`
- T004 already includes the `onerror` handler for images; T010 is only a one-line CSP change
- Avoid: touching the parser, serializer, or sync layers — no changes are needed there
- Avoid: adding network calls to the extension host; image loading is handled entirely by the webview `<img>` element
