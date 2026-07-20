# Recursive spaces: a card may itself be a space

Status: accepted

A **space** is a graph of **cards**. A card's content is either Markdown (a leaf) or *another space*, which the viewer opens and explores in place — so spaces nest arbitrarily deep. We chose this over a flat, single-level graph (which would force large presentations into one sprawling canvas) and over a separate "subgraph" concept sitting beside cards (which duplicated the space idea and gave authors two things to learn). Recursion through the card type keeps one primitive — a space — and makes composition and drill-down fall out of it. The cost we accept: navigation, routing, and layout all have to be defined per level and reason about descending into and returning from nested spaces, rather than operating on one global graph.
