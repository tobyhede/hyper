# Switch ELK port constraints to FIXED_SIDE

Status: open

## Context

`buildElkGraph` sets `portConstraints: FIXED_ORDER`. When several routes share a spine, the ports are pinned in route order but the two sides disagree, so the rails braid between shared cards. Measured in `.scratch/multiple-routes/findings.md` Finding 3: a 4-route shared spine went from 18 crossings to 0 with `FIXED_SIDE`, with no downside observed on single-route graphs.

Crossings are purely a configuration problem. Back-edges caused by genuine order cycles are not — config only decides how the unavoidable backward rail is drawn.

## Task

Switch to `FIXED_SIDE` unless the vertical *order* of ports on a card is meant to carry meaning. It currently does not.

## Acceptance

- No rail braiding on shared spines.
- Single-route layout unchanged or better.
