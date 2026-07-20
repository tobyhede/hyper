# A demo graph whose shape exercises the layout

Status: open

## Context

Issue 05 measured it: the bundled demo is a single route over six cards, which is a linear chain, and a chain gives ELK nothing to disambiguate. Every option variant produced identical positions. The graph we ship cannot show a layout change working or failing.

That leaves `03` unverifiable in the app — we can assert on ELK's returned geometry in a unit test, but nobody can look at the thing and see it is better.

## What each issue actually needs

Worth being precise, because the two issues have different requirements and only one of them is unblocked by this ticket.

**`03` (draw ELK's edge routing) needs a back-edge** — an edge whose target sits left of its source. The app renders one route at a time, and a route's rail is a linear chain by construction, so within a single route there is exactly one way to produce one: **a route that revisits a card**.

Trace `A → B → C → B` through the current code. `routeCardIds` returns the distinct cards in first-visit order, `[A, B, C]`. `buildRouteEdges` emits one edge per adjacent step pair, so step 2 gives an edge `C → B` using `main::out` on C and `main::in` on B. B is laid out left of C, so that edge runs backward — and React Flow draws it as a bezier that leaves rightward, reverses and hooks back, which is the stub described in `findings.md` Finding 4.

ADR 0003 explicitly permits a route to revisit a card, so this is legal content, not a contrived case.

One thing to look at while doing it: B already carries a `main::in` port from step 1, so both inbound edges land on the *same* port. README calls this "a visual overlap, not a crash". With ELK routing drawn properly it may read fine, or it may want two ports. Find out rather than assuming.

**`04` (FIXED_SIDE port constraints) needs several routes drawn together**, sharing a spine, so their ports braid. The app renders one route at a time, so *no demo graph can exercise it* under the current view. `04` is blocked on multi-route rendering, not on this ticket. This corrects an earlier assumption that a richer demo would unblock both.

## Task

Give the bundled demo a route that revisits a card.

**Decision needed: real cards or abstract ones.** The proposal on the table was abstract cards (`A > B > C > D`, `A > C > D`, `A > E`) as a clearer test bed. Note that shape is *acyclic* — the union of its step-orders is `A→B, B→C, C→D, A→C, A→E` with no cycle — so it produces no back-edge and would not exercise `03`.

Recommendation: keep the six real cards and add routes over them. The bundled deck is the only place the product explains itself, README points at it, and it is what someone sees on first run; making it a test fixture costs that. Structure and content are orthogonal — the existing cards can carry any route shape.

## Acceptance

- The demo contains at least one route that revisits a card, producing a visible back-edge.
- The shape is documented in the manifest or alongside it, so the next person knows which cases it is there to cover.
- `pnpm e2e` updated. Its node/edge/port counts and the `1 / 6` step counter are all shape-dependent and will change — deliberately, once. They stop being a refactor guard until they settle.

## Also

`.scratch/multiple-routes/findings.md` has the shared-spine and hub graphs already worked out, with measurements. Read it before inventing new shapes.
