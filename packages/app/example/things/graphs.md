---
id: 00000000-0000-4000-8000-000000000047
title: Graphs are graphs
---

A **Graph** is a set of directed edges between things.

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

A thing may have several edges out — a **fork** — and several in — a **merge**.
A Graph may contain cycles and self-edges; presenting decides how to traverse
them. An **alias** is a distinct thing with its own title and position that shows
another thing's content, not a workaround for returning to an existing thing.

A Graph whose Things form a single chain, with one outgoing Edge from each
non-terminal Thing and no branches or merges, is a **line**. It is the degenerate
graph, not a second kind of Graph.
