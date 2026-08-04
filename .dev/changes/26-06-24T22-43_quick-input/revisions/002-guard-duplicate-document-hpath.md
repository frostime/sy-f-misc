---
revision: 2
date: 2026-06-25T02:16:55
trigger: "review-feedback"
---

# guard duplicate document hpath

## Reason

Runtime verification report `reference/runtime-verification-report.md` found that SiYuan `createDocWithMd` allows duplicate hpath documents:

```text
1st call: 20260625020834-76ieh91
2nd call: 20260625020840-z8mnqj5
getIDsByHPath: two ids
Behavior: silent duplicate, no error, no overwrite
```

This makes repeated QuickInput document presets silently accumulate duplicates. The original spec delegated same-hpath behavior to the kernel; runtime evidence shows that is user-hostile enough to handle in quick-input.

## Changes

### Spec Impact

BC-2 document execution gains a new user-visible guard:

```text
Before createDocWithMd:
  getIDsByHPath(notebook, hpath)
  if existing ids found:
    confirm whether to create another document at the same hpath
    cancel => abort without error toast
    confirm => createDocWithMd as before
```

### Design Impact

`engine.ts` document branch adds duplicate-hpath guard before insertion.

New internal helper shape:

```typescript
async function confirmDuplicateDocument(hpath: string, count: number): Promise<boolean>;
class QuickInputCancelled extends Error {}
```

`executeTemplate` keeps returning `{ blockId }` on success; cancel rejects with `QuickInputCancelled` and panel catches it without error toast.

### Task Impact

`tasks.md` adds Feedback Task for revision 002:

- Implement duplicate document hpath guard in `engine.ts`
- Update `panel.tsx` to ignore `QuickInputCancelled`
- Verify by `pnpm run type-check` + `pnpm run build`
