# Switch ELK port constraints to FIXED_SIDE

Status: resolved
Blocked by: multi-route/01 (resolved)

## Context

`buildElkGraph` sets `portConstraints: FIXED_ORDER`. When several routes share a spine, the ports are pinned in route order but the two sides disagree, so the rails braid between shared cards. Measured in `.scratch/multiple-routes/findings.md` Finding 3: a 4-route shared spine went from 18 crossings to 0 with `FIXED_SIDE`, with no downside observed on single-route graphs.

Crossings are purely a configuration problem. Back-edges caused by genuine order cycles are not — config only decides how the unavoidable backward rail is drawn.

## Blocked

Braiding needs several routes drawn together over a shared spine. The app renders one route at a time, so this cannot be observed — in the demo or in any other graph — until multi-route rendering exists. The measurement in `findings.md` came from a standalone harness, not the app. `multi-route/01` unblocks this — the demo's two routes share a spine.

## Task

Switch to `FIXED_SIDE` unless the vertical *order* of ports on a card is meant to carry meaning. It currently does not.

## Acceptance

- No rail braiding on shared spines.
- Single-route layout unchanged or better.

## Answer

Done, and found by looking at the app rather than by working the ticket — the
defect was visible within minutes of `multi-route/01` landing, reported as
"layout is slightly weird", with the correct diagnosis attached: the port order
on the first card was the reverse of the order on the terminal card.

The cause is sharper than "the two sides disagree". **ELK orders `FIXED_ORDER`
ports clockwise around the node**: EAST runs top-to-bottom, WEST runs
*bottom-to-top*. `buildLayoutGraph` hands both sides the same list order (routes
in manifest order), so the inbound side comes back mirrored.

Measured on the demo, `main` and `quick` sharing three cards:

```
                   FIXED_ORDER                 FIXED_SIDE
intro   EAST   main@100  quick@200        main@200  quick@100
model   WEST   main@200  quick@100        main@200  quick@100
        EAST   main@100  quick@200        main@200  quick@100
demo    WEST   main@200  quick@100        main@200  quick@100
```

Under `FIXED_ORDER` a route leaves a card at one height and arrives at the next
at the other, so the two routes swap places between every pair of shared cards.
Under `FIXED_SIDE` each route holds one height across the whole graph.

Two regression tests in `elk-layout.test.ts` cover it, both on a two-route shared
spine: a route's outbound offset on one card equals its inbound offset on the
next, and two routes never share an offset on the same card. The first is the one
that fails under `FIXED_ORDER`.

Note the ticket's framing was "unless the vertical order of ports on a card is
meant to carry meaning — it currently does not." That held, but it was the wrong
reason to be confident: the problem was never the order carrying meaning, it was
the two sides being ordered by opposite conventions.

`pnpm verify` 56 tests green, `pnpm e2e` 5 green.
