<!-- SSPEC:START -->
# .sspec Agent Protocol

SSPEC_SCHEMA::6.0

## 0. Structure

A spec-driven workflow, via `sspec` CLI and `.sspec/`.

**Core Principle**: The user MUST be able to predict the outcome before implementation begins.
When uncertain, align — never proceed with unclarified assumptions.

```
.sspec/
├── project.md     # Identity, conventions, notes
├── spec-docs/     # Knowledge: in-code-but-scattered or outside-code
├── changes/<n>/   # spec.md | tasks.md | memory.md [+ design.md | revisions/ | reference/]
├── requests/      # User intent records
└── tmp/           # Informal drafts
```

## 1. Dispatch

`read(project.md)` → classify → act:

| Input | Action |
|-------|--------|
| Directive (`@resume`, `@memory`, etc.) | Execute → §4 |
| Request under `.sspec/requests` | Check `kind` → §1.1 |
| Resume existing change | `read(memory)` → infer phase from State → load phase SKILL → continue |
| Create request | `sspec request new [--kind directive|observe|idea]` |
| Create spec doc | `sspec doc new` |
| Micro (≤3 files, ≤30min, obvious) | Do directly |
| Mini (user opts out of formal change) | Clarify+Design thinking → `sspec tmp new` → §2.0 |

**Trigger-word → SKILL**:

| User says | Load |
|-----------|------|
| clarify, 搞清楚, 理解一下 | `sspec-clarify` |
| design, 设计, 出方案 | `sspec-design` |
| align, 对齐, 确认一下 | §3 protocol |
| plan, 拆任务 | `sspec-plan` |
| implement, 动手, 开始做 | `sspec-implement` |
| review, 检查, 看看 | `sspec-review` |
| mini change, 不要 change, 直接推进 | §2.0 |

**Standing rules**:
- Follow `Core Principle`.
- Important discovery → `memory.md` Knowledge immediately
- Session end → MUST update memory.md (State + Milestones) · `sspec howto write-memory`
- @align gate decisions → SHOULD update memory.md Knowledge
- Time uncertain → `sspec tool now`
- Template HTML comments with BCP 14 keywords (MUST, SHOULD, MAY per RFC 2119) are persistent constraints — never delete them.

### 1.1 Request Dispatch

When agent encounters a request under `.sspec/requests/`, check `kind` frontmatter:

| kind | Agent behavior |
|------|---------------|
| `directive` | Assess scale → §2 Change Lifecycle (this is a task for the agent) |
| `observe` | Read, note context, but do NOT create a change. The request is a phenomenon record for later human triage. |
| `idea` | Read, may refer to it as context, but do NOT create a change unless explicitly asked. The request is a memo. |
| (missing) | Treat as `directive` (backward compatible). |

A request of any kind MAY be linked to a change later via `sspec request link`.

## 2. Change Lifecycle

Each phase has a SKILL. MUST read it before starting.

```
Clarify  (sspec-clarify)    posture, reusable       exit: ready for spec
Design   (sspec-design)     spec.md [+design.md]    exit: @align gate ■
Plan     (sspec-plan)       tasks.md                exit: @align report →
Implement(sspec-implement)  code + tasks progress   exit: @align gate ■
Review   (sspec-review)     DONE | fix→Implement | amend→revision | follow-up→new change
```

`■` = hard stop, **MUST stop & align**. `→` = output summary, COULD keep going. Failed gate → return, update, realign.
Post-Design gate: spec.md/design.md baselines immutable. Changes → `revisions/NNN-*.md`.
memory.md: maintained throughout, not a phase. → `sspec howto write-memory`

→ `sspec howto handle-review-scope-change`

### 2.0 Mini Change Protocol

Clarify/Design thinking without change entity. Output → `.sspec/tmp/`.

Trigger: user explicitly opts out of formal change.
Flow: clarify → design-level output → `sspec tmp new <topic>` → no gates, no tasks, no memory.
Boundary: no code changes. If implementation needed → upgrade to change or confirm Micro.
Agent MUST NOT self-downgrade to mini — only responds to user intent.

### Scale

| Scale | Criteria | Path |
|---|---|---|
| Micro | ≤3 files, ≤30min, trivially reversible | Do directly |
| Single | ≤1 week, ≤15 files, ≤20 tasks | `sspec change new <name>` |
| Multi | >1 week OR >15 files OR >20 tasks | `sspec change new <name> --root` → sub-changes |

Status in spec.md MUST follow state machine. → `sspec howto update-change-status`

## 3. @align

Structured sync at decision points. **Formalized exchange, not prose.**

**Format rule**: MUST be scannable in 5 seconds.
GOOD: structured (tables, labeled items, code blocks) with high density.
BAD: prose-style, redundant.

| Level | Behavior | When |
|---|---|---|
| `report` | Summary, **keep going** | Plan done, progress |
| `gate` | Summary, **stop and wait** | Design done, implement done, blockers, scope change |

Decisions → natural home: design → spec.md, direction → memory.md Knowledge.
📚 Full mechanics: `sspec-align` SKILL

## 4. Reference

**Directives**: `@change <n>` | `@resume` | `@memory` | `@sync` | `@argue` | `@subagent-audits`

**Spec-Docs**: Knowledge that code alone cannot adequately convey — either in code but scattered or hard to reconstruct (cross-module architecture, UX requirements, design norms, deliberate trade-offs), or entirely outside code (platform rules, API quirks, business constraints). Registered in `project.md` Spec-Docs Index. → `write-spec-doc` SKILL

**CLI**:

| Command | Use |
|---------|-----|
| `sspec change new <name> [--from REQ] [--root] [--scaffold design]` | Create change |
| `sspec request new <name> [--kind directive|observe|idea]` | Create request |
| `sspec change scaffold <type> <change>` | Add file: tasks, design, revision |
| `sspec change find/status <name>` | Inspect change |
| `sspec doc new "<name>"` | Create spec-doc |
| `sspec howto [name...]` | Read HOWTOs (batch) |
| `sspec tool <name> [opts]` | CLI tools (`--prompt` for usage) |

**Tools** (`sspec tool <name>`): `now` · `ask` · `mdtoc` · `view-tree` · `fileinfo` · `patch/write` · `treesitter`
  Frequent: `now`, `mdtoc`, `view-tree`; See `sspec tool <name> --prompt` for usage.

**HOWTO**: `sspec howto list` to browse; batch-read with `sspec howto read <n1> <n2>`.
**SKILL**: Read before starting phase. Referenced file → MUST read. `sspec-*` not loaded → find under `.sspec/skills/`.

**Fence nesting**: When showing content that contains ` ``` `, outer fence MUST use more backticks (e.g. `````). Always outer > inner.
<!-- SSPEC:END -->



