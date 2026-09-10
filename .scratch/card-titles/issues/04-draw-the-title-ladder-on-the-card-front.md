# 04 — Draw the Title ladder on the Card front

Status: resolved
Blocked by: 02

**What to build:** Draw a Card's Title Lines on the Card front at descending
typographic weight, clamped to the room available, without ever changing the
Card's size.

**Why:** This is the visible half of the feature, and the two ways to get it
wrong are both quiet: styling a break the box chose rather than one the author
typed, and letting a long Title grow the Card.

- [x] Each Title Line is its own block element carrying its role, and wraps
      freely within that role. A `subtitle` that takes two visual lines is one
      subtitle. A long single-line Title still wraps at the `title` role, as it
      does today — the `markdown · long title` specimen must be unchanged.
- [x] A single-line Title renders exactly as it does now: 18px, weight 600,
      line-height 1.12, letter-spacing -0.02em, bottom-anchored. This is
      regression evidence, not a nice-to-have.
- [x] `subtitle` and `caption` derive from the `title` role by ratio, declared
      once as custom properties in `packages/ui/src/canvas-card.css` beside the
      existing `--canvas-card-title`. Weight steps 600 / 500 / 400. All three
      keep `--canvas-card-title` as their colour — the weight and size step is
      already saying "descending", and dimming on top of it is two mechanisms
      for one meaning on a front where the Graph colour is already carrying
      information.
- [x] Clamping counts *visual* lines per role and never grows the Card. The
      authored Closed Size is untouched (ADR 0014, ADR 0066), and a Title with
      more lines than fit is clipped.
- [x] The ladder draws the same whether the Card is Open or Closed, and on every
      Card kind. A Title that changes shape when a Card opens teaches an author
      that Opening edits it.
- [x] The Title's one-activation edit control (ADR 0065) still covers the whole
      Title and still claims only the pixels it draws; its hover and focus
      treatment spans the ladder rather than the first line alone.
- [x] The rules live in `packages/ui/src/canvas-card.css`, so no
      `design-system-inventory.ts` entry is owed — `pnpm ui:catalog:check`
      governs new hand-rolled blocks in `packages/app/src/styles.css`.

## Answer

`c66ff966`.

`TitleLadder` in `CanvasCard.tsx` maps `titleLines(title)` to one `<span class="canvas-card__title-line" data-role>` per **domain** line — `span` with `display: block`, because when the Title is editable the ladder sits inside the shared `Button`, whose content model is phrasing content. Wrapping happens *inside* a rung, so a long single-line Title is still exactly one `data-role="title"` element at 18px/600: the trap this ticket names is held by `ladle-e2e/card.spec.ts`, where line boxes are real, asserting count 1, role `title`, resolved 18px/600/1.12/-0.02em and a box over 40px tall proving it really wrapped.

Ratios beside `--canvas-card-title`: `--canvas-card-subtitle-ratio` 0.78 and `--canvas-card-caption-ratio` 0.67, weights 600/500/400, and no rung declares `color` or `opacity` — asserted, because the no-dimming rule is the kind that erodes. Clamping is per role (`-webkit-line-clamp` 3/2/1) under a ladder ceiling of `max-height` + `overflow: hidden`, and `canvas-card-title-ladder.test.ts` ties the 80.64px ceiling to `COLLAPSED_CARD_SIZE` minus border, rail and padding rather than restating a number.

Two additions beyond the letter of the ticket, one rule each: `white-space: normal` on a rung, because the shared `Button`'s base class is `whitespace-nowrap` and would otherwise have withheld wrapping-within-a-role from every editable Title; and `:empty { min-height: 1lh }`, so an interior blank line the schema keeps verbatim is actually visible.

### Verification

`pnpm verify` exit 0 (203 files, 2464 passed | 2 skipped), `pnpm e2e` exit 0 (160 passed), `pnpm e2e:ladle` exit 0 (81 passed) — all on the integrated branch, not on this ticket alone.
