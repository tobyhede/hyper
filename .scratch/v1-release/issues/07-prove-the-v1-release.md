# 07 — Prove the V1 release

Status: ready-for-agent
Tags: release/v1
Blocked by: 01, 02, 03, 04, 05, 06, 08; `alias-cards/06`; `entity-url-addressability/08`; `interaction-draft-invalidation/04`; `space-cards/10`; `space-cards/12`

**What to build:** Close every V1 Definition of Done line with executable evidence
or an explicit deferred-scope link.

- [ ] No known defect blocks creating, editing, saving, reopening or presenting
      the V1 authored aggregate.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass on the required Node version.
- [ ] PostgreSQL integration proves an Edit survives a fresh application host.
- [ ] The Ladle CI check is required to merge.
- [ ] The README describes the V1 workflow, supported Card kinds and deliberate
      exclusions.
- [ ] Every V1 Definition of Done checkbox links to the issue or test that closes it.
