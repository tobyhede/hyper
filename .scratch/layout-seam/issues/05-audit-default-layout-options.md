# Audit the default layout's ELK options

Status: open

## Context

The default layout's options (`DEFAULT_ELK_LAYOUT_OPTIONS` in `packages/react-flow-adapter/src/elk/layout.ts`, plus the per-node `portConstraints` and per-port `port.side`) were adapted from React Flow's [elkjs multiple-handles example](https://reactflow.dev/examples/layout/elkjs-multiple-handles), which the README cites. There is one commit in history, so provenance is the example plus later tuning — not a considered derivation.

Measured 2026-07-20 against elkjs 0.12.0, on the six-card demo (a chain) and on a three-route shared-spine graph:

| Option | Finding |
|---|---|
| `elk.algorithm: layered` | This *is* the strategy. Required by definition. |
| `org.eclipse.elk.port.side: WEST/EAST` | Load-bearing, and the only option encoding a **domain rule** — `CONTEXT.md`'s Port: inbound left, outbound right. |
| `org.eclipse.elk.portConstraints` | The only knob that measurably changes output, and only with multiple routes. `FIXED_ORDER` vs `FIXED_SIDE` moves cards and reorders ports on a shared card (`r1@225 r2@150 r3@75` vs `r1@225 r2@75 r3@150`). See issue 04. |
| `elk.direction: RIGHT` | **Provably inert** — removing it gives byte-identical geometry, because RIGHT is ELK layered's default. |
| `elk.layered.nodePlacement.strategy: NETWORK_SIMPLEX` | **No measurable effect** vs ELK's default on either shape tested. |
| spacing `160` / `80` / `18` | Cosmetic, tuned to the 260×300 card. `elk.spacing.nodeNode: 80` is straight from the upstream example. |

The headline: for what ships today, **essentially none of these are required**. A path is a sequence of cards, so any single path is a linear chain, and a chain gives ELK nothing to disambiguate. All variants produced identical positions on the demo. These options only begin doing work once several routes share cards.

## Task

Reduce the default layout to the options that earn their place, and document why each survivor is there.

Specifically:

- `NETWORK_SIMPLEX` carries a code comment claiming it "aligns connected nodes vertically so their ports line up, which keeps the path rails close to horizontal." No evidence for this was reproducible. Either find a graph shape where it demonstrably helps and record it, or drop the override and the comment.
- `elk.direction: RIGHT` is inert but domain-meaningful (the left-to-right reading axis a route follows). Reasonable to keep as explicit intent — say so, rather than leaving it looking load-bearing.
- Re-measure once multiple routes actually render; the shapes that discriminate are the shared-spine and hub graphs in `.scratch/multiple-routes/findings.md`, not the bundled demo.

## Acceptance

- Every remaining option has a recorded reason, distinguishing "encodes a domain rule" from "cosmetic tuning" from "explicit statement of an ELK default."
- No option is retained solely because it came from the upstream example.
