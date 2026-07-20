Two small pieces, defined in `graph.json`:

| Piece | Purpose |
| ----- | ------- |
| `cards` | Markdown content + title |
| `routes` | Ordered walkthroughs |

Cards *are* the graph, and routes are its only structure — route steps reference cards directly.

A Zod schema validates shape; the `graph` package validates that every reference resolves.
