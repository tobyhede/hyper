# 06 — One story shows a Card front whole

Status: ready-for-agent
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

- [ ] One story renders every Card kind at rest at the same size, each with a
      one-line Title and a three-line Title, so the ladder and the single-line
      default are comparable at a glance.
- [ ] A long single-line Title that wraps is specimened beside an authored
      three-line Title. They are the two cases this feature must keep apart and
      they should be visibly different in the story.
- [ ] Its `ladle-e2e` spec asserts the front's whole content: the Title Lines
      present, the kind icon, the border treatment — and that no line is drawn
      beneath the Title beyond the author's own Title Lines.
- [ ] The story's prose describes what the specimen renders. The `Card — Kinds`
      caption asserting an absence its own specimen contradicted is what this
      guards against.
- [ ] The tracked fixture gains exactly one Card with a three-line Title — one
      of each role — so the ladder is visible in `pnpm dev:fixture` and in every
      E2E run that imports the fixture, and a regression in projection or
      clamping shows up in a screenshot rather than only in a unit test. Exact
      counts asserted by existing E2E specs are updated with it.
