---
revision: 2
date: 2026-07-04T02:20:00+08:00
trigger: scope-expansion
---

# add-conservative-cli-init-doctor

## Reason

User asked where the previously discussed `init` CLI implementation was. It had only been proposed as a behavior spec and was not implemented. Continue by adding the conservative CLI that matches the SKILL-first package direction.

## Changes

### Spec Impact

- Add a package CLI binary: `siyuan-hspa`.
- Add `siyuan-hspa init` for project-local agent setup:
  - default copies `.agents/skills/siyuan-hspa/SKILL.md` and `src/pages/hspa-demo.html`;
  - supports `--skill`, `--example`, `--all`, `--dry-run`, `--force`, `--yes`/`-y`, and `--cwd <path>`;
  - requires `--yes` for writes;
  - never overwrites without `--force`;
  - writes only inside `--cwd`;
  - does not create `docs/`.
- Add `siyuan-hspa doctor` for read-only diagnostics:
  - checks dependencies, Vite static copy wiring, project-local SKILL, and common HTML page issues;
  - supports `--cwd <path>` and `--json`;
  - performs no network access, installs, or mutations.

### Design Impact

- Add `src/cli.ts` as a dependency-free Node CLI using only built-in modules.
- Add `cli` to `tsup` entries.
- Add `package.json#bin.siyuan-hspa` pointing to `./dist/cli.js`.
- Update README and package SKILL with CLI usage and validation commands.

### Task Impact

- Add implementation and verification tasks for CLI build, dry-run init, real init in a temp directory, doctor text/JSON output, pack dry-run, and mock plugin build.
