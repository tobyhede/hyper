# 02 — Make Computed Views read-only

**What to build:** Make every Computed View a genuinely read-only Space View so
that `Create Layout` is the sole transition to authored state and every existing
authoring workflow remains available after a Layout has been created or selected.

**Blocked by:** 01 — Create a Layout from the selected Computed View.

**Status:** superseded by ADR 0079 and `layout-only-v1/03`
**Tags:** release/v1

ADR 0079 removed Computed Views from V1 outright rather than making them read-only, so there is nothing left to hold read-only and `computed-view-read-only` goes with them. [`layout-only-v1/03`](../../layout-only-v1/issues/03-make-layout-the-only-v1-canvas-selection.md) owns that removal, including the live guidance this ticket asked to describe the read-only contract. The criteria below are kept as the record of what was planned.

- [ ] No Card, Alias, placement, Open state, Graph or Edge operation implicitly
      creates a Layout while a Computed View is selected.
- [ ] Card, Alias, placement, Open state, Graph and Edge authoring controls are
      absent or disabled on Computed Views with an accessible explanation that a
      Layout must be created before editing; Create Layout remains available for
      the active Computed View.
- [ ] Authoring pointer gestures, connection handles and keyboard shortcuts do
      not begin interactions on a Computed View; keyboard attempts announce the
      same read-only reason where feedback is required.
- [ ] Selecting or creating a Layout restores the complete existing authoring
      workflow without adding a second edit mode or capability model.
- [ ] The explicit command is the only path that invokes the Computed View's
      conversion contract; an attempted Edit is neither replayed nor converted
      automatically after creation.
- [ ] Unit, application, E2E and Ladle evidence cover every authoring entrypoint
      that formerly converted a Computed View and prove Layout authoring is
      unchanged.
- [ ] Live agent guidance and release documentation describe Computed Views as
      read-only and explicit creation as the sole crossing into a Layout.
