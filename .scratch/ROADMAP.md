# Roadmap

Ordering and intent — the part `pnpm roadmap` cannot derive. Per-ticket status
comes from the tickets themselves; run `pnpm roadmap` or `pnpm roadmap:html`
rather than restating it here, and keep this file to the sequence and the reasons.

## Now — finish `design-system-baseline`

This is foundation. Every remaining surface gets rebuilt on it, so shipping it
first means the rest is written once rather than written and then migrated.
Refactoring travels with each ticket instead of being saved for a pass of its own.

`05`, `06` and `07` are delivered. Remaining: `08` — the Ladle catalogue and the
design-system guardrails — and nothing blocks it any more.

`13` is the shared extraction contract those were delivered under, not a parallel
work item. It closes when `08` closes.

Two things this effort left behind on purpose, both to be triaged with the
backlog rather than inside it:

- A completed reconnection leaves the Edge focused but not selected, so it offers
  no controls. That is Edge Authoring's selection folding rather than a HUD
  question, and it has no ticket — only
  `findings/reconnected-edge-loses-its-selection.md`.
- `issues/05-handoff-regression-2026-08-21.md` is the record of the round of `05`
  that went wrong, kept as a primary source. It is not open work, and it carries
  no `Status:` line, which is why the roll-up reports it separately.

## Next — reprioritise the backlog

Deliberately unordered. These stay parked until the design system lands, and what
survives is decided then, on the tree as it is by that point, not now.

- `typescript-7` — 9/12, arrived with the TypeScript 7 migration. Three open,
  two of them still `needs-triage`.
- `typing-skills` — 1/7, the skills and docs that migration wants next to it.
  Six open, five already `ready-for-agent`.
- `space-cards` — 1/5, the only effort that is genuinely early rather than
  finishing up. Three of its four open tickets are still `needs-triage`.
- `interaction-draft-invalidation/02` — ADR 0042's invalidation half is mostly
  already covered by accident; the ticket decides what to make deliberate.
- `route-authoring/08` — a walk of a loop has no end.
- `layout-strategy-contract/01` — declare strategy capability rather than infer it.

The `arrangement` vocabulary duplication is gone: `card-route-editing/20` and
`render-layer-vocabulary/01` both resolved, the latter in `be77671`.
