# A demo graph whose shape exercises the layout

Status: resolved

## Context

Issue 05 measured it: the bundled demo is a single route over six cards, which is a linear chain, and a chain gives ELK nothing to disambiguate. Every option variant produced identical positions. The graph we ship cannot show a layout change working or failing.

That leaves `03` unverifiable in the app — we can assert on ELK's returned geometry in a unit test, but nobody can look at the thing and see it is better.

## What each issue actually needs

Worth being precise, because the two issues have different requirements and only one of them is unblocked by this ticket.

**`03` (draw ELK's edge routing) needs a back-edge** — an edge whose target sits left of its source. The app renders one route at a time, and a route's rail is a linear chain by construction, so within a single route there is exactly one way to produce one: **a route that revisits a card**.

Trace `A → B → C → B` through the current code. `routeCardIds` returns the distinct cards in first-visit order, `[A, B, C]`. `buildRouteEdges` emits one edge per adjacent step pair, so step 2 gives an edge `C → B` using `main::out` on C and `main::in` on B. B is laid out left of C, so that edge runs backward — and React Flow draws it as a bezier that leaves rightward, reverses and hooks back, which is the stub described in `findings.md` Finding 4.

ADR 0003 explicitly permits a route to revisit a card, so this is legal content, not a contrived case.

One thing to look at while doing it: B already carries a `main::in` port from step 1, so both inbound edges land on the *same* port. README calls this "a visual overlap, not a crash". With ELK routing drawn properly it may read fine, or it may want two ports. Find out rather than assuming.

**`04` (FIXED_SIDE port constraints) needs several routes drawn together**, sharing a spine, so their ports braid. The app renders one route at a time, so *no demo graph can exercise it* under the current view. `04` is blocked on `multi-route/01`, not on this ticket. This corrects an earlier assumption that a richer demo would unblock both.

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

## Answer

Resolved differently from the ticket's recommendation. Rather than adding a route
to the six real demo cards (which conflates the product showcase with a test
fixture — the friction the ticket itself named), an **abstract fixture** was
added at `packages/app/fixture/` and made the space `pnpm dev` loads. The
narrative demo stays in `packages/app/example/`, dormant, for when real
space-loading exists. This keeps test data abstract and behaviour-shaped, and
decouples e2e from demo prose — a decision taken with the user, who was explicit
that fixtures must not be content.

Shape (settled after several rounds of review): two **disconnected collections**
sharing no cards, which ELK lays out as separate bands —

1. `Long A → B → C → D → A′`, `Mid A → B → C → D`, `Short A → B → C` — several
   routes over one spine (the compatible-overlay case).
2. `Echo E → F → G → H → E′` — a plain linear collection.

Aliases `A′`/`E′` return each collection to its start and are named to match the
`↳` marker. Documented in `fixture/README.md`, which maps each card and route to
the behaviour it covers.

The path here was iterative and worth recording, because it ended somewhere the
ticket didn't anticipate. Early cuts tried to *show* `03`'s back-edge in the app
by giving a collection a revisit (`Loop I → J → K → J`); reviewing the renders,
the revisit was the only thing that ever tangled or crowded, and chasing it turned
into a pile of global ELK spacing/alignment tuning. Stepping back, the real
question was whether a route should revisit a card at all — and the answer was no
(**ADR 0012**): a return is an alias, not a backward edge. So the revisit
collection was removed, the ELK tuning reverted to baseline, and the fixture is the
two clean bands above. `03`'s back-edge rendering is proven by the unit test, not
the fixture.

- No app-side space selector: one space is served, no query string.
- `pnpm e2e` asserts behaviour against the fixture (15 tests, all content-agnostic).
  Counts: 10 nodes / 13 edges / 26 handles / 4 routes; presenting Long is a 5-slide
  deck.
