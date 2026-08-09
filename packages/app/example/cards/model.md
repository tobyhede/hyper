---
id: 00000000-0000-4000-8000-000000000045
title: The data model
---

Two small pieces, imported from `space.json` and the card Markdown files:

| Piece | Purpose |
| ----- | ------- |
| `cards` | Markdown content + frontmatter |
| `graphs` | Graphs of unique `{ from, to }` edges; cycles are allowed |

Cards provide the content, and Graphs are the only connection structure — each
Graph's Edges reference Cards directly.

A Zod schema validates shape; the `graph` package validates that every reference resolves.
