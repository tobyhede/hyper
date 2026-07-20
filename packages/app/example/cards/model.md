## The data model

Three small pieces, defined in `graph.json`:

| Piece | Purpose |
| ----- | ------- |
| `cards` | Markdown content + title |
| `edges` | Relationships between cards |
| `routes` | Ordered walkthroughs |

Cards *are* the graph — edges and route steps reference them directly.

A Zod schema validates shape; the `graph` package validates that every reference resolves.
