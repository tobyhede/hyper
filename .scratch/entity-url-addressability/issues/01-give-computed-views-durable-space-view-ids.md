# 01 — Give Computed Views durable Space View IDs

**What to build:** Grid, Flow and every future Computed View have stable UUID identities independent of their product names. Computed Views and Layouts resolve through one Space View identity namespace without changing how someone chooses a View.

**Blocked by:** None — can start immediately.

**Status:** resolved
Tags: release/v1

- [x] Renaming a Computed View leaves its authored selections and public identity unchanged.
- [x] A Space rejects or reports a Layout whose Id collides with an available Computed View.
- [x] Existing Computed View and Layout selection remains green through unit, application and end-to-end coverage.
- [x] `pnpm verify` and `pnpm e2e` pass.
