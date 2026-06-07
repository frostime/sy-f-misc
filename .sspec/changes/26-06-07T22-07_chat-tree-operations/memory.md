# Memory: chat-tree-operations

**Updated**: 2026-06-07T22:08+08:00

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/SiYuanDevelopment/sy-f-misc`
- Branch: `main`
- HEAD: `6925b258124ced873222822848a669cb8e5fb0c5`
- Worktree: `clean`
- Status Snapshot: raw `git status --short --branch` output

```text
## main...origin/main
```

## State

Design approved; plan initialized. Working branch is `feat/chat-tree-operations`. Next step: enter `sspec-implement` if user wants implementation to proceed.

## Key Files

- `src/func/gpt/chat/ChatSession/world-tree/chat-world-tree.html` — HSPA tree viewer; target for operation-mode UI and extract-subtree selection/preview.
- `src/func/gpt/chat/ChatSession/world-tree/index.ts` — Opens tree dialog and injects flat `customSdk`; target for extractSubtree SDK bridge.
- `src/func/gpt/chat/ChatSession/use-tree-model.ts` — Owns V2 tree data and serialization; target for subtree copy/crop algorithm.
- `src/func/gpt/chat/ChatSession/use-chat-session.ts` — Owns session metadata/history builder; target for extracted history wrapper.
- `src/func/gpt/chat/main.tsx` — Owns current ChatSession open/switch behavior; target for applying extracted session.

## Knowledge

- [2026-06-07T22:07+08:00] Decision User clarified extraction is true subtree copy: choose start root plus multiple leaves/paths, copy the induced subtree structure into a new independent conversation.
- [2026-06-07T22:07+08:00] Decision Extraction result opens in the current ChatSession, matching existing selected-message extraction behavior.
- [2026-06-07T22:07+08:00] Constraint UI entry is the existing `world-tree` HSPA page node-detail panel; user wants a future-extensible tree operation UX, not a one-off extract button.
- [2026-06-07T22:07+08:00] Gotcha HSPA `customSdk` is flat-merged into `window.pluginSdk`; HTML must call `pluginSdk.extractSubtree(...)`, not `pluginSdk.customSdk.extractSubtree(...)`.
- [2026-06-07T22:07+08:00] Rejected Linear thread extraction is insufficient because the requested operation must preserve selected subtree shape across multiple leaf paths.
- [2026-06-07T22:08+08:00] Decision User approved design and requested WIP branch development mode using a `feat/...` branch; branch created as `feat/chat-tree-operations`.

## Milestones

- [2026-06-07T22:07+08:00] Created change `26-06-07T22-07_chat-tree-operations` and drafted spec.md/design.md for alignment.
- [2026-06-07T22:08+08:00] Design approved, branch `feat/chat-tree-operations` created, and tasks.md initialized.
