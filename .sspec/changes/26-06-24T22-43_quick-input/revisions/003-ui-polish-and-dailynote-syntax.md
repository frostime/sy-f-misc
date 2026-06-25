---
revision: 3
date: 2026-06-25T15:54
trigger: "review-feedback"
---

# UI polish and dailynote inline syntax

## Reason

User feedback during REVIEW:
1. Setting panel right editor overflows and does not scroll correctly.
2. The "插入今日日记" quick-fill button sits in an awkward position next to the mode selector.
3. A help doc button is needed to explain every field.
4. `todayDailynoteId` currently requires a separate `insertTo.notebook` field; user wants inline syntax `${todayDailynoteId:<notebookId>}` and a future notebook picker.

## Changes

### Spec Impact

BC-4 (settings panel) gains help button. BC-3 (block execution) gains inline dailynote notebook syntax.

### Design Impact

- `setting.tsx`: fix layout so right editor scrolls independently; move "插入今日日记" button to top of block-mode section; add help button invoking `documentDialog`.
- `engine.ts`: `todayDailynoteId` resolution supports inline notebook ID: `${todayDailynoteId:20231224140619-bpyuay4}` overrides `insertTo.notebook`.
- New doc: `public/docs/quick-input.md` loaded by help button.

### Task Impact

See `tasks.md` Feedback Tasks (UI/UX review).
