---
name: chat-tree-operations
status: DOING
change-type: single
created: 2026-06-07T22:07:49
reference: null
---

# chat-tree-operations

## Problem Statement

Current `Chat Tree` can inspect nodes and switch worldlines, but it has no reusable operation workflow for tree-shaped actions. This blocks the first requested operation: selecting a subtree by `start root + multiple leaves/paths` and extracting the copied subtree as an independent chat session.

User need: make the tree page support interactive, future-extensible tree operations, with `extract subtree` as the first operation. The extracted session MUST preserve the selected subtree structure, not flatten it to a single thread.

## Proposed Solution

### Approach

Introduce a reusable operation-mode UX in the existing `world-tree` HSPA page. Default mode remains node inspection. Entering an operation changes node-click behavior, shows operation state in the side panel, previews affected nodes/edges, and confirms through a single SDK action.

Implement subtree extraction in the TypeScript data layer, not in HTML. The HSPA page only selects `rootId + leafIds` and previews the affected set from tree data. `use-tree-model.ts` performs validation, copies/crops the subtree, regenerates IDs, rebuilds `parent/children`, and returns a V2 history-compatible tree. `ChatSession` wraps this as a new independent session and the caller opens it in the current chat session.

This keeps the first operation small while avoiding a one-off UI. Future operations such as delete subtree, compare branches, bookmark, or merge branch can reuse the same mode/panel/preview pattern.

### Key Change

**Feat A: Tree operation mode UX**
- Add an operation-mode state model to `chat-world-tree.html`.
- Preserve default inspect behavior.
- Add `extract-subtree` mode with root selection, multi-leaf selection, preview, confirm, and cancel.

**Feat B: Subtree extraction algorithm**
- Add treeModel-level extraction that accepts `rootId` and optional `leafIds`.
- `leafIds` empty/undefined means copy the full subtree under `rootId`.
- `leafIds` present means copy the union of all `rootId → leafId` paths, preserving the minimal subtree induced by those paths.
- Regenerate node IDs and rebuild tree links in the copied history.

**Feat C: Session-level extraction API**
- Add a `useSession` method that creates a complete `IChatSessionHistoryV2` from extracted tree data and current session metadata.
- Expose this operation through `showChatWorldTree` as a narrow callback/SDK method rather than passing the full session into the HSPA page.

**Feat D: Current-session open behavior**
- On extract confirmation, save the current session if needed, create a new session, apply extracted history, reset input/scroll state, and close the tree dialog.

### Scope Summary

| File | Change |
|---|---|
| `src/func/gpt/chat/ChatSession/world-tree/chat-world-tree.html` | Add reusable operation-mode UI state, extract-subtree controls, multi-leaf selection, and preview highlighting. |
| `src/func/gpt/chat/ChatSession/world-tree/index.ts` | Extend `customSdk` with `extractSubtree({ rootId, leafIds })`; keep existing `getTreeData`, `getFullContent`, `switchWorldLine`. |
| `src/func/gpt/chat/ChatSession/use-tree-model.ts` | Add subtree extraction/copy helper and interface entry. |
| `src/func/gpt/chat/ChatSession/use-chat-session.ts` | Wrap treeModel extraction into a session-level `IChatSessionHistoryV2` builder. |
| `src/func/gpt/chat/main.tsx` | Pass extract callback to `showChatWorldTree`; open the extracted history in the current ChatSession. |

What stays unchanged:
- Existing V2 history schema.
- Existing message rendering UI.
- Existing worldline switch behavior.
- Existing `SessionItemsManager` linear selected-message extraction.

### Design Reference

→ See [design.md](./design.md)
