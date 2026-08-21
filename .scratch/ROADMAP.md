# Roadmap

Ordering and intent — the part `pnpm roadmap` cannot derive. Per-ticket status
comes from the tickets themselves; run `pnpm roadmap` or `pnpm roadmap:html`
rather than restating it here, and keep this file to the sequence and the reasons.

## Now — close out `design-system-baseline`

This is foundation. Every remaining surface gets rebuilt on it, so shipping it
first means the rest is written once rather than written and then migrated.
Refactoring travels with each ticket instead of being saved for a pass of its own.

`05`, `06`, `07` and `08` are delivered. `08` built the enforcement:
`pnpm ui:catalog:check` now holds every production component to a stable story
and every hand-rolled class block to a written reason, both recorded in
`packages/app/stories/design-system-inventory.ts`.

Two of `08`'s acceptance lines are deliberately left unticked rather than argued
into place, and they are the decision waiting on a human. One is unclosable by
any check — a story's *coverage* can be proven mechanically, its *meaningful
states* cannot. The other is real remaining work: `card-editor` and
`workspace-selection` are product appearance still hand-rolled in the app
stylesheet, now owned by `16` and by `space-cards/04`. Accepting the first and
scheduling the second closes the effort.

So three tickets remain here:

- `16` — move the Card editor's flat-paper treatment beside its component. New,
  `ready-for-agent`, blocked by nothing, and the larger half of what `08` left.
- `13` — the shared extraction contract, which owes its own closing step rather
  than a migration: the donor-to-landed audit, every path in
  `main...feat/surface-inventory` accounted for to a landed owner or to one of
  the rejections the ticket lists, plus the final PR links. The donor branch
  stays until that audit finds no unowned retained work.
- `08` itself, pending the call above.

Two things this effort leaves behind on purpose, both to be triaged with the
backlog rather than inside it:

- A completed reconnection leaves the Edge focused but not selected, so it offers
  no controls. That is Edge Authoring's selection folding rather than a HUD
  question, and it has no ticket — only
  `findings/reconnected-edge-loses-its-selection.md`. It is also what blocks
  `AuthorableEdge` from having a stable story, which the design-system inventory
  now records.
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
