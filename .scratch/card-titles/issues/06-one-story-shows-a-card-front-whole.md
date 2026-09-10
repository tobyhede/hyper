# 06 — One story shows a Card front whole

Status: resolved
Blocked by: 01, 04

**What to build:** One `Card — front` story specimening every Card kind at rest,
with a one-line and a three-line Title side by side, and a Ladle spec asserting
what the front draws **and does not draw**.

**Why:** No story shows a Card front entire. It is split across `States`,
`Kinds`, `Hover`, `Colours`, `Open and close`, `Open alias` and `Resize
control`, every one of them a slice. That is how two undecided elements lived on
the front for months: the slice that would have shown them was a different story
from the one anyone reviewed, and the story that did draw them captioned itself
as not drawing them.

This feature adds a new register to the front. Without this ticket the same
thing can happen again.

- [x] One story renders every Card kind at rest at the same size, each with a
      one-line Title and a three-line Title, so the ladder and the single-line
      default are comparable at a glance.
- [x] A long single-line Title that wraps is specimened beside an authored
      three-line Title. They are the two cases this feature must keep apart and
      they should be visibly different in the story.
- [x] Its `ladle-e2e` spec asserts the front's whole content: the Title Lines
      present, the kind icon, the border treatment — and that no line is drawn
      beneath the Title beyond the author's own Title Lines.
- [x] The story's prose describes what the specimen renders. The `Card — Kinds`
      caption asserting an absence its own specimen contradicted is what this
      guards against.
- [x] The tracked fixture gains exactly one Card with a three-line Title — one
      of each role — so the ladder is visible in `pnpm dev:fixture` and in every
      E2E run that imports the fixture, and a regression in projection or
      clamping shows up in a screenshot rather than only in a unit test. Exact
      counts asserted by existing E2E specs are updated with it.

## Answer

`a7e7d63a`.

`Card — Front` (`stories/components/card.stories.tsx`, export `Front`) renders every front `CanvasCard` declares at the one authored Closed Size, in two rows — a one-line Title and a three-line Title — then a second section, "An authored break is not a wrapped break", putting the long wrapping Title beside the authored three-line one. `CanvasCardSpecimen` now builds all four fronts; it previously built only `markdown` and `alias` while its prop type claimed all four.

The Ladle spec asserts the front's whole content across every front × both Titles: kind, rest state, the kind glyph by accessible name, `border-style` (dotted only for the Alias), one rung per Title Line with exact texts and roles, and descending resolved sizes. And the **absence**: `.canvas-card__body` has exactly one child and it is the heading, `.canvas-card__content` count 0, and the Card's own `innerText` equals exactly the Title Lines — so any line the application writes beneath the Title fails here. That is the claim ticket 01 deliberately left to this ticket rather than inverting its own assertions into "draws nothing" checks.

A parity claim and a real application proof were added (`e2e/overview.spec.ts`), written against DOM and visible text so ticket 05's accessible-name change could not break it. The fixture gains one Card, `fixture/cards/t.md`, one line of each role, on the default Layout and in no Graph. Six count assertions were updated across `overview`, `presenting` and `editing`; the remaining counts were re-swept and are edge-only or dynamically captured.

Scope creep, minor and prose-explained: the story also specimens the non-Card `preview` creation ghost, where the ticket said "every Card kind".

### Verification

`pnpm verify` exit 0 (203 files, 2464 passed | 2 skipped), `pnpm e2e` exit 0 (160 passed), `pnpm e2e:ladle` exit 0 (81 passed) — all on the integrated branch, not on this ticket alone.
