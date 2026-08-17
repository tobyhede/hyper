# Design-system baseline

## Notes

The effort establishes `@project/ui` as Hyper's shared shadcn/Base UI surface
and migrates production surfaces onto it without replacing Ladle.

`feat/surface-inventory` is a donor branch, not a merge candidate. [Issue
13](issues/13-restack-surface-inventory-for-delivery.md) owns restacking every
retained change into bounded delivery PRs from `main`; the referenced tickets
retain their functional scope and blockers.

Issue 12 shipped in PR #72, Issue 09 shipped in PR #73, and Issue 01 shipped in
PR #74. Issue 11's decision is extracted on its clean delivery branch. Issue 13
remains the accounting source for the remaining extraction order.

## Decisions so far

- [Establish the shadcn design-system baseline](issues/01-establish-shadcn-design-system-baseline.md) — `packages/ui/components.json` owns generated component placement, `@project/ui` owns the public surface, and application tokens have one owner. Ladle runtime and stable stories remain deferred to their owning extractions.
- [Retire shared Card Description](issues/09-reconcile-card-description-semantics.md) — Card owns identity, kind and Title; each kind owns its remaining fields and both presentations inside uniform Card geometry (ADR 0051).
- [Treat stable Ladle stories as production-parity evidence](issues/11-record-ladle-production-parity-decision.md) — the donor decision requires real production boundaries and dual behavioral verification; Issue 11 still owns delivering ADR 0052 to `main`, then Issue 08 owns mechanical traceability.
- [Restack surface inventory for delivery](issues/13-restack-surface-inventory-for-delivery.md) — freeze this branch as a donor and account for every retained change across bounded, independently verified PRs from `main`.

## Audit follow-ups

- [Restore one Card-choice model](issues/10-restore-one-card-choice-model.md) — collapse the three production implementations back to two presentations over one behavior.
- [Stabilise the E2E fixture startup gate](issues/12-stabilise-e2e-fixture-startup.md) — turn the full-suite-only startup failure into a reproduced and fixed race.

## Fog

Tickets 02–08 retain ownership of the production-surface migrations and
catalogue guardrails. Their audit notes record what this branch integrated and
what remains incomplete; tickets 09–12 own the cross-cutting decisions and
regression found by the branch audit.
