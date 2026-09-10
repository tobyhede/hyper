# 01 — Take the undecided reference lines off the Card front

Status: ready-for-agent
Blocked by: none

**What to build:** Remove the two computed lines drawn beneath a Card's Title —
the Alias's Target name and the Space Card's referenced Space name — and stop
Alias creation from copying its Target's Title.

**Why:** Neither line was ever decided. `aliasOf` arrived inside `aaeb8b72`
("Render aliased cards") and `spaceTitle` inside `4776ed2e` ("author a Space
Card reference"), both as rendering details of feature work. No ADR mentions
either. `CONTEXT.md` says a Card has a Title and a kind and "no shared
Description, summary, or second content slot" — the model says these do not
exist and the code drew them on two kinds anyway.

The Ladle story that specimens them makes the point on its own: `Card — Kinds`
captions itself "Kind changes the icon and the border treatment (an Alias's
dotted border) **without adding a textual kind label**", and the specimen
directly beneath that sentence draws a line of text under the title.

This is independent of the rest of this effort. The Title ladder works whether
or not these lines are drawn; they became visible because the ladder crowded the
Card front, but they are a defect on their own terms and land first so the
ladder is designed against the Card front we want.

- [ ] The Alias Card front draws no Target name. `aliasOf` is gone from
      `packages/react-flow-adapter/src/projection.ts`, from the `CardNode` and
      `CanvasCard` fronts, and from the `canvas-card__alias-of` CSS block.
- [ ] The Space Card front draws no Space name. `spaceTitle` is gone the same
      way, with its `canvas-card__space-of` block. The `SpaceCardSelectors` an
      Open Space Card draws are untouched — they are authored controls, not a
      line the application writes on the author's behalf.
- [ ] The `alias-marker` and `space-marker` test ids are gone, along with every
      assertion on them in `packages/ui/test/CanvasCard.test.tsx`,
      `packages/react-flow-adapter/test/projection.test.ts`,
      `packages/react-flow-adapter/test/CardNode.test.tsx`,
      `packages/app/e2e/overview.spec.ts`, `packages/app/e2e/space-card.spec.ts`
      and `packages/app/ladle-e2e/card.spec.ts`. Assertions are removed, not
      inverted into "draws nothing" checks — 06 owns the one place that states
      what a Card front draws and does not draw.
- [ ] The `Card — Kinds` and Space card pane stories no longer specimen either
      line, and `stories/support/CanvasCardSpecimen.tsx` no longer takes them.
      The `Card — Kinds` caption becomes true of what it renders.
- [ ] Creating an Alias with no entered Title mints through
      `packages/app/src/titles.ts` like any other Card rather than copying its
      Target's Title (`packages/app/src/space-authoring.ts`, the `created-alias`
      arm). An entered Title is still never overwritten. ADR 0070's creation
      flow already continues into inline Title naming, so the author is being
      asked for a name at that moment anyway.
- [ ] `docs/agents/rendering.md` no longer describes either line.
- [ ] Nothing about Alias or Space Card kind identity is lost: the kind icon and
      the Alias's dotted border still distinguish them, which is what the Kinds
      story always claimed was doing the work.

Two Cards can no longer end up with the same Title by default, which is the
condition the Alias line was introduced to remedy. An author who deliberately
names an Alias after its Target still gets two Cards with one name, and that is
their authored choice rather than something the application produced.
