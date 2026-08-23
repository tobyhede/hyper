# Replace the opened Card textarea without changing Card authoring

Status: resolved

Blocked by: Issue 01.

## What to build

Replace only the Markdown body `Textarea` in `OpenCard` with
`MarkdownSourceEditor`. Keep `MarkdownDraft.body` as the sole source of truth and
keep the existing completion path, refusal clearing, Title field, Done, Cancel,
Escape and persistence semantics unchanged. Do not add a second editor-body
state or key the editor by its body value.

Preserve the current product focus rule: Title starts focused and unmodified
Enter on Title focuses the Markdown source. Adapt the body ref to the wrapper's
minimal handle. Confirm whether `OpenCard`'s existing Card-id key already resets
the editor on identity replacement; add no second identity mechanism unless a
failing test demonstrates it is needed.

Make the existing Card body region the editor's sizing boundary. Remove only
textarea-specific rules made obsolete by the replacement, preserve the Card
editor's paper treatment, and keep scrolling inside the body region. Any new
production component or style block must satisfy the ADR 0052 inventory rather
than being silently exempted.

Do not broaden `CardPane`'s fallback query to know CodeMirror's internal
`contenteditable`. If the pane needs a new initial-focus capability, make it an
explicit target supplied by its content and keep Base UI responsible for the
trap and Escape. The present Title-first path should not require that expansion.

## Tests

Update `OpenCard` tests to use the accessible textbox contract rather than
native textarea APIs that CodeMirror cannot truthfully implement. Prove:

- existing source seeds the editor verbatim;
- edits update the existing draft and clear the same refusals;
- Done completes with the exact edited source and Cancel completes nothing;
- Title editing and Enter-to-source focus still work;
- external Card identity replacement cannot undo into or display the preceding
  Card's source;
- no source normalization occurs at completion.

Do not weaken existing assertions merely because `.toHaveValue()` is specific
to a native form control; replace them with assertions against the editor's
accessible/public behavior.

## Acceptance

- [x] `OpenCard` contains no Markdown body textarea and imports no CodeMirror
      package.
- [x] Draft, completion, refusal and persistence boundaries are unchanged.
- [x] Title-first focus and Enter-to-source focus work through the wrapper.
- [x] Card identity resets editor-local history without a body-value remount.
- [x] The editor scrolls inside the present pane and preserves its visual shell.
- [x] `pnpm verify` and `pnpm e2e` pass and their real output is recorded here.
- [x] If the existing stable story changes in this ticket, `pnpm e2e:ladle` also
      passes and its real output is recorded here.

## Answer

`OpenCard` now composes the public wrapper and keeps `MarkdownDraft.body` as its
only value. Title-first focus, Enter-to-source, Done, Cancel, refusal clearing,
exact source and the existing Card-id remount boundary remain intact. The Card
editor stylesheet owns the pane-specific paper, gutter, focus and sizing
treatment; CodeMirror scrolls inside the body region.

`pnpm verify` passed. `pnpm e2e` passed all 117 tests. `pnpm e2e:ladle`
passed all 41 tests.
