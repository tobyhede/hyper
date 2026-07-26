---
id: model
title: The data model
---

Two small pieces, defined in `graph.json`:

| Piece | Purpose |
| ----- | ------- |
| `cards` | Markdown content + title |
| `routes` | Acyclic graphs of `{ from, to }` edges |

Cards *are* the graph, and routes are its only structure — a route's edges reference cards directly.

A Zod schema validates shape; the `graph` package validates that every reference resolves.
