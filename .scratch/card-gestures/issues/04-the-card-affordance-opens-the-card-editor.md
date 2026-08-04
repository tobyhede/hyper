# 04 — Point the Card affordance at the Card editor

**What to build:** Make the pencil on a Card open that Card's editor — the
description and Markdown surface "Edit Card" already opens — instead of
beginning a title rename. Supersedes the pointing decided in `01`.

**Blocked by:** nothing. Independent of `02` and `03`, which change gestures
rather than this control.

**Status:** resolved

- [x] The affordance opens the Card and shows its editor, not its reading surface — otherwise it is a second way to do what opening already does.
- [x] Its accessible name becomes `Edit Card <title>`, and remains the control's only accessible name because the glyph is `aria-hidden`.
- [x] It no longer begins title editing. Renaming is the title's double click (`03`) and `F2`.
- [x] It is not drawn on an Alias, which owns no content to edit; an Alias is still renamed by `F2` and by its title.
- [x] It keeps its hover, selection and focus reveal rules, its withdrawal rules, its tab position and its three `stopPropagation` calls.
- [x] `Enter` and `Space` on the focused affordance open the editor and do not merely open the Card.
- [x] Closing the Card from that editor leaves no state that opens the next Card into its editor.
- [x] `F2` and the title rename are proven unaffected — the two rename paths do not go through this control.
- [x] Playwright proves the affordance reaches the Markdown editor and that a completed edit from it persists.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

The affordance calls `onEditCard`, which opens the Card and mounts `OpenCard`
already showing its editor. `initiallyEditing` is read once at mount; closing
unmounts the component, which is what stops the next Card inheriting it — pinned
by a test that opens A from the affordance, closes it, then double-clicks B and
finds the reading surface.

It is absent on an Alias: `editableCardIds` carries the Cards that own content,
and an Alias owns a title and a pointer. Renaming an Alias is its title's double
click and `F2`.

Opened from the affordance there is no Close button — the editor's actions are
Cancel and Done, and Cancel lands on the reading surface that has one.

`pnpm verify` green (74 files / 707 tests). `pnpm e2e` green (64).
