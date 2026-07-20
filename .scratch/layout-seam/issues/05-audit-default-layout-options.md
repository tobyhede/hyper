# Audit the default layout's ELK options

Status: resolved

## Context

The default layout's options (`DEFAULT_ELK_LAYOUT_OPTIONS` in `packages/react-flow-adapter/src/elk/layout.ts`, plus the per-node `portConstraints` and per-port `port.side`) were adapted from React Flow's [elkjs multiple-handles example](https://reactflow.dev/examples/layout/elkjs-multiple-handles), which the README cites. There is one commit in history, so provenance is the example plus later tuning — not a considered derivation.

Measured 2026-07-20 against elkjs 0.12.0, on the six-card demo (a chain) and on a three-route shared-spine graph:

| Option | Finding |
|---|---|
| `elk.algorithm: layered` | This *is* the strategy. Required by definition. |
| `org.eclipse.elk.port.side: WEST/EAST` | Load-bearing: inbound handles left, outbound right. (Stated as a domain rule when this was written; ADR 0007 has since removed Port from the glossary, so this is a rendering convention, not a domain one.) |
| `org.eclipse.elk.portConstraints` | The only knob that measurably changes output, and only with multiple routes. `FIXED_ORDER` vs `FIXED_SIDE` moves cards and reorders ports on a shared card (`r1@225 r2@150 r3@75` vs `r1@225 r2@75 r3@150`). See issue 04. |
| `elk.direction: RIGHT` | **Provably inert** — removing it gives byte-identical geometry, because RIGHT is ELK layered's default. |
| `elk.layered.nodePlacement.strategy: NETWORK_SIMPLEX` | ~~**No measurable effect** vs ELK's default on either shape tested.~~ **This row was wrong — see the correction below.** |
| spacing `160` / `80` / `18` | Cosmetic, tuned to the 260×300 card. `elk.spacing.nodeNode: 80` is straight from the upstream example. |

The headline: for what ships today, **essentially none of these are required**. A route is a sequence of cards, so any single route is a linear chain, and a chain gives ELK nothing to disambiguate. All variants produced identical positions on the demo. These options only begin doing work once several routes share cards.

## Correction, 2026-07-20 — the NETWORK_SIMPLEX row was wrong

The table above claimed NETWORK_SIMPLEX had no measurable effect on "either shape tested", including a three-route shared spine. That does not reproduce. The original measurement appears to have only exercised the chain.

Re-measured against real elkjs 0.12.0 with the real `DEFAULT_ELK_LAYOUT_OPTIONS` and the real per-card `FIXED_ORDER` / `port.side`, option present vs omitted, dumping every card position and handle offset. Deterministic across three runs.

| Shape | Result |
|---|---|
| Six-card demo chain (what ships) | **identical** |
| Three-route shared spine | **different** — card `a`: `y=187` with, `y=337` without |
| Three-route hub | **different** — all three sinks move, graph ~300px taller without |

```
hub    with NETWORK_SIMPLEX:  y1 y=12   y2 y=392  y3 y=772
hub    without:               y1 y=317  y2 y=697  y3 y=1077
```

Omitting the option means ELK layered's real default, `BRANDES_KOEPF`.

The disputed comment claimed NETWORK_SIMPLEX "aligns connected nodes vertically so their ports line up". Against the hub's outbound handles at absolute y 467 / 542 / 617, **each strategy aligns exactly one route and they disagree about which**: BRANDES_KOEPF aligns `r1`, NETWORK_SIMPLEX aligns `r2`, neither aligns all three. So the rationale is overstated rather than fabricated — no strategy delivers that property in general.

**Why this matters more than its size.** Deleting the option is behaviour-preserving for the shipped view, so `pnpm verify` and `pnpm e2e` both pass unchanged. The test suite would have signed off on silently choosing a different multi-route layout, with no decision recorded anywhere. What caught it was an explicit "stop if the geometry changes" precondition, not the tests.

Strategy selection is therefore a real design choice, not a cleanup. Split out as issue `08`.

A reproduction probe exists: drop `network-simplex-probe.test.ts` from the session scratchpad into `packages/react-flow-adapter/test/` and run it.

## Task

Reduce the default layout to the options that earn their place, and document why each survivor is there.

Specifically:

- `NETWORK_SIMPLEX` — **out of scope for this issue**, moved to `08`. Leave the option in place. Its code comment should lose the unsupported alignment claim, but the option itself is now known to change multi-route geometry and cannot be removed as a no-op.
- `elk.direction: RIGHT` is inert but domain-meaningful (the left-to-right reading axis a route follows). Reasonable to keep as explicit intent — say so, rather than leaving it looking load-bearing.
- Re-measure once multiple routes actually render; the shapes that discriminate are the shared-spine and hub graphs in `.scratch/multiple-routes/findings.md`, not the bundled demo.

## Acceptance

- Every remaining option has a recorded reason, distinguishing "encodes a domain rule" from "cosmetic tuning" from "explicit statement of an ELK default."
- No option is retained solely because it came from the upstream example.

## Answer

Closed by `08` plus a pass over the comment block.

`DEFAULT_ELK_LAYOUT_OPTIONS` now labels every option as one of three things: the
strategy itself, an explicit statement of an ELK default, or cosmetic tuning. The
acceptance bar — no option retained solely because it came from the upstream
example — is met, and `elk.spacing.nodeNode: 80` now records that it came from the
*plain* elkjs example rather than the multiple-handles one the README cites.

`elk.direction: RIGHT` is kept and labelled inert-but-intentional, as this issue
recommended.

The `NETWORK_SIMPLEX` question turned out to be a design decision rather than the
cleanup this issue assumed — see the correction above and `08` for the resolution.
