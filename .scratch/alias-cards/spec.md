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

## Settled by grilling (2026-07-21)

Recorded in ADR 0009 and `CONTEXT.md`; full trail in `issues/01`.

- **Card is a discriminated union on an explicit `kind`**, defaulted to `'markdown'`
  so existing manifests parse unchanged. `markdown: { id, title, kind, content }`,
  `alias: { id, title, kind, target }`. The `space` kind is deferred to the change
  that builds recursive spaces (ADR 0001).
- **Resolution is lazy, non-destructive, single-hop, and lives in `graph`** (ADR
  0009). The manifest keeps aliases as aliases; a resolver walks to the target's
  content on read. Not flattened at intake. An alias's target must be a non-alias
  card, so chains are rejected and cycles are unrepresentable.
- **`validateReferences` gains three distinct error kinds:**
  `unresolved-alias-target`, `alias-self-reference`, `alias-targets-alias`. No
  cycle check — single-hop makes cycles impossible by construction.
- **Routes and edges target an alias exactly like any card.** A step names a card
  id; an alias is a real node with its own id, handles and position; content
  resolves only at draw time. This is what keeps `C…C'` a forward redraw.
- **An alias carries its own required title; only content is inherited.**

## Decided on screen (issue 03)

- The signal that a card is showing content already seen elsewhere: a muted
  subtitle on the alias node naming the card it redraws, prefixed with a
  `corner-down-right` glyph (`↳ The data model`). Chosen over title-only, which
  goes invisible when an alias and its target share a title. Opened and deck
  surfaces stay title-only.

The feature is complete: schema and validation (02), resolution and rendering
(03), and an alias carrying no `body` field at all (04). All four issues
resolved — `04` was added after this line first claimed three.

## Issues

- `01-grill-alias-model` — settle the above before writing schema.
- `02-card-kind-union` — the schema and validation change.
- `03-render-aliased-cards` — how an alias reads on screen.
