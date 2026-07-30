# The toolbar selects Views and Layouts

Status: resolved
Type: task

Replace the generic Auto-arrange prototype control with an icon View selector.
The selector makes the domain split visible instead of hiding an arbitrary
layout strategy behind a command.

The menu has two groups:

- **Views** — Graph, Grid, and future application-supplied Algorithmic Views.
- **Layouts** — the Space's titled Positioned Layouts.

The active item is marked. The icon button has an accessible name and tooltip
such as "Choose view". Selecting any item is navigation only: it changes the
renderer without submitting persistence or changing `defaultView`. With no
Space default, the application fallback remains an Algorithmic View; a global
fallback cannot name a Layout owned by one Space.

Editing a selected Layout updates that Layout. Editing an Algorithmic View
copies every card position already on screen into a new Positioned Layout,
applies the edit there, assigns the next unique neutral title (`Layout 1`,
`Layout 2`, and so on), and immediately selects it. Existing Layouts remain
unchanged. Automatic persistence adds the new Layout to the Space and makes it
`defaultView`.

Remove the Auto-arrange button, its tests, and `ResolvedView.automatic`. A
Layout records no source View or layout strategy, and choosing another View is
not undo or reversal.

## Acceptance

- The toolbar icon opens a keyboard-accessible menu grouped into Views and
  Layouts, with the current renderer marked.
- Graph and Grid select their concrete automatic layout strategies; each named
  Layout selects `positionedStrategy` over its authored positions.
- Selection alone leaves the Space snapshot, editor revision, persistence
  revision, and `defaultView` unchanged.
- The first completed edit in an Algorithmic View creates and selects one new
  uniquely titled Positioned Layout, preserves existing Layouts, submits it,
  and makes it `defaultView`.
- Editing an existing Layout updates it rather than creating another one.
- The generic Auto-arrange control and `ResolvedView.automatic` no longer
  exist.
- Unit/property tests cover resolution and conversion; Playwright covers the
  icon selector, navigation-only selection, and first-edit persistence.

## Resolution

Implemented as the accepted two-peer View and Layout selector refinement in the
toolbar design handoff, alongside the joined Route/Present control and route
HUD. Graph and Grid navigation remains runtime-only. A first completed edit in
either View creates and selects the next `Layout N`; later edits update that
Layout in place. `pnpm verify` and `pnpm e2e` are the release gates.
