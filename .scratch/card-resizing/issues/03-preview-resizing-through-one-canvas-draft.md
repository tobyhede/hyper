# 03 — Preview resizing through one canvas draft

**What to build:** Make an active resize a single transient canvas draft. As an
author drags, the resized Card, its Edges and every neighbour displaced by its
proposed Open Size move continuously from one draft-over-authored Placement.
Release commits the geometry already on screen; cancellation or Space
replacement restores the last authored canvas without producing an outcome.

**Blocked by:** 02 — Give every Open Card one resize control.

**Status:** ready-for-agent

- [ ] The render adapter owns proposed resize geometry beside its existing
      projection and drag bookkeeping; Space Authoring receives only the final
      proposed Open Size.
- [ ] One effective preview Placement drives the resized Card, neighbour
      displacement, handle geometry and Edges; no consumer locally patches a
      node while another reads authored geometry.
- [ ] Preview displacement retains ADR 0064's derived `+x`/`+y` rule and never
      writes displaced coordinates into the Layout.
- [ ] Pointer movement changes no Space and emits no intermediate Edit or
      persistence commit.
- [ ] Release produces exactly one Edit and causes no second geometry jump when
      the authored projection replaces the draft.
- [ ] Pointer cancellation, loss of the resize interaction, and replacement-epoch
      invalidation discard the complete draft and restore authored geometry.
- [ ] Unit, application, and browser evidence cover live Card, neighbour and
      Edge geometry as well as completion and cancellation.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass, with the real output
      recorded.
