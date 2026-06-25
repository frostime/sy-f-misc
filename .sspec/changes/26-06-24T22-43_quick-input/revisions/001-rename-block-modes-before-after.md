---
revision: 1
date: 2026-06-25T00:55:03
trigger: "correction"
---

# rename block modes before-after

## Reason

Implementation planning exposed an ambiguity: SiYuan `insertBlock(dataType, data, nextID?, previousID?, parentID?)` uses `nextID=anchor` to insert **before** anchor and `previousID=anchor` to insert **after** anchor. The planned schema/UI modes `next`/`prev` would invite reversed interpretation.

User confirmed renaming sibling modes before implementation.

## Changes

### Spec Impact

BC-3 and scope logically change block mode vocabulary:

```text
old: append / prepend / next / prev
new: append / prepend / before / after
```

Behavior:

```text
append  = as last child of anchor
prepend = as first child of anchor
before  = previous sibling of anchor (insertBlock nextID=anchor)
after   = next sibling of anchor (insertBlock previousID=anchor)
```

### Design Impact

`InsertMode` becomes:

```typescript
type InsertMode = 'append' | 'prepend' | 'before' | 'after';
```

Mode mapping in engine:

| mode | API |
|---|---|
| append | `appendBlock('markdown', md, parentID=anchorId)` |
| prepend | `prependBlock('markdown', md, parentID=anchorId)` |
| before | `insertBlock('markdown', md, nextID=anchorId)` |
| after | `insertBlock('markdown', md, undefined, previousID=anchorId)` |

### Task Impact

`tasks.md` Phase 0/2/4/User Check updated to use `before/after` wording and static checks.
