# 06 — Retire the prototype scaffolding

Status: ready-for-human
Blocked by: the theme change, which has no ticket anywhere in `.scratch/`

**What to build:** The cleanup pass that runs last. Three unrelated things share
this ticket only because each is a deletion or a one-line compliance fix, and none
is worth its own file.

- [x] **Delete the settled sheets and their CSS.** `01` answered all three, so
      `space-trail`, `space-switcher` and `dock-feedback` are gone with the
      three `.css` files that reimplemented the dock strip under their own
      prefixes.

      Four live comments cited a deleted sheet as their evidence and now cite
      `01` instead: `dock-model.ts`'s `trailControls`, the switcher's indent
      comment in `command-dock.stories.tsx`, `.dock-proto__unwell` in
      `command-dock.css`, and `dock-trail.test.ts`. That redirect is the whole
      reason `01` was made to hold the reasoning rather than leaving it in the
      sheet headers — a citation to a deleted file is worse than no citation,
      because it reads as evidence until someone goes looking.

      While rewriting the `.dock-proto__unwell` comment: it claimed the unwell
      sentence lives "in the row's `title` and in an `sr-only` span". The
      `title` was removed — the JSX says why, it announced the same sentence
      twice — so the comment described markup that is not there. Corrected.

- [x] **`parent-space-mark` — asked, answered, deleted.** The human confirmed
      the cube is the correct mark and is to be locked down. Its own header was
      stale — it still announced "the return mark is chosen" and drew six ways
      of combining a return mark with the Space glyph, which is not what was
      built — so the sheet was arguing for a candidate the decision had already
      passed over. Gone with `parent-space-mark.css`.

      **Locking it down was the other half.** A decision recorded only in a
      prototype is not locked, so the mark moved to `@project/ui` as
      `ParentIcon` in the same pass — that is `03`'s last item, and it could not
      be done before now because it needs a name. The reasoning moved with it:
      the silhouette argument, the optical correction, the stroke, and what the
      cube costs are all in the export's own doc comment, which is what the
      sheet's deletion took away. `.dock-proto__crumb`'s comment in
      `command-dock.css` cited the deleted sheet and now cites this ticket.
- [x] **Add the `prefers-reduced-motion` guard.** Added, following
      `packages/app/src/styles.css`. The surface has exactly one piece of
      motion — the 160ms ease the dock snaps to a chosen edge with, which is
      already suppressed while the pointer holds it — so the guard removes that
      one transition rather than shortening it: what it buys is legibility of a
      move the reader just made with their own pointer, and they know where it
      went.
- [ ] **Resolve the palette fork — BLOCKED on the theme change, which has no
      ticket.** `packages/app/src/tailwind.css:39` is still `color-scheme: dark`.
      This item's own condition is "once the app's `:root` is light", so it
      cannot be started, let alone finished, until that lands. The rest of the
      item is unchanged and still correct:
      `command-dock.css:25-64` sets `color-scheme: light` and forks roughly
      twenty-four semantic tokens; the app's `:root` is dark
      (`packages/app/src/tailwind.css:39`). This item was written assuming the
      dark `:root` was the target and the fork was the mistake. **It is the other
      way round: the application is not meant to be dark, and that is being
      fixed.** So the fork is the proposal, the prototype's colour judgements
      were made against the theme the application is moving to, and nothing in
      that sheet needs redrawing on these grounds.

      What remains is the second half of the original item — the fork must stop
      being implicit. Once the app's `:root` is light, `command-dock.css`'s
      twenty-four token overrides are either redundant (delete them) or they
      disagree with the real theme (reconcile them). A fork that survives the
      thing it was forking from is how a prototype's palette quietly becomes a
      second design system.

      **This bit while it is still true.** A colour fix justified by "the app is
      dark" is wrong for the theme being built. One already happened: a review of
      ticket `03` called `Popover`'s move from
      `shadow-[0_12px_40px_rgba(0,0,0,0.5)]` to `shadow-lg` a regression, on the
      grounds that every Tailwind shadow is `rgb(0 0 0 / 0.1)` and a tenth of
      black on `#0f1115` draws nothing. Sound reasoning, dead premise — on the
      light ground this is heading for, `shadow-lg` is right and the 0.5 value
      was the smudge ticket `03` said it was. The change was made and reverted.

The palette item is the one with teeth: it does not merely need tidying, it
invalidates evidence. Do it before anyone cites a colour decision from this sheet.

## What is left, and who owns it

Two items, both the human's:

1. **Delete `parent-space-mark` or say why it stays.** The ticket instructed
   asking, and the sheet's header disagrees with what was built.
2. **The theme change.** `:root` is dark, there is no ticket for making it
   light anywhere in `.scratch/`, and both this ticket's palette item and any
   colour judgement in `07` wait on it.
