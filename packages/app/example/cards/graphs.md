---
id: 00000000-0000-4000-8000-000000000047
title: Graphs are graphs
---

A **Graph** is a set of directed edges between cards.

```json
{
  "id": "00000000-0000-4000-8000-000000000031",
  "title": "Quick tour",
  "edges": [
    {
      "from": "00000000-0000-4000-8000-000000000027",
      "to": "00000000-0000-4000-8000-000000000041"
    }
  ]
}
```

A card may have several edges out — a **fork** — and several in — a **merge**.
A Graph may contain cycles and self-edges; presenting decides how to traverse
them. An **alias** is a distinct card with its own title and position that shows
another card's content, not a workaround for returning to an existing card.

A Graph that gives every card one edge out is a **line**. That is the degenerate
graph, not a second kind of Graph.
