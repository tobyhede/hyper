# Choose the ELK node placement strategy

Status: resolved
Blocked by: multi-route/01 (resolved), layout-seam/04 (resolved)

## Context

Split out of `05`, which assumed removing `elk.layered.nodePlacement.strategy: NETWORK_SIMPLEX` was a no-op cleanup. It isn't — see the correction in `05` for the measurements. Omitting it selects ELK layered's real default, `BRANDES_KOEPF`, and the two produce different geometry on every multi-route shape tested.

The choice is real:

- **NETWORK_SIMPLEX** is noticeably more compact vertically — the hub graph is ~300px shorter.
- **BRANDES_KOEPF** is ELK's default, and the value a mature third-party derivative of the same React Flow example sets deliberately.
- Neither delivers the port-alignment property the current code comment claims. Against the hub's outbound handles, each aligns exactly one route and they disagree about which.

Provenance argues mildly against the incumbent: `NETWORK_SIMPLEX` appears in neither upstream React Flow example, so it was invented here with a rationale that does not survive measurement.

## Blocked

The shapes that discriminate are multi-route. Until several routes render together, any choice made here is invisible and unverifiable — which is exactly how the current value got in.

## Task

Once multi-route renders, compare both strategies on the real app, not a harness. Judge on legibility with several routes sharing cards, not on compactness alone. Record the reason either way, and fix the code comment regardless of which wins.

Do this *after* `04` (`FIXED_SIDE`), since port constraints and placement strategy interact — measuring one against a wrong value for the other wastes the measurement.

## Acceptance

- One strategy chosen, with a recorded reason and the shape it was judged on.
- The unsupported "aligns connected nodes vertically" comment is gone.

## Answer

**BRANDES_KOEPF**, set explicitly rather than by omission.

Measured under `FIXED_SIDE` (issue 04, which had to land first). The metric is
`bend` — the total vertical deviation of the rails, summing `|source handle y -
target handle y|` in absolute coordinates over every edge. That is precisely what
the disputed comment claimed NETWORK_SIMPLEX improves, so it is the honest test of
it. `h` is the graph's total height.

```
shape                        NETWORK_SIMPLEX      BRANDES_KOEPF
demo (2 routes, shipped)     bend  122  h  411    bend    0  h  350
long (2 routes, skipping)    bend  122  h  411    bend    0  h  350
spine x2                     bend  560  h  680    bend  560  h  680
spine x3                     bend 1220  h 1060    bend 1525  h 1365
spine x4                     bend 2560  h 1440    bend 3200  h 1760
spine x5                     bend 3960  h 1820    bend 5280  h 2480
spine x6                     bend 6072  h 2200    bend 8091  h 2874
```

**The comment was backwards for the shape that ships.** BRANDES_KOEPF lays the
demo out with *zero* vertical deviation — perfectly horizontal rails — and
NETWORK_SIMPLEX introduces 122 while making the graph 15% taller.

The reversal happens at three routes sharing a spine, after which NETWORK_SIMPLEX
wins by 20-25% and the gap widens. That is a real advantage and it was worth
measuring, but it is an improvement to a layout that is bendy either way: at three
routes both are over 1200. BRANDES_KOEPF's advantage at two routes is qualitative
— straight versus not — while NETWORK_SIMPLEX's at six is proportional.

Two things decided it beyond the numbers: BRANDES_KOEPF is ELK's own default, so
it is the least surprising choice; and NETWORK_SIMPLEX appears in neither upstream
example, so it was invented here on a rationale that turns out to be false for the
shipped shape.

**Set explicitly, not omitted.** Omitting it would make the layout depend on an
ELK default that could change between versions, silently. `05`'s bar is that every
option has a recorded reason — an explicit statement of a default qualifies.

The whole option block now carries per-option reasons, each labelled as a domain
rule, an explicit default, or cosmetic tuning.

**Revisit if real spaces routinely carry four or more routes.** That is the
condition under which this decision flips, and it is written into the code comment
rather than left here.

`pnpm verify` 56 tests green, `pnpm e2e` 5 green.
