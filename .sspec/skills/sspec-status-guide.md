---
skill: sspec-status-guide
description: Status definitions, transition rules, validation criteria, and edge case handling
---

# SSPEC Status Guide

## Change Status Definitions

### PLANNING
**Meaning**: Defining scope, approach, and creating task plan.

**Agent actions**:
- Fill spec.md sections A, B, C
- Break down into tasks in tasks.md
- Get user approval before moving to DOING

**Exit criteria**:
- spec.md sections A-C complete
- tasks.md has executable tasks with verification
- User approves plan

---

### DOING
**Meaning**: Implementation in progress.

**Agent actions**:
- Execute tasks from tasks.md
- Update progress regularly
- Update handover.md at session end

**Exit criteria**:
- All tasks marked `[x]`, OR
- Hit blocker → BLOCKED, OR
- Implementation complete → REVIEW

---

### BLOCKED
**Meaning**: Waiting on external dependency or unresolved issue.

**Agent actions**:
- Document blocker in spec.md section D with:
  - What's blocked
  - Why (missing info, external dependency, technical limitation)
  - What's needed to unblock
- Do NOT continue implementation
- Update handover.md with blocker status

**Exit criteria**:
- Blocker resolved → back to DOING
- User decides to pivot → back to PLANNING

---

### REVIEW
**Meaning**: Implementation complete, awaiting user verification.

**Agent actions**:
- Prepare demo or summary of changes
- Update handover.md with:
  - What was accomplished
  - How to verify
  - Known limitations

**Exit criteria**:
- User accepts → DONE
- User requests changes → back to DOING

---

### DONE
**Meaning**: Completed and verified by user.

**Agent actions**:
- Final handover.md update
- Ready for `sspec archive`

**Exit criteria**:
- User runs `sspec archive <name>`

---

## Status Transitions

### Allowed Transitions
```

PLANNING → DOING (plan approved)
DOING → BLOCKED (hit blocker)
DOING → REVIEW (implementation complete)
BLOCKED → DOING (blocker resolved)
BLOCKED → PLANNING (pivot needed)
REVIEW → DONE (user accepts)
REVIEW → DOING (user requests changes)
Any → PLANNING (major pivot)

```
### Forbidden Transitions

- PLANNING → REVIEW (skip implementation)
- PLANNING → DONE (skip implementation + review)
- DOING → DONE (skip review)
- BLOCKED → DONE (unresolved blocker)

---

## Request Status

| Status | Meaning | Typical Action |
|--------|---------|----------------|
| OPEN | New request, not started | Triage, decide if/when to work |
| DOING | Linked to active change | Update via `sspec request <name> --link <change>` |
| DONE | Completed and delivered | Mark when change archived |

---

## Edge Cases

### Multiple Changes in DOING
**Problem**: Context switching confusion.

**Solution**: Use `@change <name>` to explicitly switch. Update handover for previous change before switching.

---

### BLOCKED but Can Work on Other Parts
**Problem**: Only part of change is blocked.

**Solution**: Break into separate changes. Keep blocked part as BLOCKED, move unblocked to new change.

---

### REVIEW Takes Multiple Sessions
**Problem**: User needs time to verify.

**Solution**: Status stays REVIEW. Handover should note "Awaiting user verification" in Now section.

---

### User Wants to Skip REVIEW
**Problem**: User trusts implementation, wants to mark DONE immediately.

**Solution**: Acceptable for small changes. Agent should still update handover with "User approved without formal review" note.