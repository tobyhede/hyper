# 02 — The Graph HUD story draws a key the application can produce

Status: resolved
Blocked by: nothing — can start immediately. It blocks 03, which cannot draw an
honest Diagram line over a key that flattens every Diagram's Graphs together.

**What to build:** The stable `Surfaces/Graph HUD` story keys the Graphs the
open Diagram owns, which is what the application's HUD has always been given.
Today it keys every Graph in the Space.

## What is wrong, and where

The HUD is right and the fixture is not. `canvasProjection` answers
`visibleGraphs` as the resolved Diagram's own `graphs`, and `App` hands exactly
that to `GraphHud` — so the application has never drawn a flattened key.
`GraphHudFixture` passes the Space's `graphs` instead, which is every Graph
across every Diagram in declared order (ADR 0045). On the story Space that is
Long, Mid and Short — which Collection 1 owns — **and Echo, which Collection 2
owns**. The fixture's own doc comment states the flattening as deliberate, so
the comment has to move with the code.

ADR 0052 makes a stable story production-parity evidence. This one is currently
evidence of nothing: it draws a key no Diagram can produce, and it is the story
that would otherwise catch a regression in `visibleGraphs`.

## What moves with it

The Ladle spec asserts the four titles in order and a count of four. Both are
assertions that the defect is present. The replacement should say what the
surface owes — the Graphs of the Diagram the story opens on, each with its
resolved colour, exactly one emphasised — rather than a literal list that
happens to match today's fixture.

A second story over the Space's other Diagram is worth adding while here: one
Diagram owning three Graphs and another owning one is what makes "the key is
the Diagram's" visible rather than merely asserted.

## Acceptance

- [x] The story's key holds the open Diagram's Graphs and no others
- [x] The fixture's doc comment describes what it now does, with no claim left behind about flattening across Diagrams
- [x] The spec's claim is the rule, not a transcription of the current fixture's titles
- [x] A second Diagram is on show, so a key that changes with the Diagram is visible
- [x] `pnpm e2e:ladle` green; `pnpm verify` green

## Answer

`GraphHudFixture` now resolves the selected Diagram before it builds the HUD and
passes only that Diagram's Graphs, with colours resolved through the same
`graphColorMap` seam as the application. The retained story opens Collection 1;
the added sparse story opens Collection 2, so the catalogue demonstrates that
the key follows the Diagram rather than flattening the Space.

The Ladle parity claim derives the expected titles and Active Graph from the
story's authored snapshot instead of transcribing fixture labels. It proves the
key contains exactly those Graphs, in Diagram order, with exactly one Active
Graph. The finished tree passed `pnpm verify`, `pnpm e2e:ladle` and `pnpm e2e`.
