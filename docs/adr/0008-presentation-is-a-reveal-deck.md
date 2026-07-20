# Presenting is a reveal.js deck; opening a card is not presenting

Status: accepted
Refines: 0006

**Opening** a card and **presenting** a route are different things, drawn by different machinery.

Opening shows one card for reading, in place, over the graph — the centred 16:9 frame that exists today. Presenting takes over the screen and steps through a route's cards as a deck, rendered by **reveal.js**.

## Why they are not one surface

Earlier in the same session these were unified: presenting "opened" each card in turn, and the only difference was the footer — a Close button or step controls. That was wrong, and the reason is that the two differ in more than their actions.

Opening is a reading gesture inside the graph. The graph is still the thing you are looking at; a card is shown over it and dismissed. Presenting is a mode change: the graph goes away by definition, the audience is not the author, and the surface acquires a whole vocabulary opening has no use for — transitions, fragments, a speaker view, an exported PDF, a timer.

Unifying them made the smaller surface carry the larger one's future. Every one of those features would have had to be either built into the reading panel or branched around.

## Why reveal.js rather than our own

The features above are the bulk of what a presentation tool is, and none of them are what this project is *about*. This project is about routes over a graph of cards. A deck is an **output** of that, not the model — and reveal.js is a mature, well-understood implementation of the output.

Specifically, speaker view (a second window, synchronised over `postMessage`, with next-card preview, notes and a timer) and PDF export (laying slides onto print pages) are substantial, fiddly, and solved there. Fixed-canvas scaling — the problem that prompted this — comes free.

We rejected wrapping reveal for *both* surfaces. A reading panel is not a one-slide deck, and making it one would import a deck engine's lifecycle into a gesture that needs none of it.

We also rejected hand-rolling on the grounds that only the scaling was needed. That was true when scaling was the only thing wanted, and stopped being true as soon as speaker view and export were on the list.

## What we accept

**reveal owns the deck.** It manages its own DOM, so a route's steps are rendered into `<section>` elements and `Reveal.sync()` is called when they change; the step index is bound in both directions between our store and `Reveal.slide()`. Slide bodies are handed over as HTML rather than diffed by React, because two things cannot own the same nodes.

**A framework dependency in the app.** It stays in `@project/app`, wired like any other rendering concern. `@project/core` and `@project/graph` remain framework-free — the deck is fed *from* the domain model and never into it.

**Two surfaces to keep visually coherent.** That is the cost of separating them, and it is the right way round: they should look related because they show the same cards, not because they are the same code.

**reveal's model is a linear deck**, which a Route already is — an ordered list of steps. Where the models diverge is anything reveal expresses that a Route does not: **fragments** (progressive reveal within a slide) would mean a Step targeting part of a card, which `CONTEXT.md` currently forbids. Adopting fragments is a glossary change, and it must be made deliberately rather than inherited by using the library.

## The cost we accept

A future review will see a graph-native tool embedding a deck framework and suggest removing it to unify the two surfaces, or replacing it now that the scaling problem has a CSS answer. That suggestion is this ADR: the scaling was never the reason.
