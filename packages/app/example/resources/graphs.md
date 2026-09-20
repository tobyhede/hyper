---
id: 00000000-0000-4000-8000-000000000047
title: Graphs are graphs
---

A **Graph** is a set of directed edges between resources.

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

A resource may have several edges out — a **fork** — and several in — a **merge**.
A Graph may contain cycles and self-edges; presenting decides how to traverse
them. A **reference resource** is a distinct resource with its own title and position that shows
another resource's content, not a workaround for returning to an existing resource.

A Graph whose Resources form a single chain, with one outgoing Edge from each
non-terminal Resource and no branches or merges, is a **line**. It is the degenerate
graph, not a second kind of Graph.
