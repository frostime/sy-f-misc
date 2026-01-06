<!-- Agent-Rule:START -->
- File read rule.
  - **Default behavior**: Read entire file in one call when possible.
  - **When to chunk**: Only chunk if file exceeds 1500 lines or 30 KB, or roughly 10K tokens.
  - **Chunk size**:
    - Minimum: 300 lines per chunk
    - Maximum: 1000 lines per chunk (adjust based on token budget)
    - Prefer larger chunks to minimize tool calls
  - **Rationale**: Balance between context window limits and tool invocation overhead.
- Actively use the spec file to track development progress, preventing loss of context during long copilot sessions.
<!-- Agent-Rule:End -->

<!-- SSPEC:START -->
# .sspec Agent Protocol

SSPEC_SCHEMA::3.1

## Hard Rules
- Bridge between user and assistant agent.
- `.sspec` = single source of truth for planning/tracking/handover.
- All `@xxx` are explicit user commands, not auto-executable.
------

## Workflow Overview

**Typical session flow**:
1. **Start**: User triggers `@change <name>` or `@resume` → Agent loads context
2. **Work**: Agent implements tasks, updates `tasks.md` progress
3. **Pivot**: If user says `@argue` → Agent stops, reassesses, revises plan
4. **Sync**: After autonomous coding → User says `@sync` → Agent updates .sspec
5. **End**: User says `@handover` → Agent writes session summary

**Cross-session continuity**: `handover.md` bridges sessions. Each handover should enable next session to start in <30 seconds.
------

## User Triggers

### 2.1 `@change <name>` — Switch/create change context
**Purpose**: Quickly move work context to a specific change.

Do:
1. Set active change = `<name>`
2. If `changes/<name>/` exists → read spec.md, tasks.md, handover.md (in order)
3. If not exists → run shell command `sspec change new <name>`, instruct user to fill spec.md
4. Output: context summary + next 3 actions

### 2.2 `@resume` — Recover session context
**Purpose**: Resume work after session break with minimal context loss.

Do:
1. Select active change:
   - If user specified name → use it
   - Else → pick most recently modified with status ∈ {DOING, BLOCKED, REVIEW}
2. Read: handover.md → tasks.md → spec.md (in order)
3. Output: "Resuming <name>..." + current state + next actions

### 2.3 `@handover` — End session cleanly
**Purpose**: Close session with proper context preservation for next session.

Do:
1. Update `changes/<change>/handover.md` with session summary
2. Update `tasks.md`: mark completed tasks, add discovered tasks
3. Update spec.md front yaml `status` if changed
4. Output: confirmation + handover content written

### 2.4 `@sync` — Sync .sspec with current reality
**Purpose**: After autonomous coding sessions (Claude Code, Copilot, etc.), ensure .sspec reflects actual progress.

Do:
1. Scan recent file changes (git diff or file timestamps)
2. For active change, update:
   - `tasks.md`: mark completed tasks, add discovered tasks
   - `spec.md`: update status in front yaml if appropriate
3. Output: diff summary of .sspec updates

### 2.5 `@argue` — User raises objection
**Purpose**: Handle user disagreement with implementation approach, design, or requirements during DOING.

Do:
1. STOP current implementation immediately
2. Analyze objection scope:
   - Implementation detail → update tasks.md only
   - Design flaw → update spec.md sections B/C, regenerate tasks.md
   - Requirement misunderstanding → update spec.md section A, may need full replanning
3. If major direction change → add PIVOT marker in spec.md
4. Output: impact analysis + proposed changes + await user confirmation
---

## Folder Structure

```text
.sspec/
├── project.md              # Project overview, conventions, constraints
├── changes/<name>/
│   ├── spec.md             # WHY/WHAT: problem, constraints, decisions
│   ├── tasks.md            # HOW: executable tasks + progress
│   └── handover.md         # SESSION BRIDGE: done/now/next
├── requests/*.md           # Incoming requests (OPEN → DOING → DONE)
└── skills/                 # Reusable knowledge modules
    ├── sspec-workflow.md   # Complete workflow guide
    ├── status-guide.md     # Status definitions & transitions
    └──  <CUSTOM_SKILL> /
        ├── SKILL.md
        └── <Others>
```
------

## Skills Reference

Skills are reusable knowledge modules in `.sspec/skills/`. Each skill has front matter:
```yaml
---
skill: my-skill-name
description: What this skill does
---
```
**Adding custom skills**: run shell command `sspec skill new --mode [simple|complex]`
  - Simple Skill: Create `.sspec/skills/<skill-name>.md` with proper front matter.
  - Complex Skill: Create `.sspec/skills/<skill-name>/` with `SKILL.md`.
**To list all skills**: run shell command: `sspec skill list`.

<!-- Built-In Skills -->
- **.sspec/skills/sspec-workflow**
  - WHEN: Use when you're a first-time sspec user or need a complete workflow reference.
  - HOW: Read for session patterns, file update timing, and best practices.
- **.sspec/skills/sspec-status-guide**
  - WHEN: Use when you're unsure about status meanings or transition rules.
  - HOW: Reference status definitions, allowed transitions, and edge cases.

<!-- Current Skills (Update if necessary) -->
| Skill | Description | File |
|-------|-------------|-------|
| html-page | Develop UI via single HTML page in sy-f-misc | html-page.md |
| solid-signal-ref | Use `@frostime/solid-signal-ref` with SolidJS | solid-signal-ref.md |
| sspec-status-guide | Status definitions, transitions, validation, edge cases | sspec-status-guide.md |
| sspec-workflow | Full sspec workflow, session patterns, file timing, best practices | sspec-workflow.md |

------

## File Responsibilities

**spec.md** (WHY/WHAT):
- Problem statement, constraints, decisions, solution outline
- Update when: strategy/decision changes, status transitions
**tasks.md** (HOW):
- Tasks completable in <2h, with verification criteria
- Update when: before coding (planning), after completing tasks (progress)
**handover.md** (SESSION BRIDGE):
- Done / Now / Next / Key Files / Commands
- Update when: end of session, before switching changes
**requests/\*.md** (INTAKE):
- Raw user requests with front yaml metadata
- Lifecycle: OPEN → link to change → DOING → DONE

## SSPEC CLI Command

```shell
Usage: sspec [OPTIONS] COMMAND [ARGS]...

  sspec - Lightweight AI collaboration spec for solo/small projects.

Options:
  --version  Show the version and exit.
  --help     Show this message and exit.

Commands:
  change   Change management operations (new, list, archive).
  project  Project-level operations (init, status, update).
  request  Create or manage user requests.
  skill    Skill management operations (list, new).
```
<!-- SSPEC:END -->

<!-- PROJECT-OVERVIEW:START -->
See and read .sspec/project.md
<!-- PROJECT-OVERVIEW:END -->

<!-- DEV-LOGS:START -->
# Dev-Logs
If the Agent needs to write a markdown document as a log file,
place it in `/dev-logs/<yymmdd>-<title>.md`.
The User/Agent will read these logs and, after the project concludes, decide whether to delete them or move them to `/dev-logs/archive`.
<!-- DEV-LOGS:END -->

# Powershell Usage

You are developed under Windows. Leverage PowerShell for utility.

**PowerShell Examples**
- Find files: `Get-ChildItem -Path . -Recurse -Filter "*.ts" | Where-Object {$_.Length -gt 10KB}`
- Count lines: `(Get-Content file.txt | Measure-Object -Line).Lines`
- Recent changes: `Get-ChildItem -Recurse | Where-Object {$_.LastWriteTime -gt (Get-Date).AddHours(-24)}`

**Safety Rules**:
- Never use `Remove-Item -Recurse` without `-WhatIf` first
- Always quote paths with spaces: `"C:\Program Files\..."`
- Prefer `Test-Path` before file operations

