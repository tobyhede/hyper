# 06 — Retire the prototype scaffolding

Status: ready-for-human
Tags: release/v1
Blocked by: nothing. The theme change landed as `a5a76669` (`feat(theme): sand
is the canvas, and the chrome is neutral over it`), which is what the phantom
"no ticket anywhere in `.scratch/`" blocker was waiting for.

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
- [x] **Resolve the palette fork.** The blocker went first: `a5a76669` made the
      application light (`packages/app/src/tailwind.css:52` is `color-scheme:
      light`, under the block that says sand is the canvas and the chrome is
      neutral grey over it). The item's own condition — "once the app's `:root`
      is light" — is met, and the fork is gone with it.

      The reading this item was rewritten to was the right one: the application
      was not meant to be dark, so the fork was the proposal rather than the
      mistake, and the prototype's colour judgements were made against the theme
      the application has now moved to. Those values live in `tailwind.css`
      once, which is what a scoped fork could never reach — a portalled Popover,
      Menu or Select lands wherever the portal puts it rather than inside
      `.dock-proto`, which is why the fork had to be carried on a
      `.dock-proto__panel` class as well. Both halves are redundant and both are
      deleted; `command-dock.css`'s header records that and cites this ticket.
      **`.dock-proto__panel` survives on a second reason it acquired in the
      meantime** — reaching a portalled surface at all is a problem the fork did
      not create and does not take with it, and one rule still needs it.

      **This bit while it is still true.** A colour fix justified by "the app is
      dark" is wrong for the theme that was built. One already happened: a review
      of ticket `03` called `Popover`'s move from
      `shadow-[0_12px_40px_rgba(0,0,0,0.5)]` to `shadow-lg` a regression, on the
      grounds that every Tailwind shadow is `rgb(0 0 0 / 0.1)` and a tenth of
      black on `#0f1115` draws nothing. Sound reasoning, dead premise — on the
      light ground the application now stands on, `shadow-lg` is right and the
      0.5 value was the smudge ticket `03` said it was. See the Answer below for
      what the tree actually holds.

## Answer

**The change was kept, not reverted, and the prototype sheet was never part of
it.** The sentence above used to end "the change was made and reverted", which
is wrong on the outcome and vague about which surfaces it touched. Both halves
are answered here.

`shadow-lg` is what `Popover` and `Select` carry now, and it arrived with the
theme change rather than against it:

- `packages/ui/src/Popover.tsx:89` carries `shadow-lg`, and the comment at
  `:79-87` records the replacement in full — it was
  `shadow-[0_12px_40px_rgba(0,0,0,0.5)]`, "half the black there is, written in
  numbers no theme can reach", chosen against a dark face and a smudge on a
  light one. It also names the sibling it matches: `DropdownMenuSubContent`,
  the nested Menu popup, rather than the outer one, which takes `shadow-md`
  with a ring.
- `packages/ui/src/Select.tsx:79` carries the same token, and its comment at
  `:72-77` calls it "the last surface still holding the value it replaced".

`git log -S'shadow-lg' -- packages/ui/src/Popover.tsx packages/ui/src/Select.tsx`
answers `a5a76669` and `7a947fcc`, and no revert appears in either file's
history. `a5a76669` is the theme change itself, so the move to the token and the
light ground landed together — which is why the review's premise died at the
same moment its reasoning was answered.

**`command-dock.css` uses neither class.** Its three shadows are explicit
`box-shadow` declarations — `:44`, `:89` (a `color-mix` against `--foreground`)
and `:577` (an inset destructive ring). There is no `shadow-lg` and no arbitrary
Tailwind shadow anywhere in the sheet, so the palette fork this item deleted
never carried a shadow decision and the prototype was never a surface this
change could reach.

## What is left, and who owns it

Nothing. All four items are done and the theme change that blocked the fourth
has merged, so no colour judgement in this ticket or in `07` is waiting on
anything. The `Status:` line is left at `ready-for-human` for the human to
confirm and close rather than being closed on an agent's reading.

## Comments

**Tagged `release/v1`, and the phantom blocker replaced with the commit that
answered it.** ADR 0082 supersedes ADR 0053 and retires the Sidebar as the bound
command surface, so `07` — the promotion this ticket cleans up after — is now V1
work and is sequenced before `v1-release/03`, `05` and `06`. This ticket is
tagged with it because it is `07`'s own cleanup pass and shares its scope.

The `Blocked by:` line named "the theme change, which has no ticket anywhere in
`.scratch/`". That change merged as `a5a76669`, so the blocker was not merely
untracked, it was already discharged — and the palette item it was holding up
was discharged with it, which the sheet's own header at
`packages/app/stories/review/command-dock.css:5-21` records. A blocker written as
an absence is the kind that outlives its reason silently: nothing fails when it
stops being true, so it goes on reading as work.
