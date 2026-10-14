# Every Resource kind is a module

Delivery for [ADR 0128](../../docs/adr/0128-every-resource-kind-is-a-module-and-a-resource-file-is-json.md), which refines ADR 0120, ADR 0020 and ADR 0127. The decision, its rejected options and its prior art are in the ADR; this file is the plan.

## Where it starts

- Every layer matches on a closed union of five kinds by hand: about 200 kind-id branches across 43 source files outside tests, most in `app`, `graph` and `ui` (`grep -rnE "'(markdown|image|space|reference|ur)'" packages src`, 2026-10-10). `packages/graph/src/content-resolution.ts` is a typical one.
- `resourceDocumentSchema` and `resourceSchema` in `packages/core/src/schema.ts` are flat discriminated unions: a kind's fields sit beside `id` and `title`.
- SQL already stores each Resource as one jsonb `document`, so no migration changes a column. A development database is not migrated either: it is dropped and recreated, then re-seeded, after a step that changes the stored shape (ADR 0054).
- Resource files are Markdown with frontmatter for every kind (ADR 0020), found by `*.md`.

## Order

Each step is its own PR and leaves `main` green. The envelope comes first because the module seam consumes it; the on-disk format moves last, so authors meet one change.

1. `01` — the envelope document, no change in behaviour.
2. `02` — the kind registry and module interface, with Ur moved onto it.
3. `03`–`06` — one kind per step: Image, Markdown, Reference, Space. Each deletes that kind's branches outside its module.
4. `07` — JSON Resource files, the Markdown sidecar and the shared locator on disk; `kind` required.
5. `08` — the remaining per-kind branches routed through the registries; `09` — the kind's module is the one parser of its content.
6. `10` — the sites that still name a kind outside `kinds/`, and the architecture candidates that would remove them.

When `06` lands, no non-test source outside a module names a kind id. (Not met as written: `08` routed the dispatches, `10` and `12` routed what Toby chose to route, and the sites that still name a kind outside `kinds/` are kept deliberately, each with its reason, in [`kind-sites.md`](kind-sites.md), counted by `test/unit/kind-ids-in-modules.test.ts` and the import ban.) A module is a `kinds/` directory in each package the kind reaches; `test/unit/kind-ids-in-modules.test.ts` holds each moved kind to that, and each step adds its kind to the scan. The Resource-file codec's missing-kind default (`defaultUrKind` in `packages/core/src/schema.ts`) writes `urKind.id` until `07` makes `kind` required and deletes it.
