---
revision: 1
date: 2026-07-04T01:46:02
trigger: review-feedback
---

# skill-first-agent-docs

## Reason

User feedback: the package is primarily intended to be consumed by agents, so a separate `docs/` tree duplicates the SKILL and weakens the agent-facing contract. The existing package SKILL is too thin and should become the primary, context-portable usage artifact.

## Changes

### Spec Impact

- `BC-6` changes from “README/API docs + SKILL” to “SKILL-first package guidance”.
- Package should still include a minimal README for npm/GitHub orientation, but usage rules, API details, HTML authoring rules, asset integration, and examples should live in `skill/hspa/SKILL.md`.
- `docs/` is removed from package contents.

### Design Impact

- Target package layout removes `docs/**`.
- `skill/hspa/SKILL.md` absorbs the former `docs/api.md`, `docs/assets.md`, `docs/html-authoring.md`, and relevant README usage content.
- README becomes a short pointer to the SKILL and examples, not the main integration guide.

### Task Impact

- Add feedback tasks to remove `docs/`, update package `files`, rewrite `skill/hspa/SKILL.md`, simplify README, rerun build/type/pack verification, and commit the package update.
