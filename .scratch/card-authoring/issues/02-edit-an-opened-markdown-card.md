# 02 — Edit an opened Markdown Card

**What to build:** Open a Markdown Card directly onto one editable surface for
its title, description and Markdown source, completing changes through Space
Authoring without introducing a separate reading mode (ADR 0037).

**Blocked by:** `space-authoring/05` — Accept the stored Space without
remounting.

**Status:** resolved

- [x] Opening a Markdown Card presents its editable fields immediately but does
      not by itself create an Edit, convert a View or submit persistence (ADR
      0037).
- [x] The opened Card has no preceding reading mode or explicit action for
      entering editing (ADR 0037).
- [x] The editor authors the Card title as well as offering inline title
      authoring on the graph; only one surface is visible at a time (ADR 0037).
- [x] The editor can add, change or remove the Card description and edit its Markdown body as source.
- [x] An empty Markdown body remains valid.
- [x] An empty or whitespace-only description field removes the description:
      the completed Card carries no `description` key rather than an empty one.
- [x] Description validation enforces the existing non-empty, single-line and length rules on a description that is present before completion and reports an accessible field error.
- [x] Typing remains local draft state; cancelling or pressing Escape closes the
      editor with the Card unchanged, and submitting an unchanged draft is a
      no-op.
- [x] Completing a valid changed draft installs its authoritative Card value before notifying Space Authoring.
- [x] Space Authoring replaces only the intended Card document, preserves every unrelated Card, Route and Layout, validates the complete Space and submits it once.
- [x] The first content Edit in an Algorithmic View creates and selects a Layout from the positions already on screen without moving Cards.
- [x] A content Edit in a selected Layout updates that Layout in place and preserves its Route choices.
- [x] Persistence progress, failure, retry and conflict behavior remain available while the authoring surface stays coherent.
- [x] Accepting a remote replacement closes a draft based on the superseded Space so it cannot be applied later.
- [x] The opened editor is selected through an exhaustive resolved-content interface that keeps React outside the domain and graph modules and makes a future Space content kind a compile-time decision.
- [x] Component tests cover direct editing on arrival, field validation,
      Markdown source editing, description removal, cancellation, no-op
      completion and whole-Card completion.
- [x] Playwright proves an opened Markdown Edit persists through the HTTP boundary, survives reload and converts an Algorithmic View without visual movement.
- [x] Presenting remains read-only and exposes no opened Card editor.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

Implemented by PR #17 and reconciled with ADR 0037. Opening a Markdown Card now
shows one editor for its title, optional description and Markdown source. Drafts
remain local until a complete validated Card is handed to Space Authoring;
cancelled and unchanged drafts create no Edit. The resolved-content editor
registry remains exhaustive, and conflict replacement invalidates the opened
draft. Verification passed with all 744 tests in `pnpm verify` and all 66 tests
in `pnpm e2e`, including opened-card component, application and browser
coverage.
