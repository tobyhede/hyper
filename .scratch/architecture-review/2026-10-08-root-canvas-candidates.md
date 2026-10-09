# 8 October 2026 architecture review — candidates 3 and 6

Source: the architecture review for hyper dated 8 October 2026, an untracked HTML report. Candidate 1 was verified on `main` at `92ddc99a`; the rest of the audit was scoped to `one-hyper-cli` at `f605c525`, over the three-week hot spots. This file keeps the two candidates `root-canvas-surface/spec.md` cites, in the report's words; the other candidates are not carried here.

## 3 · The root canvas drawn from its Map surface

Rating: Strong, in-process.

Files: `packages/app/src/App.tsx` (428), `packages/app/src/components/SpaceCanvas.tsx` (1833), `packages/app/src/map-surface.ts`, `use-map-surface.ts`, `packages/app/src/components/EmbeddedMapAuthoring.tsx`.

Before: `SpaceCanvas`'s interface is about 45 props plus an optional surface, over an 1833-line implementation. `App` unpacks `composition.surface` into authoring, edgeAuthoring, selection, nodes, edges, graphs, colours, mapId, activeGraphId and more.

After: the surface is required and the canvas takes root extras only. `SpaceCanvas` reads view, project, adapter and edgeAuthoring off the `MapSurface`. Two adapters sit at the surface seam: the root canvas and the drawn (embedded) Map.

Problem. `App` takes apart a surface `SpaceCanvas` could read itself; `App`↔`SpaceCanvas` co-changed 17 times since 2026-09-17 00:00 AEST. This identifies wiring to inspect; deleting `App` would relocate its composition responsibilities rather than remove them.

Solution. `SpaceCanvas` takes a required `MapSurface` plus drops, placement and notice sinks, the way `EmbeddedMapAuthoring` already does.

- Locality: a canvas capability is a surface change.
- Leverage: root and drawn keep the existing shared `MapSurface` path; preserve occurrence-owned selection, projection and continuation.
- Tests can build a surface plus explicit root-only inputs; placement readiness and live projection remain distinct facts.

ADR 0112 implementation is under verification (`.scratch/a-map-is-a-map/`): this completes it rather than contradicting it — sequence it after that verification lands.

## 6 · One opened-Space view for the Dock and the canvas

Rating: Worth exploring, in-process.

Files: `packages/app/src/App.tsx`, `dock-chrome.ts` (463), `packages/app/src/components/command-dock-chrome.ts` (497), `CommandDock.tsx` (783).

Before: `App` calls `useMapView`, `useResourcePlacement`, `useMapSurface`, `useSpaceAddresses` and about eleven more hooks, spreads their results, and passes 15 top-level inputs to `useDockChrome` for `CommandDock` and the same values to `SpaceCanvas`.

After: `App` builds one opened-Space view that `useDockChrome` and `SpaceCanvas` both read.

Problem. `App` changed 54 times since 2026-09-17 00:00 AEST; `App`↔`CommandDock` co-changed 20 times. The hook fan-out is visible, but commit counts do not establish that wiring accounts for most changes.

Solution. Reassess after candidate 3. Extract only genuinely shared derived reading; keep Dock-specific persistence, disclosure and command behaviour explicit. A hook that merely bundles the current inputs relocates the interface without deepening it.

- Locality: a Dock fact skips `App`.
- `App` becomes a testable composition point.
- Do after 3; measure the remaining duplicated reading before choosing an interface.

### Outcome, 2026-10-09

Done in the narrowed form `.scratch/one-map-reading/` records: one Map reading. `useMapView` is deleted, `MapView` carries its Space, and `App` feeds the Dock and the presenting Stage from the root surface's `reading.view`, which the canvas reads too; `SpaceCanvas` reads the Space title off that reading. The broad form — an opened-Space object that `useDockChrome` and `SpaceCanvas` both read — is set aside: `useDockChrome`'s input is unchanged, and it is revisited only if that input is shown to keep churning.
