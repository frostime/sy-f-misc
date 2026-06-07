<!-- SSPEC:START -->
# .sspec Agent Protocol

SSPEC_SCHEMA::6.1

## 0. Structure

A spec-driven workflow, via `sspec` CLI and `.sspec/`.

**Core Principle**: The user MUST be able to predict the outcome before implementation begins.
When uncertain, align — never proceed with unclarified assumptions.
When rules conflict or go silent, prefer the path that lets the user predict and decide sooner, on the spec rather than on the code.

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
| Request a change from `.sspec/requests` | User raw intend → §2 |
| Resume existing change | `read(memory/spec)` → infer phase from State → load phase SKILL → continue |
| Create request | `sspec request new` |
| Create spec doc | `sspec doc new` |
| Update spec doc | `read(project.md)`→`read(spec-doc+code)`→Clarify with user on how to update |
| Mini-change | Follow §2.2 |

**Trigger-word → SKILL**:

| User says | Load |
|-----------|------|
| clarify, 搞清楚, 理解一下 | `sspec-clarify` |
| design, 设计, 方案 | `sspec-design` |
| align, 对齐 | `sspec-align` |
| plan, 拆任务 | `sspec-plan` |
| implement, 动手, 开始做 | `sspec-implement` |
| review/argue, 检查 | `sspec-review` |
| spec-doc, write/update | `write-spec-doc` |

**Standing rules**:
- Follow `Core Principle`.
- Important discovery → `memory.md` Knowledge immediately
- Session end → MUST update memory.md (State + Milestones) · `sspec howto write-memory`
- @align gate decisions → SHOULD update memory.md Knowledge
- Time uncertain → `sspec tool now`
- Template HTML comments with BCP 14 keywords (MUST, SHOULD, MAY per RFC 2119) are persistent constraints — never delete them.

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
Once Plan begins: spec.md/design.md locked. Changes → `revisions/NNN-*.md`.
memory.md: maintained throughout, not a phase. → `sspec howto write-memory`

→ `sspec howto handle-review-scope-change`


### 2.1 Change Scale

| Scale | Criteria | Path |
|---|---|---|
| Micro | ≤3 files, ≤30min, trivially reversible | Do directly |
| Single | ≤3 days, ≤15 files, ≤20 tasks | `sspec change new <name>` |
| Multi | >3 week OR >15 files OR >20 tasks | `sspec change new <name> --root` → sub-changes |

Status in spec.md MUST follow state machine. → `sspec howto update-change-status`

### 2.2 Mini Change Protocol

Follow SSPEC without `sspec change new`(for mini task).
Action: Inline change content in `.sspec/tmp/` by `sspec tmp new <topic>`. Spec+Design only.

Trigger: user explicitly opts "mimi".
Agent MUST NOT self-downgrade to mini — only responds to user intent.


## 3. User-Agent Protocol

Cross-cutting sync between user and agent — runs across all phases, outside any single change. Two directions:

**@align** (agent → user) — the agent lays out its current understanding and plan for the user to inspect, at any decision boundary (phase exits, blockers, scope changes, irreversible actions).
- `gate` = stop and wait · `report` = summarize and keep going
- gate when safe progress depends on a user decision
- → `sspec-align` SKILL: levels, format, anti-patterns, records

**@argue** (user → agent) — the user judges the direction is off and pushes back. Stop, reclassify, redirect. → `sspec-review` Rejection Protocol.

## 4. Peripheral Rule

**Spec-Docs**: {
- **What**: Stroe knowledge that code alone cannot adequately convey — in-code-but-scattered (cross-module architecture, implicit contracts, deliberate trade-offs) or outside-code entirely (platform rules, API quirks, business constraints).
- **High bar**: if an agent could reach the same understanding from code at little cost, it does NOT qualify.
- **Write**: Registered in `project.md` Spec-Docs Index. Write in `.sspec/spec-docs`. → Follow `write-spec-doc` SKILL
}

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

**Tools** (`sspec tool <name>`): `now` · `mdtoc` · `view-tree` · `fileinfo` · `patch/write` · `ask` · `treesitter`
  Frequent: `now`, `mdtoc`, `view-tree`; See `sspec tool <name> --prompt` for usage.

**HOWTO**: Mini rule. `sspec howto list` to browse; batch-read with `sspec howto read <n1> <n2>`.
**SKILL**: Read before starting phase. Referenced file → MUST read. `sspec-*` not loaded → find under `.sspec/skills/`.

**Fence nesting**: When showing content that contains ` ``` `, outer fence MUST use more backticks (e.g. `````). Always outer > inner.
<!-- SSPEC:END -->



