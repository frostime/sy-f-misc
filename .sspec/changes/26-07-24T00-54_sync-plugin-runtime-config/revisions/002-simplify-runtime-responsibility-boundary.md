---
revision: 2
date: 2026-07-28
trigger: "user feedback"
---

# Simplify runtime responsibility boundary

## Reason

Revision 001 internalized low-probability startup/unload/replacement overlaps through cancellation, async draining, and a cross-generation teardown barrier. Review found that the barrier itself depends on every old startup Promise eventually settling; a pending network or file operation could therefore prevent both old cleanup and replacement initialization.

The accepted product boundary allows rare, observable runtime resource inconsistencies to be recovered with a SiYuan UI reload. Persistent data integrity, privacy, ordinary synchronized configuration, and frequent cache synchronization remain plugin responsibilities.

## Final behavior

- Storage synchronization never calls the restarting base `onDataChanged()` implementation.
- Notifications received before settings and feature startup settle are coalesced once and reconciled after startup.
- Clean remote settings reconcile; divergent runtime settings remain authoritative for the current plugin session.
- `loadData() === ""` is treated as missing storage.
- One module transition failure is logged without blocking unrelated modules.
- Disposal prevents new reconciliation work, but does not drain already-started reconciliation, Enable transitions, or feature startup.
- Plugin generations are not serialized. Feature startup does not receive a lifecycle `AbortSignal`.
- Recoverable runtime failures identify the module or settings scope and recommend reloading the SiYuan UI.
- Apply operations are not transactional; a failed scope does not block independent scopes, but partial runtime mutation is not rolled back.

## Implementation impact

- Remove `FMiscRuntimeLifecycle`, its cross-generation barrier, startup cancellation, and lifecycle tests.
- Keep a small `loading | active | disposed` gate in `FMiscPlugin`.
- Remove persistence drain and failed Enable-transition retry bookkeeping.
- Retain aggregate per-module failure isolation.
- Add focused tests for reconciliation decisions and retain the module failure-isolation test.
- Remove the runtime lifecycle SPEC; record the lasting responsibility and recovery boundary in `func-module-architecture.md`.
