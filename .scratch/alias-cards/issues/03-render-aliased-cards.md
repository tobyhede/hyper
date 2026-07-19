# Render aliased cards

Status: open
Blocked by: 02

## Context

An alias shows another card's content at a second position. The renderer needs to resolve through to the target's markdown, and the viewer needs some signal that they are seeing the same content again rather than new material — otherwise a route that redraws content reads as repetition rather than deliberate return.

## Task

Resolve alias content in the projection and decide the visual treatment with the user.

## Acceptance

- An alias card renders its target's content.
- Editing the target changes every place it appears (single source of truth, per `CONTEXT.md`).
- A route stepping through an alias reads forward, with no back-edge.
