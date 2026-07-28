---
id: 00000000-0000-4000-8000-000000000046
title: Rendering the graph
---

[React Flow](https://reactflow.dev) draws the spatial layout.

- Each card becomes a **custom card node**
- Each step transition becomes a colored edge
- A card shows its title; open it to read the Markdown

The projection from domain model to React Flow lives in one isolated adapter package.
