# 06 — A Title that does not fit its Edge

Status: resolved

**Decided:** At rest a Title is fitted to its Edge. Below a threshold — a fitted box that cannot hold about three characters and the ellipsis — nothing draws at rest. While the Edge is revealed (hovered, selected, or its Title being edited) the box grows to the whole Title up to the 224px ceiling, centred on the midpoint and raised over the Resources. The threshold is measured in canvas units: there is no zoom rule, and Titles scale with the Map as Resource Titles do.

**Why:** Fitting the Title to the Edge held it to a 40px floor on a 72px gap, which drew "If th…" — unreadable in every prototype variant. Any readable Title on a gap that short covers something; revealing is already how an Edge asks for attention, so that is when it may.

## Answer

Built with `05`. `edgeTitleRoom(span)` in `packages/ui/src/edge-title-room.ts` works from the Edge's drawn span, which the adapter now exposes as `span`:

- The Title's box at rest is `min(224, span − 28)`, where 28 is the arrowhead plus a margin.
- If that box cannot hold 34px of text after its 26px of padding and border, nothing draws at rest. 34px is about three characters and the ellipsis at 12px. So an Edge shorter than 88 canvas units draws no Title at rest, and the prototype's 72-unit gap is one of those.
- While the Edge is revealed, `EdgeTitle` drops the fitted width and draws the whole Title up to the stylesheet's `--edge-title-ceiling` (224px). A test holds that equal to `EDGE_TITLE_CEILING`. The layer is raised over the Resources.
- Everything is in canvas units, with no zoom rule.

Tests:
- Property tests in `edge-title-room.test.ts` cover: never past the span less the clearance, never past the ceiling; nothing drawn exactly below the threshold; monotone in span.
- `EdgeTitle.test.tsx` covers the states.
- The Ladle and application proofs of `edge-title-fits-its-edge` cover the real geometry. The long Title is ellipsed inside its Edge, the short-gap Title draws nothing at rest and is whole and raised when revealed, and in the application a Resource is dragged against its neighbour to shrink the Edge below the threshold.
