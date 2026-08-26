# 04 — Snap Resize to Close

**What to build:** Let an author Close an Open Card by resizing it toward the
fixed Closed rect. When both proposed dimensions enter an application-owned
magnetic range, the transient canvas previews the exact Closed Size; releasing
performs one Close Edit and preserves the previous Open Size for the next Open.

**Blocked by:** 03 — Preview resizing through one canvas draft.

**Status:** ready-for-agent

- [ ] The magnetic distance is an application-owned UX token measured in canvas
      coordinates, not persisted state or a general spatial grid.
- [ ] A review story demonstrates outside, entering, and inside the magnetic
      range at multiple zoom levels so the token can be tuned against the real
      production interaction.
- [ ] Reaching only the Closed width or only the Closed height leaves the Card
      Open; Close occurs only when both dimensions resolve to the complete
      Closed rect.
- [ ] The Card remains Open for the active pointer gesture while the canvas
      previews the snapped rect; release completes one Close Edit.
- [ ] Resize-to-Close does not first persist a smaller Open Size. Reopening,
      including after reload, restores the Open Size held before the closing
      gesture.
- [ ] Space Authoring decides whether the final proposed dimensions complete
      Resize or Close; React Flow event wiring does not duplicate that domain
      transition.
- [ ] General Move/Resize grid snapping remains out of scope.
- [ ] Accept ADR 0066 only after its model, preview and close-snap claims match
      the implemented behavior; update scoped agent documentation that described
      the former Expanded representation.
- [ ] Production-parity application, Ladle and browser evidence cover the snap
      boundary, Close completion, preserved Open Size and reload.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass, with the real output
      recorded.
