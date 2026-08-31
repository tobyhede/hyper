# 02 — Make Computed Views read-only

**What to build:** Make every Computed View a genuinely read-only Space View so
that `Create Layout` is the sole transition to authored state and every existing
authoring workflow remains available after a Layout has been created or selected.

**Blocked by:** 01 — Create a Layout from the selected Computed View.

**Status:** ready-for-agent
**Tags:** release/v1

- [ ] No Card, Alias, placement, Open state, Graph or Edge operation implicitly
      creates a Layout while a Computed View is selected.
- [ ] Authoring controls are absent or disabled on Computed Views with an
      accessible explanation that a Layout must be created before editing.
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

