# 01 — Make the Card pane one editable surface

**What to build:** Collapse the opened Card's reading and editing states into a
single editor over title, description and Markdown source.

**Blocked by:** nothing.

**Status:** resolved

- [x] An opened Card shows its editor immediately, with no action to begin editing and no reading state in front of it.
- [x] The pane authors the Card's title, its description and its Markdown source.
- [x] The title validates as the graph's inline editor does — trimmed and non-empty — and reports its own accessible field error.
- [x] Cancel closes the pane and leaves the Card unchanged; Done completes one Edit.
- [x] A Done that changes nothing produces no Edit, converts no Algorithmic View and submits no snapshot.
- [x] One Done submits one whole Card document, so title, description and body cannot persist separately.
- [x] `Escape` cancels, as it already does, and does not close the Card out from under a draft.
- [x] `CardRenderer`'s use here, the `editing` flag, the `initiallyEditing` prop, the focus-restoration ref and the "Edit Card" action are all removed.
- [x] `CardRenderer` itself stays in `@project/ui` — losing its only current caller is not a reason to delete a presentation-agnostic component.
- [x] Renaming in the pane and renaming on the graph are the same Edit against the same Card, proven equivalent rather than tested twice.
- [x] Playwright proves a title authored in the pane persists and survives reload.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

`OpenCard` is the editor and nothing else. The reading surface, the `editing`
flag, `initiallyEditing`, the focus-restoration ref, the "Edit Card" action and
the `footer` prop are all gone, and with them the `title`/`displayTitle` prop
that existed only to draw a heading above a surface that could not author it.

The title is a field, validated exactly as the graph's inline editor validates —
trimmed, non-empty, its own accessible error. `Escape` still cancels, and now
closes with it: there is no reading state behind the editor to fall back to.

(Later superseded: `CardRenderer` was subsequently deleted from `@project/ui`
altogether, as the separate decision this paragraph anticipated. It exists
nowhere in `packages/` now.)

`CardRenderer` stays in `@project/ui` with no caller. It is presentation-agnostic
and losing its only current use is not a reason to delete it; that is a separate
decision for whoever wants one.

`.open-card__content` went with the surface it styled.

`pnpm verify` green (74 files / 712 tests). `pnpm e2e` green (65).
