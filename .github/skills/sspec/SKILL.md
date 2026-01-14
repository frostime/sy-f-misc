---
skill: sspec
version: 1.0.0
description: Status definitions, transition rules, and quality standards for sspec workflow. Use this when new session begin and user ask agent to obey SSPEC protocal, e.g, asked to @change, or @resume etc.
---

# SSPEC Skill

Reference material for status management and quality standards. Consult when uncertain about status meanings, allowed transitions, or handling edge cases.

## Status Definitions

### PLANNING
Defining scope and creating task plan.

**Entry**: New change created, or major pivot from any status.

**Agent actions**:
- Fill spec.md sections A (problem), B (solution), C (strategy)
- Break down into tasks in tasks.md
- Get user approval before proceeding

**Exit criteria**:
- spec.md sections complete
- tasks.md has executable tasks with verification criteria
- User explicitly approves plan

### DOING
Implementation in progress.

**Entry**: User approves plan, or returns from BLOCKED/REVIEW.

**Agent actions**:
- Execute tasks sequentially
- Mark `[x]` only when fully complete and tested
- Update handover.md at session end

**Exit criteria**:
- All tasks done → REVIEW
- Hit blocker → BLOCKED
- Major pivot → PLANNING

### BLOCKED
Waiting on external dependency or unresolved issue.

**Entry**: Cannot proceed without external input.

**Agent actions**:
- Document in spec.md section D: what's blocked, why, what's needed
- Do NOT continue implementation
- Update handover.md with blocker status

**Exit criteria**:
- Blocker resolved → DOING
- User pivots → PLANNING

### REVIEW
Implementation complete, awaiting user verification.

**Entry**: All planned tasks complete.

**Agent actions**:
- Summarize what was accomplished
- Note how to verify and known limitations
- Update handover.md

**Exit criteria**:
- User accepts → DONE
- User requests changes → DOING

### DONE
Completed and verified.

**Entry**: User accepts in REVIEW.

**Next**: User runs `sspec change archive <name>`

---

## Transition Rules

### Allowed
```
PLANNING → DOING       (plan approved)
DOING    → BLOCKED     (hit blocker)
DOING    → REVIEW      (implementation complete)
BLOCKED  → DOING       (blocker resolved)
BLOCKED  → PLANNING    (pivot needed)
REVIEW   → DONE        (user accepts)
REVIEW   → DOING       (changes requested)
Any      → PLANNING    (major pivot)
```

### Forbidden
- PLANNING → REVIEW/DONE (skip implementation)
- DOING → DONE (skip review)
- BLOCKED → DONE (unresolved blocker)

---

## Quality Standards

### Handover Quality

**Bad**: "Worked on auth. Some progress."

**Good**: "Implemented JWT validation middleware in `src/auth/jwt.py`. Unit tests pass. Next: add refresh token logic in `src/auth/refresh.py`."

A good handover enables the next session to start coding within 30 seconds.

### Task Granularity

Each task should:
- Be completable in **< 2 hours**
- Have **verification criteria** (how to know it's done)
- Be **atomic** (can be marked done independently)

If a task is too large, break it down immediately.

### PIVOT Handling

When user fundamentally changes direction:
1. Add marker in spec.md: `<!-- PIVOT: YYYY-MM-DD reason -->`
2. Regenerate tasks.md
3. Document reasoning in handover.md

---

## Edge Cases

### Multiple Changes in DOING
**Problem**: Context switching causes confusion.

**Solution**: Use `@change <name>` to switch explicitly. Before switching, update handover.md for current change.

### Partially BLOCKED
**Problem**: Only part of change is blocked, other parts can continue.

**Solution**: Split into separate changes. Keep blocked portion as BLOCKED, move unblocked work to new change.

### REVIEW Spans Multiple Sessions
**Problem**: User needs time to verify.

**Solution**: Status stays REVIEW. Handover should note "Awaiting user verification" in Now section. Do not proceed until user responds.

### User Wants to Skip REVIEW
**Problem**: User trusts implementation, wants DONE immediately.

**Solution**: Acceptable for small, low-risk changes. Add note in handover: "User approved without formal review."

---

## Request Status

| Status | Meaning | Action |
|--------|---------|--------|
| OPEN | New, not started | Triage and prioritize |
| DOING | Linked to active change | `sspec request <name> --link <change>` |
| DONE | Delivered | Mark when change archived |

