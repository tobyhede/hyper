# 03 — Write a Title on more than one line

Status: ready-for-agent
Blocked by: 02

**What to build:** Give `InlineTitleEditor` a multiline capability that the
`card` variant opts into, so an author can add a line to a Card's Title with
`Shift+Enter` and the field grows to fit.

**Why:** The single-line case must stay byte-identical to today, and the other
two variants must not change at all. `InlineTitleEditor` is one component behind
Card, Sidebar and header titles; a multiline behaviour that arrives for all
three because they share a field type is the implementation deciding the model.

- [ ] The capability is a prop the `card` variant sets, not a variant check
      inside the component and not a behaviour all three inherit. `sidebar` and
      `header` keep a genuine single-line `Input` and `Enter`'s meaning there is
      untouched.
- [ ] The multiline control is `@project/ui`'s existing `Textarea`, composed the
      way the single-line control composes `Input`. It is that component's first
      production consumer; `MarkdownSourceEditor` considered and rejected it for
      a need this does not have.
- [ ] `Enter` completes the edit. `Shift+Enter` inserts a line. `Escape`
      cancels. Blur still completes, and a refused draft still stays editable
      with focus returned to it.
- [ ] The field's height follows its content — one line at rest, growing as
      lines are added, shrinking as they are removed — at one uniform text size.
      Per-line preview of the ladder is explicitly out of scope: it needs a
      hand-rolled editing surface, which ADR 0047 and ADR 0050 make a last
      resort.
- [ ] Select-on-entry still selects the whole Title, including its later lines.
- [ ] A draft that normalizes to nothing is refused with the stable code 02
      introduced, worded by application composition (ADR 0057), and the field
      stays open with the draft intact.
- [ ] The ADR 0047 deviation record in the component's doc comment is updated:
      it now owns a multiline edit lifecycle as well as a single-line one, and
      says why `Textarea` alone does not provide it.
