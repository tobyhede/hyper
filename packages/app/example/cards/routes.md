---
id: 00000000-0000-4000-8000-000000000047
title: Routes are graphs
---

A **route** is a set of directed edges between cards.

```json
{ "id": "quick", "title": "Quick tour",
  "edges": [{ "from": "intro", "to": "demo" }] }
```

A card may have several edges out — a **fork** — and several in — a **merge**.
What a route may not do is close a cycle: returning to earlier content is an edge
to an **alias**, a distinct card showing the same content.

A route that gives every card one edge out is a **line**. That is the degenerate
graph, not a second kind of route.
