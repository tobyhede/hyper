# 12 — Align Card hover toolbars with the Command Dock through shared components

Status: resolved
Tags: release/v1
Blocked by: nothing — shared component work can start immediately. Coordinate
with 11 on Card geometry and hover evidence; this ticket must not depend on the
unrelated promotion decisions also captured there.

**What to build:** Hovering a Card reveals a toolbar visually consistent with
the Command Dock. The rail is neutral rather than coloured by the Active Graph.
Graph colour remains visible in the handles and Graph connections. Space Cards
use the same toolbar language and reusable Layout/Graph controls as the Dock.

This is an explicit treatment change requested after the Dock promotion review.
It replaces the coloured Card rail intentionally. It is not permission to change
Card authoring behavior or weaken the geometry evidence recorded in ticket 11.

## Required component boundaries

Reuse is required, not optional. Start with the existing shared Toolbar,
ToolbarButton, Card rail and Dock compositions. Extract reusable presentation
and control compositions into the shared UI package where necessary, and make
both the Dock and Card toolbar consume them. Copying the Dock stylesheet into
the Card stylesheet does not meet this requirement.

Share the surface treatment, control treatment and applicable Layout/Graph
selection compositions. The application continues to own commands and domain
state; React Flow integration continues to own geometry and canvas interaction
isolation. A shared selector accepts its options, selection and operations from
its caller: choosing a Space Card's stored target context is not the same
operation as navigating the containing Space through the Dock.

Refactoring to establish clean boundaries is explicitly authorized. Preserve the
primitive's keyboard and dismissal behavior rather than building another
interactive implementation for the Card. There must be one toolbar focus scope
per Card, not nested toolbar roots around each cluster.

## Acceptance

- [x] Hovering the Card reveals its toolbar with the Dock's shared neutral
      surface, borders, corners, spacing, typography and control treatment.
      The toolbar remains reachable when moving the pointer onto its controls.
- [x] Graph colour does not return as a rail band on hover, selection or content
      editing. Handles and Graph connections retain their existing Graph colours
      and Active Graph emphasis.
- [x] Keyboard focus reveals and retains the toolbar. Preserve the existing
      selected-Card and live-edit access to commands, so authoring controls do
      not disappear while an author is using them.
- [x] Markdown, Alias and Space Cards share the toolbar composition. Kind-specific
      commands and shared Card commands retain their semantic groups and their
      existing availability rules.
- [x] An Open Space Card's Layout and Graph choices use the shared control
      compositions and visual treatment used by the Dock. Each operates on the
      correct Space/context and does not navigate or edit the containing Space
      accidentally. Preserve existing read-only and unavailable-choice behavior.
- [x] Open/Close, Edit/Save/Cancel, title editing and Card entity actions retain
      their behavior. Close remains visible, focusable and unavailable during
      Markdown content editing. Toolbar gestures do not drag, pan, Open or Edit
      a Card underneath them as an unintended second action.
- [x] Shared components support both a Card's available width and the Dock's
      horizontal/vertical arrangements without clipping controls or focus
      indicators. Check Closed and Open Cards and representative canvas zooms.
- [x] The visible Card still fills its authored node rect after Open, during
      Resize and after reload, including with entity actions present. Neither
      toolbar wrappers nor broad selectors break nested Card geometry or handle
      hover treatment. Coordinate the underlying regression repair with 11.
- [x] Update the former coloured-rail claim explicitly to reflect this requested
      design change. Add matching application and Ladle evidence using the real
      shared components and the production entity-actions composition.
- [x] Demonstrate hover and keyboard operation, neutral toolbar treatment,
      retained connection colour and Space Card selections in both application
      and catalogue. Tests must not compensate for product defects with smaller
      hover targets or automatic dismissal before the gesture being tested.
- [x] Run verify, application E2E and Ladle E2E; record actual outcomes and inspect
      the resulting toolbar in a browser. Keep unrelated Dock decisions and
      Space Card persistence work outside this treatment change.

## Decision record

The user requires a Dock-consistent toolbar on Card hover, removal of the
coloured hover rail, retention of colour in handles and Graph connections, and
component reuse. The former coloured band is historical treatment; changing it
does not change ADR 0073's toolbar semantics or ADR 0064's authoring lifecycle.
No new ADR is needed solely to change this visual treatment.

## What was built

**Two shared components in `@project/ui`, and both surfaces mount them.**

- `CommandSurface.tsx` + `command-surface.css` declare the neutral panel
  once — translucent `--card`, a hairline `--border`, 10px corners, 4px padding,
  a 2px gap, two washed shadows and an 8px backdrop blur. `CommandToolbar` wears
  it with `Toolbar` semantics and spends one `orientation` twice, on Base UI's
  arrow keys and on the stylesheet's axis; `CommandSurface` wears it with no
  toolbar semantics; `CommandName` is the ellipsing name every command surface
  draws. `CommandDock` mounts `CommandToolbar` and so does `CardRailActions`, so
  the Dock and a Card's hover strip are one surface drawn twice.
  `command-dock.css` lost the treatment and the `__ident` rules and kept its own
  slots, cap, scroll, drag and column grid; `canvas-card.css` lost the rail band,
  the hand-drawn 22px control box and its `aria-disabled` correction, and kept
  only *when* the commands are revealed.
- `ChoiceMenu.tsx` is choosing one of a named set: a labelled radio list, its
  mark, its keyboard and its dismissal, with the set, the selection and the
  operation supplied by the caller. The Dock's Layout and Graph clusters draw it
  and so does an Open Space Card, whose two `Select`s it replaces. Rendering the
  group and its items from one type parameter retired `LayoutItem` and
  `GraphItem` — the hand-bound pair `components/dropdown-menu.tsx` warns about.

**The rail is neutral.** `CardRail` has no `graphColor` prop and
`--card-rail-graph` is gone; the band is a 38px row holding the kind glyph and
the strip. The Active Graph's colour is unchanged where it names a Graph: the
authoring handles `CardNode` paints and the Edges of each Graph.

**Geometry.** The rail grew 34px → 38px, exactly the strip's own height, and the
body's padding went 10px → 8px to keep the Title ladder inside a Closed Card —
`canvas-card-title-ladder.test.ts` and `canvas-card-embedded-layout.test.ts` are
what hold both, and `SPACE_CARD_EMBED_INSET.top` still clears the rail and the
border. Nothing wraps the Card, so ticket 11's node-rect repair is untouched.

**Reduced motion moved up rather than away.** A command's 200ms colour crossfade
is the shared `Button` recipe's; `canvas-card.css` withdrew it for a Card and
`command-dock.css` never did. It is withdrawn once, on `.command-surface`.

### Evidence

- `test/unit/command-surface-sharing.test.ts` (new) holds the ownership the
  ticket asks for and a rendering test cannot state: the treatment is declared
  once, both surfaces mount the component, neither declares any of it back, the
  rail paints no background, and both surfaces draw the one `ChoiceMenu`.
- The former coloured-rail claim is **changed, not dropped**:
  `canvas-card-shows-active-graph-colour` is now
  `canvas-card-toolbar-is-neutral-and-graph-colour-stays-on-connections`, over
  the same palette sweep. Its Ladle evidence draws every palette colour through
  the real `CardNode` and reads one surface across all six while each Card's
  handles carry their own colour; its application evidence compares the Card's
  strip against the Dock **on screen in the same page**, property by property.
- `open-space-card-chooses-its-context-on-the-shared-controls` (new claim) makes
  the same comparison for an Open Space Card's two choices in both suites, and
  asserts that choosing a Layout there leaves the containing Space's own Layout
  where it was.
- `card-rail-hover.spec.ts` gains a fit test: the revealed strip stays inside the
  Card's box, and a focused control's reconstructed ring stays inside the strip,
  Closed, Open and zoomed out.

### Run

- `pnpm verify` — green: 203 test files, 2486 passed, 2 skipped.
- `pnpm e2e` — green: 181 passed.
- `pnpm e2e:ladle` — green: 83 passed.
- Inspected in Chrome against the running fixture server: the hover strip is the
  Dock's panel, the handles are the Active Graph's blue, no band returns on
  hover or selection, and an Open Space Card's Layout and Graph rows read as the
  Dock's clusters do, with the same captioned radio list behind them.

### Found in review, and fixed here

**A command that is unavailable had stopped saying so, on both surfaces.** The
Card's deleted `aria-disabled` rules were correcting a Graph-coloured band, but
they were also the only thing quieting an unavailable rail command at all: a
toolbar item stays focusable while unavailable, so it carries `aria-disabled` and
not the native property, and `disabled:` utilities match neither it nor any
command in the Command Dock. Dropping them left Close mid-edit at full ink, still
taking the hover fill — operable to the eye and inert to the press, against this
ticket's own acceptance and ADR 0064. `Button`'s shared recipe carries it now:
the same opacity the property gets, plus withdrawal of the hover feedback, once,
for the Dock as well as the Card. `card-expand.spec.ts` reads the drawn result
rather than the attribute.

**The rail's grouping had inverted.** The strip took the surface's 2px gap while
each `role="group"` kept 4px, so members of a group sat further apart than the
seam between two groups. The groups are `gap-px` now, which is the Dock's own
pair the same way round.

**Two claims were overstated and are corrected.** `ChoiceMenu` is how a *Layout
or a Graph* is chosen, not how any named set is; the Space Card creation pane
still picks its target Space through `Select`, so one flow asks two ways, and
`docs/agents/ui.md` records that as a known seam this treatment change holds
outside itself rather than as uniformity it achieved. The same file's Dock bullet
no longer says `CommandDock` draws a `DropdownMenuRadioGroup`, which it no longer
does.
