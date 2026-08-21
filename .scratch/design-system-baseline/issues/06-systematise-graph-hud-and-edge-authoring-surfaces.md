# 06 — Systematise Graph HUD and Edge authoring surfaces

**What to build:** Give the graph key, minimap frame, selected-Edge controls and endpoint editing a coherent design-system surface without changing React Flow's spatial positioning, reconnection or deletion behaviour.

**Blocked by:** 01 — Establish the shadcn design-system baseline.

**Status:** resolved — delivered in `03cc3ff`, with the review and follow-up work
in `6afeb37`, `f7d945a`, `a0c2dd5`, `0ce9aa9` and `2e2e56b`. See "Results" below.
One defect was found and deliberately left, recorded at
`.scratch/design-system-baseline/findings/reconnected-edge-loses-its-selection.md`.

- [x] Graph legend, minimap framing, separators and status affordances use shared visual primitives and semantic tokens.
- [x] The selected Edge toolbar and endpoint picker use shared button, popover and form patterns while preserving their active-Graph and focus rules.
- [x] Ladle or focused component stories exercise the real HUD and Edge-control states independently of a live repository.

## Audit note

The branch updates shared pieces used by these surfaces, but it does not supply
focused production-component stories for the HUD, selected Edge toolbar,
endpoint editing, refusal and reconnection states. Those states remain in scope
here.

## Implementation handoff

Deliver this ticket as two vertical production modules, not one generic canvas-
controls abstraction. `SelectedEdgeControls` owns the selected Edge's Edit and
Delete actions, controlled endpoint Popover, stable-per-opening endpoint choices
and accessible refusal presentation. `GraphHud` owns the retained Graph key,
separator and real React Flow MiniMap composition. They share a delivery ticket
and design language, but no state or interface.

`AuthorableEdge` remains the React Flow adapter. It owns the routed Edge,
`EdgeLabelRenderer`, label coordinates, selection translation, portal placement
and the `nodrag`/`nopan`/canvas-key containment required by React Flow.
`SelectedEdgeControls` lives in `packages/app`, composes the shared Button,
Popover, Field, FieldError and `CardSearchCombobox` primitives, and receives no
`EdgeProps`, coordinates, `EdgeSubject` or whole commands context. Edge
Authoring remains the one owner of the interaction draft, eligibility,
reconnection, deletion, invalidation, selection and focus requests. Popover open
state is controlled from that owner. Endpoint choices are snapshotted when the
editor opens so rows do not move under an active pointer; completion still
revalidates against the current Space.

Delete remains immediate. Selecting an Edge retains React Flow's native
keyboard behaviour and does not open the editor; only the explicit Edit control
does. Controls exist only for the selected Edge in the Active Graph.

### Structured refusals

This extraction completes ADR 0057's Edge Authoring portion. Edge Authoring
must stop carrying display prose across its seam and retain the structured
`AuthoringRefusal` together with only the interaction context presentation needs
to identify connection, the attempted reconnection endpoint, deletion or a
completed pointer gesture. Do not add fields, React ids or copy to the domain
refusal, and do not store a derived presentation error bag.

Application presentation maps that identity once per surface through pure,
exhaustive adapters:

- keyboard connection owns its Target field and a form channel;
- selected-Edge endpoint editing owns From and To fields and a form channel;
- deletion owns the selected-Edge controls' form channel;
- a completed pointer gesture, whose initiating surface has gone, owns the
  canvas announcement channel.

A correctable reconnection refusal marks only the attempted From or To Field
invalid, composes its error description with the combobox's existing
description, and renders an adjacent FieldError. A stale Layout, Graph or Edge
condition that no endpoint can correct uses the form channel. A refused Delete
stays local to the surviving selected-Edge controls rather than masquerading as
an endpoint error or falling through to the generic canvas alert. No expected
refusal throws.

### HUD ownership

Keep the Graph key: it remains the on-canvas title, colour and Active Graph
reference when the workspace Sidebar is collapsed or off-canvas. Sidebar and
HUD must consume the same shared Graph colour resolution and must not disagree
about Active Graph emphasis.

`GraphHud` remains in `@project/react-flow-adapter`, because the MiniMap is a
React Flow dependency. Fold the shallow public `GraphLegend` markup into that
production module: it has one production caller, and deleting it concentrates
rather than spreads complexity. Keep Graph colour resolution as its own shared
seam because Sidebar and HUD are two real consumers. Endpoint fields likewise
remain private implementation of `SelectedEdgeControls`; the reusable Card-
choice seam is already `CardSearchCombobox`.

Move semantic visual ownership with each production module. Leave only portal
positioning, transforms and necessary React Flow geometry/integration styling
with the adapter. Do not perform a general stylesheet rewrite.

### Stable-story parity

Stable selected-Edge stories exercise the unchanged production controls in the
closed, endpoint-editor-open, disabled-choice, From-field-refusal,
To-field-refusal, form-level-reconnection-refusal and
form-level-deletion-refusal states. They receive structured refusals and public
production inputs, never finished error prose or story-only controls. Ladle
proves control semantics, focus, dismissal, endpoint choice and accessible
refusal placement. Paired application evidence proves selection and Active
Graph gating, spatial placement over the real routed Edge, completion and focus
after reprojection.

The stable HUD story mounts the unchanged `GraphHud` inside a minimal real React
Flow canvas with actual nodes. A fixture may provide Graphs, colours, nodes and
viewport constraints; it must not replace the MiniMap or fake framework
geometry. Paired application evidence proves that Sidebar and HUD agree on
Graph title, colour and Active Graph emphasis, including while the Sidebar is
collapsed.

Tests move to `SelectedEdgeControls` and `GraphHud` as the production
interfaces. Delete tests that pin only the retired `GraphLegend` seam or raw
toolbar markup; retain Edge Authoring lifecycle and real React Flow integration
coverage. Close the accounting with exact parity claim mappings and real
results from `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle`. Keep the ticket
`ready-for-human` until all three pass.

## Delivery record

### What moved

`SelectedEdgeControls` (`packages/app/src/components/SelectedEdgeControls.tsx`)
owns the selected Edge's Edit and Delete, the controlled endpoint Popover, the
per-opening endpoint snapshot and the accessible placement of every refusal it
can be handed. It takes domain facts and callbacks and no `EdgeProps`,
coordinates, `EdgeSubject` or commands context. `AuthorableEdge` keeps the
React Flow half — the routed Edge, `EdgeLabelRenderer`, the label coordinates,
the selection translation, portal placement and the `nodrag`/`nopan`/`nokey`
containment — and narrows Edge Authoring's one module-wide refusal to the two
channels the selected Edge owns.

`GraphHud` keeps the Graph key and now owns its markup: the public
`GraphLegend` component is deleted with its test, while `graphColor` and
`FALLBACK_GRAPH_COLOR` move to `packages/ui/src/graph-color.ts` and stay shared,
because the Sidebar's Graphs group and the HUD's key are two real consumers.
`packages/app/src/tailwind.css` gains `@source '../../react-flow-adapter/src'`,
without which the HUD's utilities are purged. `styles.css` keeps the portal layer —
renamed `.edge-control-layer`, since placement is all it is — and loses the four
rules that were the controls' own presentation.

### Structured refusals

`EdgeAuthoringState.refusal` is an `EdgeRefusal`: the domain's
`AuthoringRefusal` plus the interaction context presentation needs, and nothing
else. Four channels — `connection`, `reconnection` with the attempted endpoint,
`deletion`, and `gesture` for a completed pointer drag whose surface has gone.
`ConnectionResult` answers the structured refusal too. `authoring-refusal.ts`
gains three exhaustive adapters; `cardChoicePlacements` is shared by the two
Card-choosing surfaces because the question is the same on both. A retained
`deletion` refusal is dropped when the canvas selection moves.

### One defect found and left

A completed reconnection leaves the Edge **focused but not selected**, so the
Edge the author is standing on offers no controls — while `EdgeAuthoring.reconnect`
plainly intends the opposite and says so in a comment. It is untouched by this
change and is Edge Authoring's selection folding rather than a HUD or controls
question, so it is recorded at
`.scratch/design-system-baseline/findings/reconnected-edge-loses-its-selection.md`
with the measurement and the lead, and left for its own change. The application
evidence asserts the focus half, which holds, and claims nothing about the other.

### Two defects found and fixed

**The minimap covered the Graph key.** `MiniMap` renders its own React Flow
`Panel`, which is `position: absolute` with a `bottom`/`right` of 0 — so nested
in the HUD's Panel it left the flow and drew over every key row but the first.
It had been doing that since the HUD was assembled and nothing failed, because
the rows were still in the DOM for a test to find. Fixed with
`position: relative` on the MiniMap. The HUD is ~89px taller as a result, which
is what `new-space.spec.ts`'s Alt empty-drop now drops clear of.

**Escape did not dismiss the endpoint editor.** A `CardSearchCombobox` carrying
a selected value suppresses Base UI's Popover Escape entirely — measured against
`@base-ui/react` 1.7.0 in Chromium and written up in
`.scratch/design-system-baseline/findings/base-ui-popover-escape-and-combobox-value.md`.
`SelectedEdgeControls` answers Escape itself, in the capture phase, deferring to
an expanded endpoint list so the two layers still take one press each.

### Parity claims

| Claim | Story | Ladle | Application |
| --- | --- | --- | --- |
| `selected-edge-controls-offer-edit-and-delete` | `components/selected-edge-controls.stories.tsx#Closed` | `issue-06-graph-hud-and-edge-controls.spec.ts` — the selected Edge controls offer Edit and Delete, and open nothing on their own | `editing.spec.ts` — a selected Edge offers controls that delete it and open its endpoint editor: selection gating, **spatial placement** read off the drawn routed path, **Active Graph gating** through an activation, and the completion |
| `selected-edge-editor-shows-both-endpoints` | `#EndpointEditor` | the endpoint editor names both endpoints and dismisses on Escape | `editing.spec.ts` — the Edge editor moves an endpoint and keeps the Edge in its Graph, and **focus lands on the reconnected Edge** once the projection carrying it arrives |
| `selected-edge-endpoint-refusal-disables-its-choice` | `#DisabledChoice` | an ineligible endpoint keeps its place in the list, disabled, with its reason | `editing.spec.ts` — endpoint choices on a computed View are offered disabled, with their reason |
| `selected-edge-from-refusal-is-field-local` | `#FromRefusal` | a refused From endpoint marks only that Field and describes it | exempt — unreachable through any browser gesture |
| `selected-edge-to-refusal-is-field-local` | `#ToRefusal` | a refused To endpoint marks only that Field and describes it | exempt — same reason |
| `selected-edge-stale-reconnection-uses-the-form-channel` | `#ReconnectionRefusal` | a reconnection refusal no endpoint could correct uses the form channel | exempt — same reason |
| `selected-edge-deletion-refusal-stays-on-its-controls` | `#DeletionRefusal` | a refused Delete stays on the controls that asked | `editing.spec.ts` — a Delete a computed View refuses is reported on the selected Edge controls |
| `graph-hud-and-sidebar-agree-on-the-active-graph` | `surfaces/graph-hud.stories.tsx#Retained` | the Graph HUD keys every Graph and emphasises the active one | `overview.spec.ts` — the Sidebar and the canvas HUD agree about every Graph, collapsed or not |

The three exemptions are one condition: the editor snapshots eligibility when it
opens and disables every refusable row, and Base UI will not let a disabled row
be chosen — so a refused reconnection needs the Space to change under an open
editor, which no browser-driven flow produces. Each reason is written out in
`packages/app/stories/parity-claims.ts`, and both are covered instead by
`packages/app/test/authoring-refusal.test.ts` (the exhaustive placement over all
eighteen codes) and `packages/app/test/SelectedEdgeControls.test.tsx` (the Field
each lands on).

### Results

- `pnpm verify` — 139 test files, 1458 passed, 8 skipped. Typecheck, package
  typechecks, UI catalogue, ESLint, anti-slop, Prettier and coverage all clean.
- `pnpm e2e` — 105 passed.
- `pnpm e2e:ladle` — 26 passed.

## Comments

### 2026-08-18 — the legend now has a second statement of the same facts

ADR 0053 gives the workspace Sidebar a Graphs group carrying every Graph's
title, colour and active state, which is what `GraphLegend` in the canvas HUD
already says. Issue 14 keeps the legend deliberately and does not decide its
future: it sits with the minimap as an on-canvas colour reference beside the
Edges being read, and removing it is a HUD decision. **This ticket owns that
call** — keep the legend, reduce it to what the sidebar cannot say, or drop it
and leave the minimap. Whichever it is, the two surfaces must not disagree
about colour or about which Graph is active.
