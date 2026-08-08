---
id: 00000000-0000-4000-8000-000000000045
title: The data model
---

Two small pieces, imported from `space.json` and the card Markdown files:

| Piece | Purpose |
| ----- | ------- |
| `cards` | Markdown content + frontmatter |
| `graphs` | Graphs of unique `{ from, to }` edges; cycles are allowed |

Cards *are* the graph, and graphs are its only structure — a Graph's edges reference cards directly.

A Zod schema validates shape; the `graph` package validates that every reference resolves.
