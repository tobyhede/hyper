# Build the Hyper-owned Markdown source editor

Status: resolved

Blocked by: None.

## What to build

Add CodeMirror 6 through `@uiw/react-codemirror` to `@project/ui` and create the
small `MarkdownSourceEditor` boundary decided by ADR 0063. Before code, run the
required shadcn-first UI search and record why the registry textarea is
insufficient for the decided line numbers, Markdown parsing and editor-local
history.

The public contract is controlled and product-facing:

```ts
interface MarkdownSourceEditorProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly ariaLabel: string;
  readonly className?: string;
}

interface MarkdownSourceEditorHandle {
  focus(): void;
  getContentElement(): HTMLElement | null;
}
```

Use the repository's established ref style and React version when spelling the
actual component. Do not add generic `extensions`, `basicSetup`, `theme` or
`EditorView` escape hatches. `autoFocus` is deliberately absent: `CardPane`
already declines Base UI's generic autofocus so product composition can choose
the first field.

Configure standard Markdown, line numbers, soft wrapping and history. Remove
CodeMirror ownership of every key the surface owns; do not install
`indentWithTab`. Disable
folding, completion, search/lint keymaps and active-line treatment that would
turn the Card into an IDE. Give the content element its supplied accessible name.

Put the restrained theme beside the component, use Hyper tokens and monospace
typography, and make the editor fill and scroll inside a parent-sized region.
Import every CodeMirror/Lezer package used by source code directly from a direct
`@project/ui` dependency. Export the component and its public types from the
curated `@project/ui/MarkdownSourceEditor` subpath. Keep it out of the root
barrel so an application can lazy-load the specialist editor without importing
CodeMirror into its initial bundle.

## Tests

Add `@project/ui` tests for the contract Hyper owns:

- supplied source is present and an edit reports the complete new string;
- an externally changed controlled value appears without remounting;
- whitespace and Markdown punctuation are not normalized;
- the focus handle focuses the editable content and returns that element;
- the content has the supplied accessible name;
- Escape, Tab and the pane's commit shortcut are not consumed by a
  Hyper-installed CodeMirror binding.

Use only the narrow browser API shim CodeMirror actually needs under jsdom. Do
not mock CodeMirror or assert incidental internal DOM beyond the public editable
element needed to prove this contract. Browser-native selection and key travel
belong to Issue 03.

## Acceptance

- [x] `@project/ui` is the only package that imports CodeMirror.
- [x] The wrapper exposes no CodeMirror types or configuration.
- [x] Source editing, controlled updates, accessibility and focus are covered by
      component tests.
- [x] Line numbers, wrapping, history and the restrained Hyper theme are enabled;
      IDE chrome and Tab indentation are absent.
- [x] The component is exported through the public
      `@project/ui/MarkdownSourceEditor` subpath.
- [x] `pnpm verify` passes and its real output is recorded in this ticket.

## Answer

`@project/ui` now owns `MarkdownSourceEditor`, a controlled CodeMirror 6 wrapper
with a string callback, narrow focus handle, standard Markdown, line numbers,
wrapping, local history, restrained token-based treatment and pane-safe keys.
The shadcn registry search found no source-editor primitive, so ADR 0063 records
the canonical specialist-widget deviation. Seven component tests cover the
public value, controlled update, focus, accessibility, read-only and key contract.
The narrow public subpath is the production split point: `OpenCard` remains
mounted to own modality while only a Markdown Card loads the editor chunk.

`pnpm verify` passed: 152 test files, 1,669 tests passed and 8 skipped.

## Review follow-up

Three defects the branch review found in this ticket's work, each fixed with a
regression test:

- **`Mod-Enter` was never withheld.** The filter named `Escape`, `Tab` and
  `Shift-Tab`; `defaultKeymap` binds `Mod-Enter` to `insertBlankLine`, which is
  the key `CardEditorShell` commits on. CodeMirror's keymap calls
  `preventDefault` without `stopPropagation`, so the shortcut inserted a blank
  line *and* still submitted, committing a draft that no longer matched what the
  editor was showing. The withheld set is now `PANE_OWNED_KEYS`, and it is stated
  as what the *surface* owns rather than as a list of keys to skip.
- **The test proving that contract could not fail.** It asserted only that a
  parent `onKeyDown` fired, which happens whether or not CodeMirror consumed the
  key — which is why the `Mod-Enter` collision shipped. It now asserts
  `defaultPrevented === false`, and passing the whole unfiltered `defaultKeymap`
  fails it. `Tab` and `Shift-Tab` left the filter with it: `defaultKeymap` binds
  no Tab at all, so naming them was a guard over nothing, and the appearance of
  protection is what hid the real gap.
- **`readOnly` was a capability with no requirement**, which this spec forbids.
  Its only reference outside the component was its own test. Removed; the
  contract above is updated.

`pnpm verify` output is recorded in Issue 03 alongside the browser suites.
