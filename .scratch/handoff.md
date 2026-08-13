# Handoff — 2026-07-20

> **Historical. Do not read this as current state.** Verified stale on
> 2026-08-13, roughly 30 PRs later. Presenting is no longer a reveal.js deck
> (ADR 0024/0027 removed the dependency); `manifest` is retired (ADR 0010);
> Route is renamed to Graph (ADR 0041); a Layout owns its Graphs (ADR 0040);
> persistence is PostgreSQL over a Fetch-native HTTP application (ADR 0030,
> 0034), not a file write-back. The "Open work" and "Stalled" sections below
> are all resolved or superseded. For current state read `AGENTS.md`, then
> `CONTEXT.md`; for the work queue read
> `.scratch/card-route-editing/implementation-handoff.md`.

State: everything on `main`, working tree clean, 33 commits since the initial one.
`pnpm verify` 57 tests green. `pnpm e2e` 13 green. One pre-existing eslint warning
in `router.tsx` (react-refresh), not introduced by this work.

Read `AGENTS.md` first, then `CONTEXT.md`, then `docs/agents/workflow.md`. This file
is orientation, not a substitute for those.

## What changed today

**The domain model got smaller.** Authored edges are gone (ADR 0007) — routes are a
space's only structure. `Port` left the glossary; it was ELK's word for a drawing
concern. `Edge` stayed but is now React Flow's term, in a render-layer section, and
`CONTEXT.md` has one.

**`path` → `Route` everywhere.** Remaining `path` identifiers are filesystem paths,
TanStack Router URL paths, and React Flow's `edge-path` class. Don't "fix" those.

**Multi-route rendering ships.** The app draws every route at once; selecting one
emphasises it rather than hiding the others. This was never a design choice — the
dimming machinery had existed since the initial commit and had never run.

**Cards show titles; opening shows content** (ADR 0006). Content is no longer
embedded in every graph node.

**Presenting is a reveal.js deck** (ADR 0008), and is *not* the same surface as
opening. This reversed an earlier decision in the same session — see the ADR for why.

**A Layout is a strategy** (ADR 0005) with the contract in `@project/graph`.
`gridLayout` exists partly to keep the ELK seam honest.

## Traps, all found the hard way

**Tests pass on changes that are wrong.** Deleting an ELK option was
behaviour-preserving for the shipped single-route view and would have silently
changed multi-route layout. `verify` and `e2e` both stayed green. What caught it was
an explicit "stop if the geometry changes" precondition. See
`layout-seam/issues/05`.

**A ticket recorded a false measurement** for hours, and it was believed. `05` now
carries the correction with the original struck through rather than rewritten.

**A test passed vacuously.** An e2e assertion read edge opacities without waiting
for the edges; the empty array made `.every()` true. Pin counts before asserting
over a collection.

**ELK orders `FIXED_ORDER` ports clockwise** — EAST top-to-bottom, WEST
*bottom-to-top*. Handing both sides the same list order crossed every route at every
shared card. Now `FIXED_SIDE`. Don't switch back without reading
`layout-seam/issues/04`.

**Two markdown renderers now exist** — `react-markdown` for reading, `marked` for
the deck. They agree on ordinary GFM but are different parsers.
`reveal-presentation/issues/01`.

**Backticks in a double-quoted shell string get executed.** A commit message lost a
word this way. Use a heredoc to a file for messages containing backticks.

## Open work

Nothing is blocked on anything unbuilt. Recommended order:

1. `reveal-presentation/01` — two markdown renderers is a real correctness risk and
   the cheapest of the three reveal follow-ups.
2. `layout-seam/07` then `03` — a demo route that revisits a card is the only shape
   that produces a back-edge in the current view, and `03` needs one to be visible.
3. `space-intake/01` — nothing makes a caller validate references before using a
   manifest; lookups are `Array.find` with no index.
4. `alias-cards/01` — pure conversation, runs alongside anything.

Also open: `card-display/03` (description field), `card-display/05` (fixed logical
canvas — now applies only to the reading surface, since reveal solves it for the
deck), `layout-seam/06` (whether `Layout`'s sync/async union earns its place),
`reveal-presentation/02` and `/03` (speaker view, PDF export — the two features that
justified the dependency).

## Stalled

**`alias-cards/01`** stopped mid-grilling. Question 1 was settled: `Card` becomes a
discriminated union with an explicit `kind`, defaulted to `markdown`, admitting
`markdown | alias` and deferring `space`. Question 2 — whether alias resolution is
lazy and non-destructive or flattens at intake — was asked and never answered.
Restart the grilling fresh rather than resuming; the context is long gone.

## How this repo works

Issues are markdown under `.scratch/<feature>/`, with a `Status:` line. Resolved ones
get an `## Answer` recording what was actually done, including where the ticket was
wrong. ADRs are append-only — never merge or rewrite them; supersede and amend the
old status line. `CONTEXT.md` is the consolidated current state; the ADR log is how
it got there.

The `_Avoid_` lists in `CONTEXT.md` carry as much weight as the definitions. They are
what stops a term being reintroduced after being deliberately rejected.
