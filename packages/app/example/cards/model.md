## The data model

Four small pieces, defined in `graph.json`:

| Piece | Purpose |
| ----- | ------- |
| `cards` | Markdown content + title |
| `nodes` | A card placed at a position |
| `edges` | Relationships between nodes |
| `paths` | Ordered walkthroughs |

A Zod schema validates shape; the `graph` package validates that every reference resolves.
