# Multi-route overlay — spike findings

Throwaway spike. **Do not merge into the model or the shipped view.** This feeds the
human/model decision; it does not pre-empt it.

Written before the Route rename, so the identifiers here are the old ones —
`buildPathEdges` is now `buildRouteEdges`, `buildNodeHandles` is `buildCardHandles`,
`filterHandlesByPath` is `filterHandlesByRoute`, and `packages/graph/src/paths.ts` is
`routes.ts`. Left as-is deliberately: this is a record of what was measured, against the
code as it stood.

Question: today the app renders one Route at a time and `AGENTS.md` bans overlay because
it supposedly makes ELK "reconcile conflicting orderings and the graph turns to
spaghetti." Is that true, and if not, where is the real boundary?

---

## TL;DR

1. **The `AGENTS.md` rationale is a misdiagnosis.** The "spaghetti" in the current build
   is not ELK failing at overlay — it is a **port-id collision bug** in the shipped
   `buildElkGraph`. It is severe enough that it degrades **even the single-route view**:
   the bundled demo's "Main walkthrough" already renders with a backward-looping rail
   (screenshot below). Overlay didn't cause this; the id scheme did.

2. **Compatible overlays render cleanly.** With the bug fixed (namespace ELK port ids per
   node), 3-route DAGs, 4-route shared spines, and a 6-route hub all lay out with every
   rail followable by colour and **zero back-edges**. The context's hand-test result
   reproduces exactly.

3. **The boundary is exact and computable.** Build one directed graph from *every* route's
   consecutive steps (`step[i] → step[i+1]`, unioned across all routes). **Overlay is clean
   iff that combined graph is acyclic.** A cycle in it — two routes disagreeing on X-vs-Y,
   a reverse route, a route revisiting a node — forces at least one backward rail that **no
   ELK configuration can remove.** Across all six test graphs, `backEdges > 0` ⇔ the
   combined order has a cycle, with no exceptions.

4. **Two different problems, two different fixes.** *Crossings* (rails braiding between
   shared nodes) are cosmetic and **config-fixable** (`FIXED_SIDE` ports: g2 went 18 → 0
   crossings). *Back-edges* (a route running right-to-left) are **topological** and only
   removable by not overlaying the conflicting routes.

5. **What you see is React-Flow, not ELK — and that matters for cycles.** The app uses ELK
   only for node positions + port offsets and **discards ELK's edge routing**, drawing its own
   beziers. That is why conflict rails render as broken stubs (Finding 4). Drawing ELK's routed
   edges instead makes back-edges legible, and revisit cycles can be unrolled into duplicate
   nodes that share a card — so cycles are more tractable than "unrenderable" implied (Finding 5).

6. **Recommendation:** pursue multi-route, but as **overview-with-highlight**, not
   unconstrained full overlay. Full simultaneous overlay is legible only for compatible,
   ≤~4-route graphs. First fix the port-id bug (it is worth doing regardless of the overlay
   decision). Render ELK's edge routing. Narrow the `AGENTS.md` rule from "no overlay" to "no
   conflicting-order overlay."

---

## Method & fidelity

- Harness (`harness.js`, `graphs.js`, `index.html`, `driver.mjs`) reimplements the shipped
  derivation **verbatim** — `buildNodeHandles` / `buildPathEdges` (`packages/graph`) and
  `buildElkGraph` (`packages/react-flow-adapter`) — runs the **real elkjs 0.12.0**, and
  draws each Route as its own coloured port-to-port bezier rail (the same thing React-Flow
  draws between the same ELK-computed port offsets). Playwright screenshots each graph ×
  config to `renders/`.
- **Faithfulness was checked against the real shipped code**, not just the copy. `verify.test.ts`
  imports the actual `@project/graph` + `@project/react-flow-adapter` and runs the exact
  `layoutNodes`/`layoutEdges` `App.tsx` builds. Its numbers match the harness (e.g. g1
  overlay = 4 back-edges in both), and its single-route result is confirmed visually in the
  **real running app**. So the renders below are trustworthy stand-ins for React-Flow.
- Metrics per render: `crossings` (straight-chord intersections between rails — a proxy for
  visual tangle), `backEdges` (a rail whose target node is laid out at or left of its
  source — a route running against the grain), `layers`. Full data in `metrics.json`.

---

## Finding 1 — the real "spaghetti" is a port-id collision bug (hits single route too)

The shipped `buildElkGraph` uses the bare handle id as both the ELK port id **and** the
edge endpoint:

```ts
// packages/react-flow-adapter/src/elk/layout.ts
sources: [edge.sourceHandle || edge.source],   // e.g. "main::out"
```

But `outHandleId(pathId)` = `` `${pathId}::out` `` is **the same on every node the route
passes through** (`packages/graph/src/paths.ts`). So ELK receives edges whose endpoint
`"main::out"` exists on 4 different nodes and **cannot tell which node the edge attaches
to.** It resolves arbitrarily, and the layout collapses.

Verified against the real code (`getElkLayout`, real derivation):

| Case (real shipped code) | back-edges | node x-positions |
|---|---|---|
| G0 single chain A→B→C→D→E | **1** | `A=12 B=292 C=572 D=12 E=432` — **D collapses to layer 0** |
| Bundled demo "Main walkthrough" | **1** | `…rendering=852 paths=12…` — **paths-node collapses to layer 0** |
| G1 (3-route overlay) | **4** | matches harness `sharedIds` exactly |

The real app, single route, "Main walkthrough" — the shipped demo, not overlay:

![real app main route](renders/real_app_main_route.png)

The first four cards flow left-to-right, then the rail dives from "Rendering" (top-right)
all the way back to "Paths as slide decks" at the **far bottom-left** and forward again to
"Try it." That backward kink is the collision. It "looks OK enough" on this specific small
example, which is why it shipped — but it is not a correct layered layout, and it is the
thing `AGENTS.md` mistook for an overlay problem.

**Fix:** namespace the ELK port id with the node id (`${nodeId}##${handleId}`) and build
edge endpoints from the same key. The handle ids the render layer uses are unchanged; only
what ELK sees becomes unambiguous. Every clean render below uses this one-line fix
(`uniquePorts:true`). It should be applied **even if overlay is never shipped** — it fixes
single-route layout.

Same graph, ambiguous (shipped) vs unique ids:

| G0 single route — shipped ids (`sharedIds`) | G0 single route — unique ids (`default`) |
|---|---|
| ![](renders/g0_single__sharedIds.png) | (clean straight line A→B→C→D→E, `backEdges=0`) |

---

## Finding 2 — the compatible-vs-conflicting boundary (precise)

> **Definition.** Let the *combined route order* be the directed graph `G` with an edge
> `u → v` for every pair of consecutive steps `(u, v)` in **any** route.
> **Overlay is cleanly renderable iff `G` is acyclic.**
> Each independent cycle in `G` forces ≥1 back-edge (a rail drawn against the layout
> direction) that no ELK option can remove.

This held with **zero exceptions** across all six graphs — `backEdges > 0` exactly when `G`
has a cycle:

| Graph | Routes | Combined order | Acyclic? | crossings→best | backEdges | Verdict |
|---|---|---|---|---|---|---|
| **G1** compatible DAG | 3, share A & E | A→{B,C,D}→E→{F,G} | ✅ | 5 → 0 | **0** | clean |
| **G2** shared spine | 4, share A-B-C-D | spine + fan | ✅ | 18 → **0** (FIXED_SIDE) | **0** | clean |
| **G6** hub | 6, share H | fan-in/fan-out | ✅ | 0 | **0** | clean |
| **G3** order conflict | 2 | X→Y **and** Y→X | ❌ cycle | 5 → 0 | **1** | degrades |
| **G5** revisit | 2, r1 loops B | B→C **and** C→B | ❌ cycle | 3 → 0 | **1** | degrades |
| **G4** against-grain | 2, r2 = r1 reversed | 2-cycle on every pair | ❌ 4 cycles | 9 → 1 | **4** | unrenderable |

### Compatible cases render cleanly

**G1 — 3 routes sharing A and E** (the context's hand-test, reproduced): every route enters
and leaves the shared node E on its own coloured port, so colour stays continuous through
the shared node. Zero back-edges.

![g1](renders/g1_compatible__default.png)

**G2 — 4 routes sharing spine A-B-C-D.** Default `FIXED_ORDER` **braids** the four rails
between shared nodes (18 crossings — the ports are pinned in route order but the two sides
disagree, so rails cross). `FIXED_SIDE` (let ELK order ports) makes them four clean parallel
lines: **0 crossings.** This is purely cosmetic and fully config-fixable.

| G2 default (braided, 18 crossings) | G2 FIXED_SIDE (clean, 0 crossings) |
|---|---|
| ![](renders/g2_spine__default.png) | ![](renders/g2_spine__fixedSide.png) |

**G6 — 6 routes through one hub.** Legible: six colours fan into the hub's west ports and out
the east ports. This is the scaling ceiling (see UX below) but topologically fine.

![g6](renders/g6_hub__default.png)

### Conflicting cases keep a residual back-edge no matter the config

**G3 — r1 wants X-before-Y, r2 wants Y-before-X.** ELK must pick one spatial order (it put
Y left of X); the other route then traverses that pair backwards. `FIXED_SIDE`/orthogonal/
splines all drop crossings to ~0 but the **back-edge survives** — one route still reads
A → (skip forward) → back-left → forward.

| G3 default (tangled) | G3 FIXED_SIDE (crossings gone, back-edge remains) |
|---|---|
| ![](renders/g3_orderconflict__default.png) | ![](renders/g3_orderconflict__fixedSide.png) |

**G4 — reverse route (maximal conflict).** r2 is r1 backwards, so *every* shared pair is a
2-cycle. Even with orthogonal routing the reverse route is just a bundle of 4 backward
arrows — not a readable "flow." Fundamentally unrenderable as a single left-right overlay.

![g4](renders/g4_reverse__orthogonal.png)

**G5 — a route revisits a node** (B→C→B). The self-cycle forces one back-edge. `cycleModelOrder`
draws it about as cleanly as possible, but "you are here twice" is inherently hard to read
as linear narrative.

![g5](renders/g5_revisit__cycleModelOrder.png)

---

## Finding 3 — which ELK knobs move the needle

| Knob | Effect | Fixes crossings? | Fixes back-edges? |
|---|---|---|---|
| `portConstraints: FIXED_SIDE` (vs shipped `FIXED_ORDER`) | Lets ELK order ports per side to align rails | **Yes, big** (g2 18→0, g6 20→9) | No |
| `edgeRouting: ORTHOGONAL` / `SPLINES` | Cleaner-looking curves, fewer visual chord-crossings | Somewhat | No |
| `considerModelOrder` / `crossingMinimization.forceNodeModelOrder` | Bias ordering toward route order | Marginal / sometimes worse | No |
| `cycleBreaking.strategy: MODEL_ORDER` | Chooses *which* edge becomes the back-edge on a cycle | No | No (only relocates it) |
| **unique port ids** (the bug fix) | Removes phantom back-edges & layer collapse | **Yes** | **Yes, for the phantom ones** |

**Conclusion on config:** crossings are entirely a configuration problem — adopt `FIXED_SIDE`
(consider it for single-route too; no downside observed). Back-edges caused by genuine order
cycles are **not** a configuration problem; config only decides how the unavoidable backward
rail is drawn. `FIXED_ORDER` is only worth keeping if the vertical *order* of ports on a node
is meant to carry meaning — it currently doesn't.

---

## Finding 4 — the built-in renderer differs from ELK in exactly one layer: edge routing

All of the above was validated in the **real React-Flow renderer** (not just the SVG harness)
by a throwaway overlay page that reused the shipped `GraphView` / `projectCardNodes` /
`projectPathEdges` / `CardNode` and only supplied an ELK layout with unique port ids. The
harness and the real renderer agree (compare `renders/builtin_compatible.png` to the G1 SVG).
The exact G7 talk graph was also rendered in the real renderer
(`renders/builtin_g7_talk_overlay.png`) — same 4-route overlay, same legibility as the SVG
`renders/ux_g7_talk__overlay.png`, only cosmetic differences (full 260×300 cards, so more
spread). Confirms the compatible full-overlay view is buildable today with just the port-id
fix + dropping the single-route filter + `FIXED_SIDE`.

The pipeline splits cleanly, and only one part of ELK's output actually reaches the screen:

| Layer | Computed by | Used by the built-in renderer? |
|---|---|---|
| Node positions (x, y) | ELK | ✅ verbatim |
| Port / handle offsets | ELK | ✅ verbatim |
| **Edge routing** (the path each edge takes) | ELK | ❌ **discarded** |

`getElkLayout` reads back only node geometry + ports; it never touches `layouted.edges`. So
React-Flow receives ELK's boxes and dots and then draws its **own default bezier** between
each pair of handles — knowing nothing about the other nodes or ELK's routed path. **Positions
are pure ELK; edges are not ELK at all.**

That gap is the entire cause of the ugly conflict renders. Because ports are pinned to sides
(source = EAST, target = WEST), a *forward* edge is a short L→R curve, but a *back-edge*
(target physically left of source) forces the bezier out rightward then hooks it all the way
back to a left-side handle — so it curls into itself and reads as a stub. ELK already routed
that edge sanely; the app throws the routing away. Same ELK layout, opposite legibility:

| React-Flow bezier (what ships) | ELK's own orthogonal routing (`edge.sections`) |
|---|---|
| ![](renders/builtin_reverse.png) | ![](renders/elkroute_g4_reverse.png) |

Left: the reverse-route rails collapse to broken stubs and curls. Right: the *identical* node
layout, but drawing ELK's routed polylines — the back-edges become clean channels that loop
over the top and along the bottom, *around* the nodes. Every rail is connected and legible.
ELK orthogonal routing also sharpens the compatible cases (`renders/elkroute_g1_compatible.png`).

**Implication:** the "spaghetti" of the conflict cases is partly a *rendering* artifact, not
only a *layout* fact. The layout carries a back-edge (unavoidable, per Finding 2), but whether
that back-edge reads as a broken stub or as a deliberate "loops around the outside" rail is a
renderer choice the app currently forfeits.

---

## Finding 5 — dealing with cycles: three levers (with trades)

A cycle in the combined order (Finding 2) means no single left-right ordering keeps every route
forward. You cannot keep all three of { one node instance per card, a left-right reading axis,
legibility } — a cycle forces you to spend one. Three concrete techniques, each spending a
different one:

**Lever A — node duplication (unroll).** When a route revisits a node, later visits become
fresh node instances that share the same `cardId`. This linearises the cycle: every rail stays
forward on the normal layered axis. Proven in both the SVG harness (`renders/cyc_g5_revisit__explode.png`)
and the **real renderer** (`renders/builtin_revisitUnrolled.png` — card B renders twice, route
reads straight L→R). Cost: the revisited card appears at more than one position — arguably
honest for a presentation, since the route genuinely returns there. **The model already supports
this**: `cardId` lives on the node, and nothing stops two nodes sharing one card, so an unrolled
revisit is just two nodes → one card, which `getCardForNode` already renders. Best for
**revisit** cycles. For cross-route *order disagreement* it also works but un-shares the
conflicting nodes (each route gets private copies), erasing the "these routes converge here"
value overlay exists to show.

**Lever B — axis-free layout (force / stress).** Drop the left-right axis entirely; with no
forward direction, no edge is "backward" and cycles are native. `renders/cyc_g3_orderconflict__force.png`
(a web — consistent but not a sequence) and `renders/cyc_g4_reverse__stress.png` (forward and
reverse collapse onto one clean spine, direction carried only by arrowheads). Cost: you lose
the narrative reading axis — good for "explore the space," bad for "read this in order."

**Lever C — render ELK's edge routing (Finding 4).** Keep the layered layout and one instance
per card; just draw edges from ELK's `sections` via a custom React-Flow edge instead of the
default bezier. Back-edge routes then read as rails that loop cleanly around the outside
(`renders/elkroute_g4_reverse.png`). Cost: extend `getElkLayout` to return edge sections + add
a custom edge type (moderate); the route still reads as "backward," just legibly so.

| Lever | Spends | Best for |
|---|---|---|
| A duplication | one-instance-per-card | revisit cycles |
| B force/stress | the reading axis | "explore" maps, not narratives |
| C ELK routing | (nothing structural — just renderer work) | any back-edge, made legible-not-linear |

Levers A and C are complementary and both preserve full overlay + forward reading; only the
cross-route *order-disagreement* cycle has no rendering that keeps the nodes shared **and**
reads forward — that one is a genuine modelling fork, not a rendering gap.

---

## Finding 6 — product / UX

- **Per-route ports are the real asset.** Because every route gets its own inbound+outbound
  port on each shared node, a route's colour is *continuous through* a shared node — you can
  follow one rail across a hub without losing it (visible in G1/G2/G6). This is exactly what
  makes overlay readable when it's readable, and it's already in the model.
- **Colour scales to ~3–4 routes as the primary encoding.** 3 (G1) is comfortable; 6 (G6) is
  the ceiling — blue/purple and pink/red begin to blur and the hub's port stack gets dense.
  Past ~4 routes, colour alone stops separating them.
- **Full overlay is the wrong default past a few routes.** The legible artifact is an
  **overview map with one route highlighted** and the rest dimmed — which is essentially what
  the shipped presentation dimming (`activePathId` → others at 0.12 opacity) already does.
  Full-strength simultaneous overlay is a *special case* that only works on compatible,
  small graphs.
- **This maps straight onto the emerging View concept.** A **View** = { which routes are
  shown, which one (if any) is emphasized, layout scope }. "Present one route" is a View
  (1 shown, emphasized). "Overview" is a View (all shown, none emphasized). "Compare route A
  vs B" is a View (2 shown). A View **may** bind to a single Route or **may** show several —
  no change to Route semantics needed. Overlay is a property of a View, not of the Route
  model.

---

## Recommendation

**Pursue multi-route — as overview-with-highlight, gated to compatible route sets. Not
unconstrained full overlay.**

1. **Fix the port-id collision first** (namespace ELK port ids per node). Do this regardless
   of the overlay decision — it corrects single-route layout too. Cheap, isolated to
   `react-flow-adapter`.
2. **Switch ELK to `FIXED_SIDE`** to remove rail braiding (unless port *order* is meant to
   mean something).
3. **Add a compatibility check**: compute the combined route-order graph; if acyclic, overlay
   / compare views are safe. If it has a cycle, don't full-overlay the conflicting routes —
   fall back to highlight-one-dim-rest, because the back-edge is unavoidable.
4. **Default the multi-route view to overview-with-highlight**, not full overlay, once more
   than ~4 routes (or any conflict) are present.
5. **Render ELK's edge routing** (return `edge.sections` from `getElkLayout`; draw them with a
   custom React-Flow edge instead of the default bezier). This improves every case and is what
   makes back-edges legible instead of broken stubs (Finding 4) — a prerequisite if you want
   full overlay to survive conflicts at all.
6. **For revisit cycles, unroll to duplicate nodes** sharing a `cardId` (Finding 5, Lever A).
   The model already allows it, and it keeps full overlay + forward reading while honouring
   CONTEXT.md's promise that a route may revisit a node.

The data model needs **no change** to support this — the single-route filter in `App.tsx`
is a *view choice*, not a model limit. `buildPathEdges`/`buildNodeHandles` already emit all
routes, and two nodes may already share one `cardId`. The one genuine modelling fork is
whether routes may disagree on the order of shared nodes (Finding 5); everything else is
rendering/view work.

## Verdict on the `AGENTS.md` "no overlay" rule

**Narrow it, don't keep it as-is.** Its premise ("overlay → ELK reconciles conflicting
orderings → spaghetti") is factually wrong for compatible routes and misattributes the
current build's real spaghetti (the port-id bug). Replace with, roughly:

> The graph view renders routes through per-route ports. Multiple **compatible** routes
> (their combined step-order is acyclic) may be overlaid and lay out cleanly. Routes whose
> combined order has a cycle (two routes disagreeing on node order, a reverse route, or a
> route that revisits a node) will produce an unavoidable backward rail — do not full-overlay
> those; show one at a time with the rest dimmed. Past ~4 routes, prefer
> overview-with-highlight over full-strength overlay. (And note: ELK port ids must be unique
> per node, or even single-route layout breaks.)

---

## Reproduce

All headless renderers below serve `.scratch/multiple-routes/` over http and screenshot with
Playwright (chromium). `renders/` and `metrics.json` are already committed.

```
# Boundary + knob matrix (headless ELK + SVG) -> renders/ + metrics.json
node .scratch/multiple-routes/driver.mjs

# UX modes (overlay / highlight / isolate) on compatible + conflict graphs
node .scratch/multiple-routes/ux.mjs

# Cycle-handling levers A/B (duplication, force, stress)
node .scratch/multiple-routes/cycles.mjs

# Lever C: ELK's own edge routing (edge.sections) vs the bezier the app draws
node .scratch/multiple-routes/elkroute.mjs

# Ground-truth against the REAL shipped @project code (layout geometry)
pnpm exec vitest run --config .scratch/multiple-routes/verify.config.ts

# Real-app single-route screenshot (needs `pnpm dev` running)
node .scratch/multiple-routes/realshot.mjs
```

**Note — built-in-renderer screenshots (`renders/builtin_*.png`).** These were produced by a
throwaway page (`packages/app/overlay.html` + `packages/app/src/overlay.tsx`) that reused the
real `GraphView`/adapter with an all-routes ELK layout. **Those two files have been deleted**
(they would otherwise trip `pnpm verify`); the screenshots they produced remain in `renders/`.
To regenerate, recreate that page — it did: `buildNodeHandles`/`buildPathEdges` → ELK layout
with node-unique port ids → `projectCardNodes`/`projectPathEdges` → real `GraphView`.

Files: `harness.js` (derivation + ELK + SVG, supports view modes + cycle levers + ELK routing),
`graphs.js` (G0–G7 graphs + ELK/cycle configs), `driver.mjs` / `ux.mjs` / `cycles.mjs` /
`elkroute.mjs` (render matrices), `verify.test.ts` + `verify.config.ts` (real-code check),
`metrics.json` (all numbers), `renders/*.png` (all screenshots).
