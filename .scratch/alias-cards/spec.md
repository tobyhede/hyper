# Alias cards

Source: grilling during the retire-Node change, 2026-07-19. Committed to as "Node first, Alias next."

## Problem

Retiring the authored Node (commit `c2abb74`, ADR 0004) removed the one way an author could place the same card at two graph positions. **Alias** is what fills that gap, and it does not exist yet — so today the authored graph cannot reuse a card at all. ADR 0004 records that as deliberate and temporary; this feature closes it.

`CONTEXT.md` already defines the term:

> **Alias**: A card that shows another card: the same content appearing again elsewhere in the space, with a single source of truth, so editing the target changes every place it appears. An alias points to a different card, never itself.

## Decisions already made

Settled during grilling — do not re-litigate:

- Content reuse is **Alias**, never an authored duplicate placement. A future architecture pass that sees "a card cannot be reused" must not answer it by reintroducing a node/placement layer (ADR 0004).
- An alias points to a **different** card, never itself.
- A route stepping `C … C` (same card id twice) is a genuine **revisit** — a view-level cycle the presentation copes with (ADR 0003).
- A route stepping `C … C'` where `C'` aliases `C` is the author explicitly asking for a **redraw** as a fresh forward-readable box.
- The redraw-vs-loop-back choice therefore belongs to the **author**. The layout never silently unrolls a revisit into duplicate boxes.

## Open — needs grilling

- Shape of the Card kind union (`Markdown | Alias`, and later `Space` per ADR 0001).
- How an alias resolves, and where that resolution lives.
- Alias-of-alias chains: allowed, or flattened, or rejected?
- Validation: self-reference, unresolved target, cycles through aliases.
- How routes and edges treat alias cards versus their targets.
- How the renderer signals "this is the same content shown again."

## Issues

- `01-grill-alias-model` — settle the above before writing schema.
- `02-card-kind-union` — the schema and validation change.
- `03-render-aliased-cards` — how an alias reads on screen.
