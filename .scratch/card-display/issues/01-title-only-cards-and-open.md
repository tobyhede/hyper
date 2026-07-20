# Draw cards as titles, and let a viewer open one

Status: open

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
