# 01 — Create a Layout from the selected Computed View

**What to build:** Let an author explicitly turn the selected Computed View into
a new Layout through the Sidebar's `Create Layout` command, without changing the
existing creation contract or any Layout the Space already owns.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent
**Tags:** release/v1

- [ ] The active Computed View offers one `Create Layout` command in the Sidebar;
      inactive Computed Views and authored Layouts do not.
- [ ] The command is unavailable until the selected Computed View's placement is
      ready and never captures stale or unresolved placement.
- [ ] Creation captures every Card in the Computed View output and its resolved
      position without moving any Card, gives the new Layout the next neutral
      title, and asks the Computed View for freshly identified owned Graphs under
      its existing policy.
- [ ] Creation leaves existing Layouts untouched, selects the new Layout, makes
      it the default renderer, and enters normal automatic persistence.
- [ ] A refused creation adds no Layout and leaves the Computed View selected
      while the existing operational-feedback surface explains the failure.
- [ ] Creating from a Computed View works when the Space already owns other
      Layouts.
- [ ] Unit, application, E2E and Ladle evidence cover ready, pending, successful
      and refused states on desktop and narrow screens.
