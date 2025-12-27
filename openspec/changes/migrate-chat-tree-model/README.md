# Change: Migrate Chat to Tree-Based Data Model

**ID**: `migrate-chat-tree-model`  
**Status**: 🚧 **Draft - Awaiting Review**  
**Type**: Architecture Refactor  
**Priority**: High  
**Created**: 2025-12-27

## Quick Summary

Migrate GPT chat system from linear array-based storage to tree-based model, enabling conversation branching and better version management while maintaining backward compatibility.

## Documents

- 📋 [**proposal.md**](./proposal.md) - Problem statement, solution overview, impact analysis
- 🏗️ [**design.md**](./design.md) - Technical architecture, design decisions, patterns
- ✅ [**tasks.md**](./tasks.md) - Implementation checklist, phase breakdown
- 📚 [**knowledge.md**](./knowledge.md) - Design principles, patterns, pitfalls

## Spec Deltas

- [**gpt-chat-session**](./specs/gpt-chat-session/spec.md) - Tree model, worldLine, branching
- [**gpt-persistence**](./specs/gpt-persistence/spec.md) - V2 format, read-time migration
- [**gpt-message-item**](./specs/gpt-message-item/spec.md) - V2 accessors, version helpers

## Current Status

### ✅ Completed (Phase 1)
- Type definitions (V1 → V2)
- Migration logic (detectSchema, migrateV1ToV2)
- Persistence layer (read-time migration)

### 🔄 In Progress (Phase 2 - **Needs Rework**)
- TreeModel implementation (philosophy misalignment)
- ChatSession integration (uses adapter anti-pattern)

### ⏸️ Pending (Phase 3+)
- Message item accessor migration
- UI feature enablement (branch/version management)
- Testing & cleanup

### 🚨 Blockers

1. **Design Approval Needed**: Current implementation doesn't align with user's philosophical vision
   - Issue: Adapter pattern feels wrong (still linear thinking)
   - Need: Pure tree foundation with derived messages() memo

2. **Refactor Required**: `use-tree-model.ts` and `tree-model-adapter.ts`
   - Remove adapter layer
   - Implement messages as createMemo
   - Proper encapsulation per design.md

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **messages() type** | createMemo (derived) | Not adapter, not stored array |
| **worldLine storage** | Explicit Store<ID[]> | Performance, simplicity |
| **Migration timing** | Read-time only | No auto-write-back, user control |
| **Node updates** | Immutable + batch() | SolidJS reactivity, undo-friendly |
| **Version vs Branch** | Separate concepts | Horizontal vs vertical exploration |

## Next Steps

1. **Review**: Get user feedback on proposal.md and design.md
2. **Refactor**: Align implementation with approved design
3. **Continue**: Phase 3 (msg-item.ts migration)
4. **Test**: Comprehensive validation
5. **Feature**: Enable UI for branching/versions

## How to Use This Change

### For Reviewers

1. Read [proposal.md](./proposal.md) for context and motivation
2. Review [design.md](./design.md) for technical approach
3. Check [tasks.md](./tasks.md) to understand scope
4. Provide feedback on design decisions

### For Implementers (Post-Approval)

1. Follow [tasks.md](./tasks.md) sequentially
2. Refer to [design.md](./design.md) for patterns
3. Consult [knowledge.md](./knowledge.md) for pitfalls
4. Update spec deltas as implementation evolves

### For Future Maintainers

- [knowledge.md](./knowledge.md) explains the "why" behind designs
- Spec deltas document the final contract
- Git history shows evolution

## Related Work

### Previous Preparation (Git History)

- `bf9c409f` - Encapsulated message operations in use-chat-session.ts
- `7834e299` - Encapsulated item operations in msg-item.ts

These commits set the stage for migration by abstracting data access patterns.

### User Context

- [User Draft](../../../user-draft/archive/[251226]-迁移进展中.md) - Original request and requirements
- types.ts → types-v2.ts - Data model evolution

## Validation

Before marking this change as "Ready":

- [ ] All documents reviewed and approved
- [ ] Design aligns with user philosophy
- [ ] Tasks.md accurately reflects scope
- [ ] Spec deltas validated (openspec validate migrate-chat-tree-model --strict)
- [ ] No ambiguities or open questions

## Questions?

Contact: User (original requester) or check conversation history in user-draft/

---

**Last Updated**: 2025-12-27  
**Next Review**: After user feedback on design
