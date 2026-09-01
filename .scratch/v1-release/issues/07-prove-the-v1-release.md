# 07 — Prove the V1 release

Status: ready-for-agent
Tags: release/v1
Blocked by: 01, 02, 03, 05, 06, 08, 16, 17, 18, 19; `alias-cards/06`; `entity-url-addressability/08`; `interaction-draft-invalidation/04`; `space-cards/10`; `architecture-review/14`; plus the pending Layout-only reconciliation when its tracker lands

**What to build:** Close every V1 Definition of Done line with executable evidence
or an explicit deferred-scope link and apply ticket 14's complete, commit-specific
`v1.0.0` release gate. This ticket does not define or rename the earlier untagged
End-to-end checkpoint.

- [ ] No known defect blocks creating, editing, saving, reopening, importing,
      exporting or presenting the V1 authored aggregate.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass on the required Node version.
- [ ] PostgreSQL integration proves an Edit survives a fresh application host.
- [ ] The Ladle CI check is required to merge.
- [ ] The README describes the V1 workflow, supported Card kinds and deliberate
      exclusions.
- [ ] Every V1 Definition of Done checkbox links to the issue or test that closes it.
- [ ] Evidence from the untagged End-to-end checkpoint and the disposition of its
      canonical-journey feedback are recorded before the `v1.0.0` go/no-go call.
- [ ] The final candidate has one closed proof-matrix row per reconciled
      Definition-of-Done checkbox and a complete ticket-13-classified defect
      register.
- [ ] A fresh clean-clone canonical journey succeeds on the final candidate SHA
      after every accepted blocker or correction is complete.
- [ ] The human directing V1 records a binary go/no-go decision; only a go may
      create annotated tag `v1.0.0`, whose peeled commit is verified against the
      approved SHA.
