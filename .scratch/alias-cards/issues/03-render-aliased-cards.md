# Render aliased cards

Status: open
Blocked by: 02

## Context

An alias shows another card's content at a second position. The renderer needs to resolve through to the target's markdown, and the viewer needs some signal that they are seeing the same content again rather than new material — otherwise a route that redraws content reads as repetition rather than deliberate return.

## Task

Call the `graph` alias resolver (ADR 0009 — resolution lives in `graph`, not the adapter) from the projection to draw the target's content, and decide the visual treatment with the user. The "same content again" signal is the on-screen decision issue 01 deferred to here; a differently-titled alias is already one such signal, so weigh whether more is needed once it's rendered.

**Add an alias to the bundled demo here** (issue 02 leaves it untouched). This is the issue that renders one, so it is where an alias earns its place in the example — an author-requested redraw, `C…C'`, that reads forward. Keep the demo's routes compatible (their unioned step-order acyclic), the property multi-route rendering relies on.

## Acceptance

- An alias card renders its target's content.
- Editing the target changes every place it appears (single source of truth, per `CONTEXT.md`).
- A route stepping through an alias reads forward, with no back-edge.
