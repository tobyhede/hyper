# 03 — Preview resizing through one canvas draft

**What to build:** Make an active resize a single transient canvas draft. As an
author drags, the resized Card, its Edges and every neighbour displaced by its
proposed Open Size move continuously from one draft-over-authored Placement.
Release commits the geometry already on screen; cancellation or Space
replacement restores the last authored canvas without producing an outcome.

**Blocked by:** 02 — Give every Open Card one resize control.

**Status:** resolved

- [x] The render adapter owns proposed resize geometry beside its existing
      projection and drag bookkeeping; Space Authoring receives only the final
      proposed Open Size.
- [x] One effective preview Placement drives the resized Card, neighbour
      displacement, handle geometry and Edges; no consumer locally patches a
      node while another reads authored geometry.
- [x] Preview displacement retains ADR 0064's derived `+x`/`+y` rule and never
      writes displaced coordinates into the Layout.
- [x] Pointer movement changes no Space and emits no intermediate Edit or
      persistence commit.
- [x] Release produces exactly one Edit and causes no second geometry jump when
      the authored projection replaces the draft.
- [x] Pointer cancellation, loss of the resize interaction, and replacement-epoch
      invalidation discard the complete draft and restore authored geometry.
- [x] Unit, application, and browser evidence cover live Card, neighbour and
      Edge geometry as well as completion and cancellation.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass, with the real output
      recorded.

## Answer

The render adapter now owns one `ResizeDraft`: the Card id, final proposed Open
Size, and one Placement layered over the authored Placement. The application
renders that Placement through the ordinary positioned strategy and canvas
projection, so the resized Card, derived `+x`/`+y` neighbour displacement,
handles and Edges arrive in one published projection. React Flow's local
node-only dimension update is vetoed through `shouldResize`; pointer release
completes the final size once, while pointer cancellation, focus loss, unmount,
renderer selection and replacement-epoch invalidation discard the draft.
While that lifecycle is active, the Card rail and its buttons and the
Edge-authoring handles withdraw, leaving the resize control as the one visible
operation until the gesture ends.

Evidence is split across the render-adapter contract, the real
`SpaceCanvas`/`NodeResizeControl` lifecycle, `CardNode` loss/completion behavior,
and the browser gesture. The browser assertion observes the Card, Card B and an
Edge moving before release while the persistence revision stays fixed, then one
revision on release and full authored restoration after cancellation.

Final verification:

- `pnpm verify` — passed; TypeScript 7.0.2 toolchain assertion, root and package
  typechecks, UI catalogue, ESLint, anti-slop, formatting and coverage all green.
- `pnpm e2e` — 113 passed (2.3m). An earlier run found four orphaned test-only
  Vite processes on ports 5304–5307 after an interrupted attempt; stopping those
  exact processes allowed the clean full run.
- `pnpm e2e:ladle` — 48 passed (14.4s).
