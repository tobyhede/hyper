# 02 — Edit an opened Markdown Card

**What to build:** Extend a directly opened Markdown Card from a reading surface
into an explicit in-place editor for its description and Markdown source, while
keeping its title on the graph and completing changes through Space Authoring.

**Blocked by:** `space-authoring/05` — Accept the stored Space without
remounting.

**Status:** ready-for-agent

- [ ] Opening a Markdown Card remains a reading action and does not by itself create an Edit, convert a View or submit persistence.
- [ ] The opened reading surface offers an explicit Edit action outside presenting.
- [ ] The editor displays the Card title without offering a second title field.
- [ ] The editor can add, change or remove the Card description and edit its Markdown body as source.
- [ ] An empty Markdown body remains valid.
- [ ] An empty or whitespace-only description field removes the description: the completed Card carries no `description` key rather than an empty one.
- [ ] Description validation enforces the existing non-empty, single-line and length rules on a description that is present before completion, and reports an accessible field error.
- [ ] Typing remains local draft state; cancelling returns to the unchanged reading surface and submitting an unchanged draft is a no-op.
- [ ] Completing a valid changed draft installs its authoritative Card value before notifying Space Authoring.
- [ ] Space Authoring replaces only the intended Card document, preserves every unrelated Card, Route and Layout, validates the complete Space and submits it once.
- [ ] The first content Edit in an Algorithmic View creates and selects a Layout from the positions already on screen without moving Cards.
- [ ] A content Edit in a selected Layout updates that Layout in place and preserves its Route choices.
- [ ] Persistence progress, failure, retry and conflict behavior remain available while the authoring surface stays coherent.
- [ ] Accepting a remote replacement closes a draft based on the superseded Space so it cannot be applied later.
- [ ] The opened editor is selected through an exhaustive resolved-content interface that keeps React outside the domain and graph modules and makes a future Space content kind a compile-time decision.
- [ ] Component tests cover reading-to-editing transition, field validation, Markdown source editing, cancellation, no-op completion and the absence of a duplicate title field.
- [ ] Playwright proves an opened Markdown Edit persists through the HTTP boundary, survives reload and converts an Algorithmic View without visual movement.
- [ ] Presenting remains read-only and exposes no opened-Card Edit action.
- [ ] `pnpm verify` and `pnpm e2e` pass.
