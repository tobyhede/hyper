# Roadmap

Ordering and intent — the part `pnpm roadmap` cannot derive. Per-ticket status
comes from the tickets themselves; run `pnpm roadmap` or `pnpm roadmap:html`
rather than restating it here, and keep this file to the sequence and the reasons.

## Now — finish `design-system-baseline`

This is foundation. Every remaining surface gets rebuilt on it, so shipping it
first means the rest is written once rather than written and then migrated.
Refactoring travels with each ticket instead of being saved for a pass of its own.

Remaining: `05` (production canvas Card), then `08` (Ladle catalogue and
guardrails), which `05` blocks.

`13` is the shared extraction contract those are delivered under, not a parallel
work item — read it alongside whichever target ticket is in hand, and close it
when they close.

`06` left one defect deliberately: a completed reconnection leaves the Edge
focused but not selected, so it offers no controls. It is Edge Authoring's
selection folding rather than a HUD question, and it has no ticket — only
`findings/reconnected-edge-loses-its-selection.md`. Triage it with the backlog.

## Next — reprioritise the backlog

Deliberately unordered. These stay parked until the design system lands, and what
survives is decided then, on the tree as it is by that point, not now.

- `space-cards` — 1/5 settled, the only effort that is genuinely early rather than
  finishing up. Three of its four open tickets are still `needs-triage`.
- `interaction-draft-invalidation/02` — ADR 0042's invalidation half is mostly
  already covered by accident; the ticket decides what to make deliberate.
- `route-authoring/08` — a walk of a loop has no end.
- `layout-strategy-contract/01` — declare strategy capability rather than infer it.
- `card-route-editing/20` and `render-layer-vocabulary/01` — both open against the
  same retired `arrangement` vocabulary. One of them should not survive triage.
