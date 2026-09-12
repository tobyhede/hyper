# 16 — Create Thing is three peers, and the vertical dock packs them

Status: ready-for-human
Tags: release/v1
Blocked by: nothing. Built on `feat/create-thing-peers` (PR #195).

**Amended by ticket `13` and ADR 0088: the peers are now two, not three.** Create
Alias left the Dock — an Alias is always created from an existing Thing, which
supplies the Target — so the Things cluster draws `markdown` and `space` only.
Nothing in the reasoning below is withdrawn: the kind is still chosen at
creation, so none of the peers is a default, and the packing measurements and
their costs stand as taken. Two things below are now false and are kept as the
record of what was true:

- **The asymmetry table is gone.** All three kinds complete their Edit on
  activation (ADR 0088), so the completes-versus-opens-a-pane split that this
  ticket's whole argument turns on no longer exists. Option E, rejected here as
  "the close second" for mapping onto that asymmetry, has nothing left to map
  onto.
- **"One continuation address per creating kind" is reversed.** There are no
  panes to return from, so `ContinuationTarget`'s `control` arm keeps no
  creating-kind names at all — it carries the New Diagram rename address
  instead.

The parity claims keep their names. `command-dock-creates-each-kind-in-one-press`
is now true of every kind in the product rather than of one, which is the
stronger claim, and it is checked over two controls.

**What was decided:** the three Thing kinds are peer controls on the Dock
surface rather than three rows behind a `+`, and on a side edge the Things
cluster packs onto one row instead of taking a verb track per command.

## The complaint

Adding a Thing — the most frequent authoring act in the product — cost two
presses. `CreateMenu` drew one `+` that disclosed the three kinds, so every
creation paid for a choice, including the one that never makes it.

The asymmetry is in `App.tsx`'s own `onCreate` and it is what the decision turns
on:

| kind | one activation does |
| --- | --- |
| `markdown` | `addThing()` — the Edit completes |
| `alias` | opens a pane; a Target is still owed |
| `space` | opens a pane; a target Space is still owed |

So the menu put one command that *completes* behind the same trigger as two that
were always going to open something. It charged the cheapest command two
presses and made the other two cost three.

## What was tried

`stories/review/create-thing-permutations.stories.tsx` draws five options in the
real chrome, counting every press including disclosures. Summarised:

| | markdown | alias | vertical dock |
| --- | --- | --- | --- |
| A — menu (shipped) | 2 | 2 | 44px, fits |
| B — three bare peers | 1 | 1 | **chosen** |
| C — peers grouped behind a label `+` | 1 | 1 | clipped: 3 of 4 commands leave the column |
| D — peers with a `+` badged on each glyph | 1 | 1 | badge collides with the Alias's own |
| E — split: `+` completes, chevron discloses | 1 | 2 | 44px, fits |

**D died on measurement.** At bottom-right the `+` does not crowd the Alias
badge, it *replaces* it — Create Markdown Thing and Create Alias draw the same
mark. Top-right survives but gives the Alias two badges on one 14px glyph.

**E was the close second** and was rejected by the author rather than by a
measurement: it maps exactly onto the completes-vs-opens-a-pane asymmetry, at
the cost of a second chevron beside the Things trigger's own.

## The vertical dock decided the arrangement, not the row

Three siblings auto-place onto three rows: the Things cluster stands at 102px
beside a 44px Diagram and a 44px Graph, which is the Dock losing the alignment
`command-dock.css` spends its grid on. Wrapping them in a nested `ToolbarGroup`
gets 73px. **Packing the cluster gets 44px** — its neighbours' height.

The packing rests on one observation, which is the author's: **Things is the
only cluster whose name is not a title.** Space, Diagram and Graph name entities
that have been renamed, so the `1fr` track is what lets a name take the slack and
truncate instead of resizing the column. "Things" is a fixed word. Measured, the
glyph-to-chevron run is 122px under the grid against 53px packed — roughly 69px
of held-open nothing, which is what the three Create commands are paid out of.

Packing also pins the trigger's chevron onto the three Creates' 29px pitch
(29/29/29 measured). No padding change was owed: sweeping `padding-inline-end`
across 5–8px gives 28/29/30/31, and 6px is what the sheet already set.

## What it costs, recorded rather than resolved

- **The chevron column.** Packed Things puts its chevron at x=101 against the
  identities' x=146. That column was already not exact here — under the grid
  this trigger spans tracks 1–2 and lands at x=153 — and this chevron is the odd
  one anyway, being inside its trigger rather than a button beside it.
- **A kind glyph means a verb**, for the first time in the product. The same
  silhouettes mark rows in the Things list and Things on the canvas. Each control
  carries `Create <kind>` as name and tooltip, so pointer and keyboard are
  unambiguous; a silent visual reading could take three kind glyphs in a command
  slot for filters over the list beside them.
- **ArrowDown walks a horizontal row.** The vertical dock is
  `orientation="vertical"` and Base UI's composite reads only Up/Down there;
  `Toolbar.Root` takes `'horizontal' | 'vertical'` and does not expose the
  composite's own `'both'`. Traversal order matches reading order, only the key
  disagrees with that segment's axis. Adding Left/Right by hand would be a
  hand-rolled deviation over a composite that owns key handling — **not taken**,
  and the thing to revisit if the vertical dock is used in anger.

## Consequences taken along the way

- **One continuation address per creating kind.** `ContinuationControl` was a
  single `add-thing`, right while one trigger was the only place to come back to.
  With peers, a cancelled Alias returns to Create Alias rather than to whichever
  peer carried the shared address.
- **`ThingKindIcon` gained `decorative`**, used only by these three controls:
  each is labelled `Create <kind>`, so an `img` announcing `<kind>` beside it
  repeats half of what the button said — and three are mounted at rest rather
  than disclosed.
- **`.command-dock__set-verb` deleted** with the menu that was its only caller.
  The catalogue's dead-rule check found it.

## No ADR

ADR 0082 states that how the Dock's commands "are grouped and which glyph stands
for each is treatment, settled by the stories and behaviour tests beside it
rather than by a document (ADR 0052)." The evidence is therefore
`command-dock-creates-each-kind-in-one-press` and
`command-dock-packs-things-onto-one-row` in `stories/parity-claims.ts`, each with
its Ladle and application halves.

## Verified

All three commands the change can be observed by, on the finished branch:

| command | result |
| --- | --- |
| `pnpm verify` | green — 200 files, 2476 passed, 2 skipped |
| `pnpm e2e` | green — 192 passed, database-free over HTTP |
| `pnpm e2e:ladle` | green — 89 passed |

`pnpm e2e` stays database-free: it drives `E2eMemorySpaceRepository` over a
per-test Vite host, and PostgreSQL is `pnpm e2e:postgres`'s alone. That project
is not run here — this change reaches no repository, migration or Space chrome
that the one PostgreSQL test addresses.

## What is left

Nothing blocking. The prototype sheet stays under `stories/review` as the record
of why — a later reader asking "why not a menu, a split, or a badge" is asking a
question the production code does not answer.
