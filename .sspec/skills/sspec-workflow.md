---
skill: sspec-workflow
description: Complete sspec workflow, session patterns, file update timing, and best practices
---

# SSPEC Workflow Guide

## Session Start Patterns

### Pattern 1: Resume Existing Work
```
User: @resume
Agent:

1. Identifies active change (e.g., "add-dark-mode")
2. Reads handover.md → tasks.md → spec.md
3. Outputs: "Resuming add-dark-mode. Status: DOING. Progress: 3/7 tasks.
   Last session: Implemented toggle component.
   Next: Add theme persistence to localStorage."

```
### Pattern 2: Switch Context
```
User: @change payment-refactor
Agent:

1. If exists → loads context
2. If not → creates change, prompts user to fill spec.md
3. Outputs context summary

```
---

## During Session

### Task Execution
- Work through tasks.md sequentially
- Mark `[x]` only when fully complete and verified
- Add discovered tasks as `[ ]` immediately

### When User Says `@argue`
**Scenario**: User objects to implementation approach

**Agent response**:
1. STOP coding immediately
2. Ask clarifying questions:
   - "Is this about implementation detail, design approach, or requirement misunderstanding?"
3. Analyze scope:
   - **Detail-level**: Update tasks.md, continue
   - **Design-level**: Update spec.md B/C, regenerate tasks.md
   - **Requirement-level**: Update spec.md A, may need full replanning
4. If major pivot → add `<!-- PIVOT: <date> <reason> -->` in spec.md
5. Get user confirmation before proceeding

---

## Session End

### Handover Checklist
```
User: @handover
Agent updates:
✓ handover.md: Done / Now / Next / Key Files / Commands
✓ tasks.md: Mark completed, add discovered
✓ spec.md: Update status if changed (e.g., DOING → REVIEW)

Output: "Handover written. Status: REVIEW. 5/7 tasks done. Next session: final testing."
```
---

## After Autonomous Coding

**Scenario**: User used Claude Code / Copilot to implement features outside this session.
```

User: @sync
Agent:

1. Scans: git diff HEAD~5..HEAD (or file timestamps)
2. Identifies: which tasks were completed
3. Updates:
   - tasks.md: mark relevant tasks [x]
   - spec.md: update status if appropriate
   - handover.md: summarize what was done
4. Outputs: "Synced. Marked 3 tasks complete. Status unchanged (DOING)."

```
---

## Best Practices

### Handover Quality
- **Bad**: "Worked on auth. Some progress."
- **Good**: "Implemented JWT validation middleware. Tests pass. Next: add refresh token logic."

### Task Granularity
- Each task should be **<2 hours**
- Each task should have **verification criteria**
- Break down large tasks immediately

### Status Transitions
- Only update status when milestone reached
- Document blockers in spec.md section D before setting BLOCKED
- Set REVIEW only when implementation complete and ready for user verification

### PIVOT Handling
- Mark pivots explicitly in spec.md: `<!-- PIVOT: 2025-01-03 User changed auth from JWT to OAuth -->`
- Regenerate tasks.md after pivot
- Update handover.md with pivot reasoning
