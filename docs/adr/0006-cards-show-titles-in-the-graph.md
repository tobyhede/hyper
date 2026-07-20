# A card in the graph shows its title, not its content

Status: accepted
Refines: 0002
Refined by: 0008

A card drawn in the graph renders its **title** — later, optionally, a short description. Its full content is not drawn there. Content is reached two ways: **opening** the card, which shows it in place, and the **Presentation** view, which steps through it fullscreen.

This is a **View** decision, not a Card decision. A card still has its content; the graph view chooses not to draw it. `CONTEXT.md` already defines a view as "which cards and routes are shown, and how they are drawn on screen and explored", so the domain model is unchanged, and a future "show full content" option is a view setting.

We rejected the status quo — rendering each card's markdown inside its graph node — because content-at-a-glance was already an illusion. The card node is a fixed 300px box with `overflow: hidden`, so every card longer than a paragraph was being silently clipped mid-sentence. At any zoom where more than a few cards fit on screen, the text is unreadable anyway; what it costs is the ability to see the *shape* of the space, which is the thing a graph is for. We also rejected scrolling inside a node (it makes a card a container and its scroll fights the canvas pan) and scaling text to fit (illegible at the same zoom levels, for the same reason).

Two consequences are worth stating, because they read as regressions until you see what they buy.

**Card size stops being a measurement.** A title-sized card is bounded and uniform by construction, so a card's dimensions are a ratio constant rather than something read from the DOM. This deletes planned work: feeding measured sizes into ELK via `useNodesInitialized`, which React Flow's elkjs example does, is only necessary when nodes are content-sized and therefore differ from one another. Ours no longer do. It also removes a live hazard — the card's size currently exists twice, as `CARD_WIDTH`/`CARD_HEIGHT` in the app and again in `styles.css`, with nothing keeping them in sync, and a drift between them would place ports where the card isn't.

**Content leaves the graph projection.** `projectCardNodes` takes a `markdownByCardId` map and embeds every card's body into every node's data, eagerly, for text that is then clipped. With titles in the nodes, content is loaded when a card is opened or presented instead.

**Opening** is deliberately one verb across card kinds. ADR 0001 already has a viewer opening a space card to explore its nested graph in place; opening a markdown card to read it is the same gesture applied to a different kind, not a second concept.

The cost we accept: overview mode no longer shows any content at a glance, so an open interaction has to exist for the graph to remain useful — this cannot ship as titles-only and be finished later. And a future architecture pass will see a graph of "cards" that do not show their content and suggest showing it; that suggestion is this ADR, already considered.
