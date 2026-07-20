# Render ELK's edge routing instead of default beziers

Status: open
Blocked by: 02 (resolved), 07 (to see it in the app)

## Context

ELK computes routed edge geometry, and the app throws it away. `getElkLayout` reads only `layouted.children` (node boxes and port offsets) and never touches `layouted.edges`. React Flow then draws its own default bezier between the ELK-placed handles, knowing nothing about the other cards or ELK's routed path.

Consequence: a back-edge (target physically left of source) forces the bezier out rightward and hooks it back to a left-side handle, so it curls into itself and reads as a broken stub. ELK had already routed that edge sanely. See `.scratch/multiple-routes/findings.md` Finding 4 — same layout, opposite legibility.

## Task

Return `edge.sections` from the layout and draw them with a custom React Flow edge type.

## Acceptance

- Back-edges read as channels routing around the cards rather than stubs.
- Compatible (acyclic) route sets look no worse.
- Prerequisite for any view that shows conflicting routes together (ADR 0003).
