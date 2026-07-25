# Presenting is traversing a route; there is no deck

Status: accepted
Supersedes: 0008
Refined by: 0027
Related: 0011, 0023

Presenting a route is walking its edge graph. At a card, the presenter follows one of that card's outgoing edges to the next card. That is the whole of it. There is no deck artefact, no slide sequence, and no presentation framework: reveal.js is removed.

## Why 0008 was wrong

ADR 0008 separated opening from presenting on the grounds that presenting "acquires a whole vocabulary opening has no use for — transitions, fragments, a speaker view, an exported PDF, a timer", and adopted reveal.js because those "are the bulk of what a presentation tool is" and are solved there. It named two specifically — speaker view and PDF export — and was explicit that fixed-canvas scaling "was never the reason".

Neither was built. Both were filed as tickets the day reveal landed (`reveal-presentation/02`, `03`) and both sat open. So the dependency was carried on the strength of features that never arrived, while the thing it actually delivered — a linear slide sequence — is the one shape a route no longer has (ADR 0023).

0008 anticipated a review like this and pre-refused it: "A future review will see a graph-native tool embedding a deck framework and suggest removing it to unify the two surfaces, or replacing it now that the scaling problem has a CSS answer. That suggestion is this ADR: the scaling was never the reason." That refusal holds against the argument it names, and this is not that argument. This is that the two features which *were* the reason are unbuilt and now deprioritised, and that a route stopped being a sequence.

## What traversal replaces

ADR 0023 deferred "how a branching route becomes an ordered deck — the **linearization** question", listing three candidate answers: an authored spine, a traversal, a presenter choosing at each fork. Traversal is chosen, and the effect is that the question dissolves rather than gets answered. A traversal consumes edges, not an order, so there is nothing to linearize and no order to pick.

**A linear route is not a special case.** It is the degenerate graph in which every card has one outgoing edge, so "advance" is unambiguous and traversal is indistinguishable from stepping a deck. Branching differs only where a card has more than one edge out and the presenter chooses one. This is one mechanism, not two modes — nothing in the code should test whether a route is linear, and no `isLinear` flag should appear.

A merge reaches a card by two paths, which 0023 flagged as presentation's problem to solve. Under traversal it is not a problem: arriving at a card twice by different routes through the graph is a walk, not a duplicate slide, because there is no sequence to deduplicate against.

## What ADR 0011 keeps

0011 refines 0008 and draws its distinction against the deck: opening shows a card's Markdown *source*, and "the one place a card's Markdown is parsed and drawn rendered is the Presentation deck." The distinction survives with the deck removed — opening shows source, presenting shows rendered content — and only the noun changes.

## What is removed

`reveal.js`, `@types/reveal.js`, `PresentationDeck.tsx`, and the store's `stepIndex`. Speaker view and PDF export leave the tracker as wanted features. If either returns it returns as its own decision, designed against a traversal surface, rather than inherited by using a library.

Fixed-canvas scaling unifies on the technique `card-display/05` chose — a fixed logical canvas with proportional typography in container-query units — which the reading surface already uses. Two implementations of the same 1280x720 canvas become one, and text stays selectable rather than being rasterised by `transform: scale()`.

## The cost we accept

Everything 0008 listed. Transitions, fragments, a timer, a speaker window and a printable export are ours to build if they are ever wanted, and 0008's estimate of that work — "substantial, fiddly, and solved there" — was accurate then and is accurate now.

We accept it because a deck framework's model is a sequence and ours is a graph, so the impedance is paid at every fork, on every decision, in exchange for two features that do not exist.

A future review will find a presentation surface with no framework behind it and suggest adopting one — reveal.js, impress.js, Spectacle — to get speaker view or export cheaply. That suggestion is this ADR. The question to ask of any candidate is whether its model is a sequence; if it is, it will fight a route's shape everywhere the route branches. A framework whose model is a *spatial canvas* rather than a sequence does not have that defect and is not foreclosed here — but it would be adopted for traversal, not for a deck.
