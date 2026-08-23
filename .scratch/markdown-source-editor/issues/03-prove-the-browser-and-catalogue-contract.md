# Prove the source editor's browser and catalogue contract

Status: resolved

Blocked by: Issues 01 and 02.

## What to build

Turn the existing Markdown Card story and application E2E surface into the paired
production-parity evidence ADR 0052 requires. The stable story must render the
unchanged production `OpenCard`; do not introduce a story-only editor mode or a
facsimile. Update the design-system inventory only according to the catalogue
checker: a production component reached by the stable story is catalogued, while
any genuine remaining exception carries its real reason.

Exercise the properties that jsdom cannot establish reliably in Chromium:

- Title starts focused and Enter moves focus to the source editor;
- line numbers are visibly present without coupling the test to private class
  names when an accessible or stable wrapper locator will do;
- typing literal Markdown changes the draft;
- editor-local undo and redo restore the source edit;
- Tab moves from the editor to the next pane control and Shift+Tab moves back,
  while Base UI keeps focus within the modal;
- one Escape from a focused editor closes the pane even with a source selection;
- Cancel discards source and Done persists the exact source for rendering by the
  existing `CardContent` boundary;
- closing restores focus according to the existing App contract;
- opening another Card starts with its own source and history.

Keep one meaningful claim paired between the Ladle story and application test,
with the traceability mechanism already used by the catalogue. Do not duplicate
the whole application persistence scenario in Ladle; the story proves the
component and pane behavior through the same production boundary.

Inspect the final computed appearance in both runtimes. The editor must use the
Card's existing shell and tokens, have a perceptible focus state, keep its own
scrolling, and show no folding gutter, autocomplete, active-line fill, toolbar,
preview, minimap or status bar. Because app and catalogue stylesheet order
differs, fix any collision with ownership or specificity rather than import
order.

## Acceptance

- [x] Stable Ladle and application tests are explicitly paired for the editor's
      meaningful behavior.
- [x] Real-browser tests cover focus, Tab/Shift+Tab, one-press Escape, undo/redo,
      Cancel, Done, exact source preservation and Card identity isolation.
- [x] The catalogue renders the production component and inventory checks pass.
- [x] Computed appearance is correct in both application and Ladle runtimes.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` all pass, with their real
      output recorded in this ticket.

## Answer

The existing production `OpenCard` story now has a second paired parity claim
for the source editor. Application and Ladle Chromium evidence cover line
numbers, exact source, undo/redo, Title-to-source focus, Tab and Shift+Tab,
one-press Escape with a selection, Cancel, Done, focus restoration and Card
identity isolation. Existing textarea-shaped assertions now observe the public
contenteditable behavior and the stable Hyper wrapper; no story-only mode or
facsimile was added.

Final verification:

- `pnpm verify`: passed — 152 files, 1,666 tests passed, 8 skipped.
- `pnpm e2e`: passed — 117 tests.
- `pnpm e2e:ladle`: passed — 41 tests.
- `pnpm build`: passed; Vite reported its existing large-chunk advisory.
