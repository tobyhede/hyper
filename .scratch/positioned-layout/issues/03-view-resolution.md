# 03 — View resolution in the app

Status: open
Type: task
Blocked by: 01, 02

`App.tsx:47` hardcodes `const layout = elkStrategy()`. Replace it with the
resolution chain, which for the fixture — declaring nothing — resolves to exactly
what happens today. Behaviour-preserving by design.

```
space.defaultView → viewer default (no surface yet) → route-driven graph (ELK)
```

- A resolved positioned layout becomes `positionedStrategy(map)`; a resolved
  automatic kind becomes `elkStrategy()` or `gridStrategy()`.
- The resolved view's **kind** has to reach `GraphView` — 04 needs it for
  `nodesDraggable`, so surface it now rather than threading it later.
- A view picker in the toolbar is *not* in this ticket unless it falls out for
  free; the chain is what matters.

The e2e assertion `edges are drawn along ELK's routing` becomes a test of the ELK
*view*, not of the default view. It still passes unchanged here (the fixture
resolves to ELK) — but rename/reframe it now, while it is still true by default,
rather than after 05 makes it accidental.

## Acceptance

- The fixture renders identically: `pnpm e2e` green and unchanged apart from the
  reframed assertion.
- A unit test per resolution branch, including a space whose `defaultView` names
  a positioned layout.
- `pnpm verify` green.
