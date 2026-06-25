---
revision: 4
date: 2026-06-25T16:02
trigger: "review-feedback"
---

# UI: notebook picker, toggle layout, field layout

## Reason

User feedback during REVIEW:
1. The "插入后打开" toggle in base info section has broken layout.
2. All notebook ID inputs should use a dropdown populated by `lsNotebooks()` instead of raw text input.
3. The "输入字段" section is too wide; each field should wrap into a multi-line card with clear visual separation.

## Changes

### Spec Impact

BC-4 settings panel UX improvement only.

### Design Impact

- `setting.tsx`: load notebooks via `lsNotebooks()` on mount; replace notebook text inputs with SelectInput.
- `setting.tsx`: fix checkbox toggle alignment in SimpleForm base fields.
- `setting.tsx`: render each declared input var as a card with stacked rows (key/label/type, default/options, description) and visual separation.
- `setting.tsx`: daily-note quick-fill reads selected notebook from picker.

### Task Impact

See `tasks.md` Feedback Tasks (UI/UX review 004).
