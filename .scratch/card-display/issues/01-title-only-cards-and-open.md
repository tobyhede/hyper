# Draw cards as titles, and let a viewer open one

Status: resolved

## Context

`CardNode` renders `<CardRenderer title markdown variant="node" />` inside a clipped 300px box. `projectCardNodes` embeds every card's markdown into every node's `data` to feed it.

Per ADR 0006 the graph should draw the title only — but titles-only cannot ship on its own. Without a way to open a card, overview mode becomes unreadable and content is reachable only by entering presentation. Both halves are this issue.

## Task

**Draw the title.** `CardNode` renders the card's title (and its active state), not its body. `CardRenderer` stays as it is — it is still what presentation and the open view use.

**Take content out of the projection.** Drop `markdown` from `CardNodeData` and the `markdownByCardId` parameter from `projectCardNodes`. The graph projection should have no opinion about card bodies. `App` already holds `markdownByCardId` for the presentation layer; opening a card reads from the same place.

**Open a card.** Clicking a card in the graph shows its content in place. Reuse `CardRenderer` with `variant="slide"`; `PresentationLayer` is the closest existing shape, though it carries step controls this does not need — worth checking whether one component serves both before adding a second.

Keep the gesture generic. ADR 0001 has a viewer opening a *space* card to explore its nested graph; when that lands it should be the same interaction, dispatching on card kind. Don't name this `openMarkdown`.

## Acceptance

- The graph shows titles; no card body text is rendered in a node.
- `projectCardNodes` no longer takes markdown, and `CardNodeData` no longer carries it.
- A card can be opened from the graph and closed again, by mouse and by keyboard (`Esc` already exits presentation — the same key should close an opened card, without the two interfering).
- Opening does not depend on the card being on the selected route.
- `pnpm verify` and `pnpm e2e` green. E2E will need new coverage for open/close; the existing count assertions should survive untouched.

## Notes

Card *sizing* is issue 02 and can follow — this issue should not also change the dimensions, so that if the graph looks wrong afterwards it is clear which change did it.

## Answer

Done, both halves together as ADR 0006 requires.

**The graph draws titles.** `CardNode` renders the card's title and its handles,
and no longer imports `CardRenderer` at all — one fewer package dependency.
`.card--node` centres the title and keeps the 300px height, deliberately, so this
change is legible on its own and sizing stays `02`'s job.

**Content left the projection.** `CardNodeData` lost `markdown`, and
`projectCardNodes` lost its `markdownByCardId` parameter and the
`MarkdownByCardId` type. The graph projection now has no opinion about card
bodies; `App` holds the markdown for the presentation layer and the open view.
A test pins it: `expect('markdown' in a.data).toBe(false)`.

**Opening a card.** `openedCardId` in the store, with `openCard`/`closeCard`.
`GraphView` takes an `onOpenCard` callback and reports which node was clicked —
it does not know what opening means. The `OpenCard` component reuses
`CardRenderer` with `variant="slide"`.

Kept generic as instructed: nothing is named for a card kind, so opening a *space*
card to explore its nested graph (ADR 0001) can reuse the same state and gesture
by dispatching on kind.

**Escape.** Two separate effects rather than one branching handler: the
opened-card listener only mounts when a card is open, and the presentation
listener is skipped while one is. They cannot both fire.

Entering a presentation closes any opened card, so the two overlays never stack.

**Not reused: `PresentationLayer`.** The ticket asked whether one component could
serve both. It can't, without harm — `PresentationLayer` is built around step
controls and a step counter, and an opened card has no steps. Forcing it would
mean optional props that are always absent in one caller. They share
`CardRenderer`, which is the part that is genuinely common.

E2E covers: titles only in the graph and no body text, opening reveals the
content, Close and Escape both dismiss it, and a card can be opened even when it
is not on the selected route.

`pnpm verify` 57 tests green, `pnpm e2e` 8 green (5 existing, 3 new).

**Follow-on, now visible:** a title in a 300px box is mostly empty space. That is
`02`, which was always meant to run next.
