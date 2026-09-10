# 04 — Draw the Title ladder on the Card front

Status: ready-for-agent
Blocked by: 02

**What to build:** Draw a Card's Title Lines on the Card front at descending
typographic weight, clamped to the room available, without ever changing the
Card's size.

**Why:** This is the visible half of the feature, and the two ways to get it
wrong are both quiet: styling a break the box chose rather than one the author
typed, and letting a long Title grow the Card.

- [ ] Each Title Line is its own block element carrying its role, and wraps
      freely within that role. A `subtitle` that takes two visual lines is one
      subtitle. A long single-line Title still wraps at the `title` role, as it
      does today — the `markdown · long title` specimen must be unchanged.
- [ ] A single-line Title renders exactly as it does now: 18px, weight 600,
      line-height 1.12, letter-spacing -0.02em, bottom-anchored. This is
      regression evidence, not a nice-to-have.
- [ ] `subtitle` and `caption` derive from the `title` role by ratio, declared
      once as custom properties in `packages/ui/src/canvas-card.css` beside the
      existing `--canvas-card-title`. Weight steps 600 / 500 / 400. All three
      keep `--canvas-card-title` as their colour — the weight and size step is
      already saying "descending", and dimming on top of it is two mechanisms
      for one meaning on a front where the Graph colour is already carrying
      information.
- [ ] Clamping counts *visual* lines per role and never grows the Card. The
      authored Closed Size is untouched (ADR 0014, ADR 0066), and a Title with
      more lines than fit is clipped.
- [ ] The ladder draws the same whether the Card is Open or Closed, and on every
      Card kind. A Title that changes shape when a Card opens teaches an author
      that Opening edits it.
- [ ] The Title's one-activation edit control (ADR 0065) still covers the whole
      Title and still claims only the pixels it draws; its hover and focus
      treatment spans the ladder rather than the first line alone.
- [ ] The rules live in `packages/ui/src/canvas-card.css`, so no
      `design-system-inventory.ts` entry is owed — `pnpm ui:catalog:check`
      governs new hand-rolled blocks in `packages/app/src/styles.css`.
