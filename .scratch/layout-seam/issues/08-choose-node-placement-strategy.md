# Choose the ELK node placement strategy

Status: open
Blocked by: multi-route/01, then layout-seam/04

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
