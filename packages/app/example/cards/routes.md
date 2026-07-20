## Routes as slide decks

A **route** is an ordered list of card targets.

```json
{ "id": "quick", "title": "Quick tour",
  "steps": [{ "target": "intro" }, { "target": "demo" }] }
```

Presentation mode walks the steps:

- `→` next step
- `←` previous step
- the viewport fits the current card
