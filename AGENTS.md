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

### `@change <name>`
Switch/create change context.
1. If `changes/<name>/` exists → read spec.md, tasks.md, handover.md
2. If not exists → run shell `sspec change new <name>`,  fill spec.md with user's help
3. Output: context summary + next actions

### `@resume`
Resume work after session break. e.g. Start a New Chat in copilot, cursor etc, or start new cli for claude code.
1. Pick user specified change with status ∈ {DOING, BLOCKED, REVIEW}
2. Read: handover.md → tasks.md → spec.md
3. Output: current state + next actions

### `@handover`
End session and write handover doc, enabling next agent quickly know the context.
1. Update handover.md with session summary, must include
  * Background of the Major Task
  * What Was Accomplished in the Previous (Current) Session
  * Current Status
  * Next Steps
  * Conventions and Standards to Follow
2. Update tasks.md progress
3. Update spec.md status if changed

### `@sync`
After autonomous coding sessions (Claude Code, Copilot, etc.), ensure .sspec reflects actual progress.
1. Scan recent changes (agent chat history, git diff or timestamps)
2. For active change, update:
   - `tasks.md`: mark completed tasks, add discovered tasks
   - `spec.md`: update status in front yaml if appropriate


### `@argue`
Handle user disagreement with implementation approach, design, or requirements during implementing.
1. STOP current implementation
2. Analyze scope: detail / design / requirement level
3. Update relevant files, add PIVOT marker if major change
4. Await user confirmation
------

## Folder Structure

```text
.sspec/
├── project.md              # Project overview, conventions
├── changes/<name>/
│   ├── spec.md             # WHY/WHAT: problem, decisions
│   ├── tasks.md            # HOW: executable tasks + progress
│   └── handover.md         # SESSION BRIDGE: done/now/next
└── requests/*.md           # Incoming requests
```
------

## File Responsibilities

| File | Content | Update When |
|------|---------|-------------|
| spec.md | Problem, constraints, decisions | Strategy/status change |
| tasks.md | Tasks (<2h each) + progress | Planning, task completion |
| handover.md | Done / Now / Next | Every session end |
| requests/*.md | Raw user requests | Lifecycle: OPEN → DOING → DONE |

------

## Skills

For detailed guidance on status definitions, transitions, and edge cases, read the **sspec** skill:
- Location: `.github/skills/sspec/SKILL.md` or `.claude/skills/sspec/SKILL.md`
- Use when: uncertain about status meanings, transition rules, or quality standards

## CLI Reference

```shell
sspec change new <name>      # Create change
sspec change list            # List changes
sspec change archive <name>  # Archive completed change
sspec project status         # Show project overview
sspec request <name>         # Create request
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

