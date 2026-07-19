## Paths as slide decks

A **path** is an ordered list of node targets.

```json
{ "id": "quick", "title": "Quick tour",
  "steps": [{ "target": "intro-node" }, { "target": "demo-node" }] }
```

Presentation mode walks the steps:

- `→` next step
- `←` previous step
- the viewport fits the current node
