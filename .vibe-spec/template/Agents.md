# .vibe-spec Agent Protocol - see `.vibe-spec` directory

## 0) Hard Rules
- High-signal only: bullets > prose. No filler.
- Treat `.vibe-spec` as the single source of truth for planning/tracking/handover.
- If user message contains `@$change` / `@handover` / `@resume`, follow the corresponding route immediately.

---

## 1) Folder Structure & Semantics (Read Me Once)
.vibe-spec/
- project.md: project overview + constraints + knowledge index (must read before work)
- changes/<changeName>/
  - spec.md: problem + constraints + decisions + solution outline (WHY/WHAT)
  - tasks.md: executable task list + verification criteria (HOW)
  - handover.md: cross-session bridge (WHERE AM I / NEXT)
- requests/*.md: incoming requests backlog (lightweight intake)
- knowledge/*.md: topic references (read only when needed)
- scripts/*.ps1: scaffolding (user-run)

---

## 2) Follow User's Trigger

User might attache with `@change` / `@handover` / `@resume` for pre-defined instruction.

### 2.1 `@change <name>`  (Switch/Create change)
Goal: move work context to a specific change folder quickly.

Do:
1) Set active change = `<name>`.
2) If `changes/<name>/` exists: read spec/tasks/handover (in this order).
3) If not exists: instruct user to run:
   - `.vibe-spec/scripts/new-change-task.ps1 -changeName "<name>"`
   Then tell user which fields to fill first (spec.Status/Type + tasks.Task List).
4) Output: "Current context summary" + "Next 3 actions".

### 2.2 `@resume`  (Resume from handover)
Goal: recover context in <30 seconds.
When: a new start chat/agent session, user ask agent to resume the context.

Do:
1) Select active change:
   - If user provided a name in recent messages -> use it
   - Else choose the most recently updated change whose spec.Status ∈ {DOING, BLOCKED, REVIEW}
2) Read: `changes/<change>/` `handover.md` (first), `tasks.md`, `spec.md`
1) Import the context from last session, and move on in this session.

### 2.3 `@handover`  (Write/Update handover now)
Goal: end this session cleanly.
When: a chat/agent session going to end, user ask agent to record the context.

Do:
1) Update `changes/<change>/handover.md` following the predifined schema.
2) Also update `tasks.md` progress and "Last Updated".
3) Output: short confirmation + paste the exact handover content you wrote.

## 2.4 `@sync` (Sync current state with .vibe-spce/changes)
Goal: make `changes/` up to date with current situation.

---

## 3) What You Should Do (Default Behavior when NO trigger command)

### 3.1 Mandatory read order
1) `.vibe-spec/project.md`
2) Active change selection:
   - Prefer spec.Status ∈ {DOING, BLOCKED, REVIEW} most recently updated
   - Else pick latest requests/status=DOING
3) Then read `spec.md -> tasks.md -> handover.md`.

### 3.2 VIBE CODING Mode (must declare each reply)
- Declare one: Rapid / Research / Design / Planning / Execution / Refactor
- Obey user commands: /rapid /auto /complex /no-edit /force-design /design-doc

---

## 4) File Handling Rules (Do not mix responsibilities)

### 4.1 spec.md (WHY/WHAT)
- Contains: problem statement, constraints, decisions, solution outline.
- Avoid: implementation logs, step-by-step progress notes.
- When to update: when strategy/decision changes.

### 4.2 tasks.md (HOW)
- Contains: tasks that are completable in <2 hours, each with verification criteria.
- Avoid: long discussions; put rationale in spec.md.
- When to update: before coding (Planning), and after completing tasks (Execution).

### 4.3 handover.md (SESSION BRIDGE)
- Contains: Done / Now / Next / Files / Commands only.
- Avoid: full spec restatement; avoid detailed reasoning.
- When to update: end of session, or before switching to a different change.

### 4.4 requests/*.md (INTAKE)
- Use for raw requests; keep it short.
- When a request becomes real work:
  - create/switch change via `@change`
  - set `attach-change`
  - optionally mark request DONE when shipped

---

## 5) PowerShell Scaffolding (User-run)
- New change:
  `.vibe-spec/scripts/new-change-task.ps1 -changeName "<my-change-name>"`
- New request:
  `.vibe-spec/scripts/new-request.ps1 -requestName "<my-request-name>"`

