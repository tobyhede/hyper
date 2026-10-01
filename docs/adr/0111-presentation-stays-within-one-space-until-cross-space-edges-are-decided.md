# Presentation stays within one Space until cross-Space Edges are decided

Status: accepted
Refines: 0069
Related: 0024, 0068, 0079, 0081

A presentation URL names a Space, a Map, a Graph and the current Resource, and nothing else: `/spaces/:spaceId/maps/:mapId/graphs/:graphId/present/:resourceId`. It carries no query value. The canonical query value ADR 0069 promised for a cross-Space presentation point, carrying the ordered Space Resource crossings and each target Map and Graph, is deferred until cross-Space Edges themselves are decided.

## Why it is deferred rather than built

The query value encodes the context that decides which exit Edges are available after crossing into another Space. That context exists only if cross-Space Edges do, and they do not. ADR 0068 names how a cross-Space Edge is drawn, and how several are offered as a fork, as a working hypothesis rather than a decision. The code refuses them: an Edge endpoint is a Resource id in its own Space (`graphEdgeSchema`), and a connection drawn between two Resources inside an Open Space Resource authors the Graph that embedding shows rather than an Edge leaving it. Presentation therefore never crosses a Space boundary, so there is no crossing stack for a URL to carry.

Specifying the encoding now would fix the shape of a destination before the Edges that produce it have a settled model. If ADR 0068's hypothesis changes, so does what the stack must carry, and a URL shape already in use would have to be rolled forward with it.

This matches what is built. `packages/http/src/product-destination.ts` parses the pathname only, and V1's definition of done (`.scratch/v1-release/definition-of-done.md`) lists presentation traversal across Space boundaries and cross-Space presentation-point URLs as out of scope. The ticket for the query value, `.scratch/entity-url-addressability/issues/10`, is blocked on the decision this defers to.

## What stands

Everything else ADR 0069 says about a presentation URL holds. It names the current Resource and never the Traversal history used to reach it. Browser history stays linear local navigation, and what a move writes to it is decided in `app`, never by Navigation (ADR 0081). Resolving it is navigation and never authoring.

## Rejected

**Building the query value ahead of cross-Space Edges.** It would be a parser, a resolver and a 404 policy for destinations no Space can contain, and its encoding would be chosen against a hypothesis.
