# The root canvas reads its Map surface

Status: ready-for-agent

## Problem Statement

ADR 0112 says a Map behaves the same wherever it is drawn: the root canvas and every drawn (embedded) Map are each a Map surface over their own Space composition, with an explicit Map, Graph, occurrence and policy. The drawn Map honours that — `EmbeddedMapAuthoring` reads its surface through `useMapSurface` where it is drawn. The root canvas does not. `App` reads the root surface and takes it apart into about thirty props for `SpaceCanvas` (nodes, edges, selection, the select and change handlers, Edge Authoring, authoring, Map id, Graphs, colours, the Active Graph, placed Resources, availability, resize, embedded-editing reports), beside about fifteen inputs only the root has. `SpaceCanvas`'s `surface` is optional, and without one it falls back to the `authoring` policy, so a root canvas can draw under a policy its surface does not hold.

Two consequences for whoever changes the canvas:

- A canvas capability is a change to the surface, to `App`'s unpacking and to `SpaceCanvas`'s props at once; `App` and `SpaceCanvas` co-changed 17 times since 2026-09-17.
- `App` builds the Map view twice — `useMapView` over the rendered snapshot and `surface.view()` over the live session — and hands `SpaceCanvas` a mix of the two. They agree while the session is unchanged because both read through the one `readWorkingSpace`, but nothing makes the canvas read the view its own projection is built from.

## Solution

`SpaceCanvas` takes a required `MapSurface` and the result of reading it (`useMapSurface`'s answer), and works out for itself everything the surface already knows. `App` keeps its one `useMapSurface` call, because the Dock needs the same availability, and passes the surface, the reading and the inputs only the root has. The `authoring` fallback is deleted, so the root canvas draws under exactly the policy its surface holds — the same rule a drawn Map follows.

## User Stories

1. As a developer adding a canvas capability, I want to change the Map surface and `SpaceCanvas` only, so that `App` is not a third place every capability passes through.
2. As a developer, I want `SpaceCanvas` to require a Map surface, so that no root canvas can be mounted without the policy, occurrence and target ADR 0112 gives every drawing.
3. As a developer, I want the root canvas's policy to come only from its surface, so that a read-only or inert root surface cannot be drawn as authoring by omission.
4. As a developer, I want the root canvas and a drawn Map to read their surface the same way, so that one rule explains both drawings.
5. As a developer, I want `SpaceCanvas` to read placed Resources, Graphs, colours and the Map title from the same view its projection is built from, so that the canvas cannot draw one Space while authoring against another.
6. As a developer, I want `SpaceCanvas` to read the Map id and the Active Graph from the surface's context, so that the canvas and its surface cannot name different Maps or Graphs.
7. As a developer, I want `SpaceCanvas` to work out whether it is presenting from the surface's context, so that presenting is one fact rather than a prop that could disagree with the surface (if the context's presenting Resource is non-null exactly when Navigation presents).
8. As a developer, I want `SpaceCanvas` to mint the next Resource title from the Space session, the way a drawn Map does, so that both drawings name a new Resource by one rule.
9. As a developer, I want the canvas selection, its select handlers, node and Edge changes, resize and embedded-editing reports to come from the surface's render adapter reading, so that `App` stops re-exporting the adapter one field at a time.
10. As a developer, I want Edge Authoring and Space Authoring to come from the surface, so that the canvas authors through the same collaborators its surface composed.
11. As a developer, I want availability to arrive inside the surface reading, already narrowed by the surface's policy and by the open set's image replacement, so that the canvas and the Dock withdraw the same commands.
12. As a developer, I want Resource placement passed as one value rather than five drop and paste callbacks, so that placement reads as one owner, as it does in a drawn Map's publication.
13. As a developer, I want placement readiness and the live projection kept as two separate facts, so that a gesture is never interrupted while a replacement placement resolves.
14. As a developer, I want the comment explaining why the projection is null while placement resolves to sit where `SpaceCanvas` reads it, so that the reason travels with the code it constrains.
15. As a developer, I want the root-only inputs — command outcomes, delete confirmation, the Space session, image replacement, naming on creation, the Space title, Space Resource target titles, Resource rail actions, the editing reports and the drawn-Map sinks — to stay explicit props, so that what only the root has is visible at its one call site.
16. As a developer, I want `App` to keep one `useMapSurface` call for the root, so that the Dock and the canvas share one subscription and one render-adapter reading.
17. As a developer, I want `App` to keep `useMapView` for the Dock and the presenting stage for now, so that this change does not decide candidate 6's opened-Space view.
18. As a developer writing a `SpaceCanvas` test, I want one shared helper that builds a real Map surface over a composed Space, so that tests mount the canvas the way production does without restating the composition.
19. As a developer, I want a regression test showing an inert-policy root surface withdraws canvas authoring, so that reintroducing a default policy fails a test.
20. As an author, I want every canvas behaviour — selecting, connecting, dragging, dropping, pasting, resizing, renaming, presenting, editing a drawn Map — to behave exactly as before, so that this refactor is invisible to me.
21. As a reviewer, I want the rendering guide and ADR 0112's delivery note to say the root canvas reads its surface, so that the docs describe the code.

## Implementation Decisions

- Scope is candidate 3 of the 2026-10-08 architecture review only. Candidate 6 (one opened-Space view for the Dock and the canvas) is reassessed after this lands, by measuring the reading still duplicated.
- `SpaceCanvas`'s props become: a required `surface` (`MapSurface`); `reading`, the value `useMapSurface` answers for that surface; `placement`, the Resource placement value whole; and the root-only inputs listed in story 15. No new "root extras" type is introduced.
- Derived inside `SpaceCanvas`:
  - from `reading.view`: placed Resources, visible Graphs, Graph colours, the Map title;
  - from `reading.canvasRendering`: nodes, edges, the projected nodes, selection and its handlers, node and Edge changes, resize, embedded-editing reports, placement readiness;
  - from `reading.availability`: availability;
  - from `surface`: Space Authoring and Edge Authoring;
  - from `surface.context()`: the Map id, the Active Graph and presenting;
  - from the Space session: the next Resource title.
- If a canvas context's `presentingResourceId` is not non-null exactly when Navigation is presenting, `presenting` stays a prop and the reason is recorded in ticket 01.
- The `authoring` fallback for a missing surface is deleted. The surface's policy is the only policy.
- `App` keeps one `useMapSurface` call per root and keeps `useMapView` for the Dock, `renderedSpace` and the presenting stage.
- Placement readiness (`hasResourcesOnCanvas`) and the live projection stay distinct; the comment at the call site moves to `SpaceCanvas`.
- The replacement-epoch `key` stays on the `SpaceCanvas` element in `App`.
- No ADR: this carries out ADR 0112 rather than deciding anything new.

## Testing Decisions

- A good test drives the canvas through what it renders and what its surface commits, never through which props it received.
- `SpaceCanvas` tests mount a real surface built by one shared test helper over `composeApp` and `createMapSurface`; the four test files that mount `SpaceCanvas` move to it.
- New regression test, red first: a root `SpaceCanvas` whose surface holds the inert policy offers no canvas authoring. Proven red by making the canvas ignore the surface's policy.
- Prior art: `space-resource-embedded-map.test.tsx` (a drawn Map through its surface), `map-surface-policy.test.ts` (policy × drawing), `dock-navigation-hold.test.tsx` (root mounted through the open set), `SpaceCanvas.test.tsx`.
- E2E and Ladle E2E are the behaviour-unchanged evidence and run in CI.

## Out of Scope

- Candidate 6: merging `useMapView` and the Dock's reading into one opened-Space view.
- Changing `MapSurface`'s interface or `useMapSurface`'s answer, beyond what the canvas needs to read.
- `EmbeddedMapAuthoring` and the drawn Map's publication.
- Any behaviour change.

## Further Notes

- Source: candidate 3 of `/private/var/folders/fx/m_71jpr51bqf9jjlgh8m_pq00000gn/T/architecture-review-20261008-142617.html`, grilled 2026-10-08.
- Stacked on PR #346 (`a-map-is-a-map-closeout`), which records ADR 0112 as built.
