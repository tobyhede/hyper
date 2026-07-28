---
id: 00000000-0000-4000-8000-000000000045
title: The data model
---

Two small pieces, imported from `space.json` and the card Markdown files:

| Piece | Purpose |
| ----- | ------- |
| `cards` | Markdown content + frontmatter |
| `routes` | Acyclic graphs of `{ from, to }` edges |

Cards *are* the graph, and routes are its only structure — a route's edges reference cards directly.

A Zod schema validates shape; the `graph` package validates that every reference resolves.
