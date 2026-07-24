# 03 — View resolution in the app

Status: resolved
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

## Answer

Shipped in `59802c7`. `packages/app/src/view.ts` holds `resolveView(space) →
{ id, strategy, automatic, layout }` (the `automatic` field came later, in 05).
`App.tsx` calls it in place of the hardcoded `elkStrategy()`; the fixture
declares nothing, so it resolves to the route-driven ELK graph exactly as before.
The view's editability reaches `GraphView` as `editable` — whether it resolved to
a Layout, which is what 04 needed.

Seven unit tests in `packages/app/test/view.test.ts`, one per branch. The
open question the ticket named — a declared Layout shadowing a built-in of the
same name — was resolved in the space's favour: the space's own data outranks a
reserved word, and `loadSpace` permits the collision because which one wins is a
resolution decision, made here.

The e2e reframe landed too: `edges are drawn along ELK's routing` reads as a test
of the ELK view rather than of "the default", so 05 making the default
incidental did not falsify it.
