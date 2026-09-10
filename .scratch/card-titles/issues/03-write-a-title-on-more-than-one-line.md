# 03 — Write a Title on more than one line

Status: resolved
Blocked by: 02

**What to build:** Give `InlineTitleEditor` a multiline capability that the
`card` variant opts into, so an author can add a line to a Card's Title with
`Shift+Enter` and the field grows to fit.

**Why:** The single-line case must stay byte-identical to today, and the other
two variants must not change at all. `InlineTitleEditor` is one component behind
Card and chrome titles; a multiline behaviour that arrives for all
three because they share a field type is the implementation deciding the model.

- [x] The capability is a prop the `card` variant sets, not a variant check
      inside the component and not a behaviour all three inherit. `sidebar` and
      `header` keep a genuine single-line `Input` and `Enter`'s meaning there is
      untouched.
- [x] The multiline control is `@project/ui`'s existing `Textarea`, composed the
      way the single-line control composes `Input`. It is that component's first
      production consumer; `MarkdownSourceEditor` considered and rejected it for
      a need this does not have.
- [x] `Enter` completes the edit. `Shift+Enter` inserts a line. `Escape`
      cancels. Blur still completes, and a refused draft still stays editable
      with focus returned to it.
- [x] The field's height follows its content — one line at rest, growing as
      lines are added, shrinking as they are removed — at one uniform text size.
      Per-line preview of the ladder is explicitly out of scope: it needs a
      hand-rolled editing surface, which ADR 0047 and ADR 0050 make a last
      resort.
- [x] Select-on-entry still selects the whole Title, including its later lines.
- [x] A draft that normalizes to nothing is refused with the stable code 02
      introduced, worded by application composition (ADR 0057), and the field
      stays open with the draft intact.
- [x] The ADR 0047 deviation record in the component's doc comment is updated:
      it now owns a multiline edit lifecycle as well as a single-line one, and
      says why `Textarea` alone does not provide it.

## Answer

`3ba8995c`.

`InlineTitleEditor` gains `multiline?: boolean`, defaulting to `false`, which `CanvasCard` sets at its one mounting site. It is a prop, not a `variant === 'card'` check: `header` — the Command Dock's name field, and the only other variant since ADR 0082 retired the Sidebar — keeps a real `Input` and `Enter`'s meaning there is untouched, asserted by a test that renders both variants. The control is `@project/ui`'s existing `Textarea` — its first production consumer — composed the way the single-line control composes `Input`, with `rows={1}` plus the primitive's own `field-sizing-content` giving the growing field. The ADR 0047 deviation record now says the component owns two shapes of one edit lifecycle, and why `Textarea` alone does not provide it: a textarea's own `Enter` inserts a line, which is the opposite of completing a Title, so which of the two `Enter` means is the component's to decide.

### The write path had to move with it

This ticket is what makes an interior line reachable, and an interior line is what tells `trim()` and `normalizeTitle` apart. `7463b622` moved `space-authoring.ts`'s `edited-card` arm onto `namedCardTitle` (`normalizeTitle`), left `trimmedNonBlankTitle` for the single-line Layout and Graph titles with a doc comment saying so, and restated the three tests that were the old rule's oracle — including `space-authoring.property.test.ts`, which asserted `proposedTitle.trim()` and shrank to `" !"` the moment the rule changed. `canvas-card-authoring.ts` also stopped re-deriving the blank-Title refusal beside the schema that had just decided it (`3ba8995c`).

### Verification

`pnpm verify` exit 0 (203 files, 2464 passed | 2 skipped), `pnpm e2e` exit 0 (160 passed), `pnpm e2e:ladle` exit 0 (81 passed) — all on the integrated branch, not on this ticket alone.
