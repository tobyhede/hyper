# Markdown source editor

Status: resolved

ADR 0063 replaces the opened Markdown Card's native textarea with CodeMirror 6
behind a Hyper-owned `@project/ui/MarkdownSourceEditor`. The authored value stays
the literal `Card.body` string. This effort changes one editing control; it does
not change the Card model, Space Authoring, persistence, the Done/Cancel
lifecycle, or `CardContent`'s `marked` and DOMPurify rendering boundary.

The branch includes `dda7e72` as an explicit prerequisite: it moves the already
accepted Card-editor treatment into its owning stylesheet before the specialist
editor adds its own colocated treatment. That design-system relocation is not a
CodeMirror requirement and remains a separable commit for review or cherry-pick.

## Product result

The opened Card keeps its present paper panel, rail, Title field and footer. The
body rectangle becomes a restrained Markdown source editor with line numbers,
soft wrapping, ordinary selection and editor-local undo/redo. It uses Hyper's
tokens and monospace typography and draws no second border, toolbar, minimap,
folding gutter, completion UI, status bar, active-line fill or preview.

The saved bytes are the bytes the author supplied. Syntax awareness may style
source but must not normalize, format or serialize it.

## Ownership boundaries

- `MarkdownSourceEditor` owns CodeMirror construction, teardown, controlled
  value synchronization, Markdown language support, editor-local history, its
  minimal theme and the content element needed for focus.
- `OpenCard` owns the Markdown Interaction draft, Title-to-body focus handoff,
  refusal clearing, Done and Cancel.
- `CardPane` and Base UI own modality, focus containment and Escape dismissal.
  The pane must target the editor deliberately rather than grow a generic
  knowledge of CodeMirror's DOM.
- `CardContent` alone owns rendered Markdown and sanitization.

No ordinary application caller receives an `EditorView`, `Extension`, basic
setup object or theme prop. New capabilities cross the wrapper as product-level
props only when a requirement exists.

## Keyboard and focus contract

- Escape from the editor closes the pane and discards the whole draft in one
  press, including when source is selected.
- The pane's commit shortcut reaches the pane having changed nothing. CodeMirror
  binds `Mod-Enter` to `insertBlankLine` by default and consumes it without
  stopping propagation, so leaving it installed edits the document underneath the
  commit it triggers.
- Tab and Shift+Tab leave the editor and participate in Base UI's focus trap;
  `indentWithTab` is not installed.
- Undo and redo affect the current opened Card's source draft only.
- The existing Title-first opening policy remains. Enter from Title moves focus
  to the source editor. If the product later chooses body-first focus, it does so
  through the pane's explicit initial-focus contract rather than a DOM selector.
- Replacing the opened Card identity cannot carry editor history, selection or
  cursor state into the next Card. The existing `OpenCard` Card-id boundary may
  already provide this; prove it before adding another key.
- The content element has the accessible name `Markdown source`, focus stays in
  the pane, and App's existing post-close focus restoration remains intact.

## Dependencies and styling

The implementation starts with the shadcn-first UI workflow required by ADR
0047 and searches `@project/ui` and the registry before recording CodeMirror as
the justified source-editor deviation: the registry has text areas but no
Markdown source-editing primitive with this behavior.

`@uiw/react-codemirror` and every CodeMirror/Lezer package imported by authored
code are direct `@project/ui` dependencies. Do not install a third-party visual
theme or a Markdown dialect extension without a present Hyper syntax that needs
it. Resolve compatible current versions together and let the lockfile record the
exact set.

The component's styles live beside it in `packages/ui`, use existing tokens, and
must not depend on source order against `packages/app/src/styles.css`; the Ladle
and application import orders differ. App-owned layout rules may size the editor
region and set the custom properties the component's own theme reads, but no
stylesheet may name a `.cm-*` class: those are CodeMirror's, they are renamed by
CodeMirror, and a rule that stops matching one fails by silently reverting. A new
hand-rolled app stylesheet block must be recorded in the design system inventory
with its reason; a block colocated with its component owes no entry but is still
held to the dead-rule check.

## Non-goals

No rich-text or WYSIWYG mode, preview or split view, formatting toolbar,
autocomplete, AI completion, search UI, minimap, folding UI, lint UI, diagnostics,
status bar, Vim/Emacs mode, automatic formatting, custom Markdown AST, renderer
replacement or application-wide undo is part of this effort.

## Delivery order

1. Issue 01 adds the isolated `@project/ui` wrapper and its contract tests.
2. Issue 02 replaces only `OpenCard`'s Markdown textarea and proves the app-level
   draft, focus and identity behavior.
3. Issue 03 supplies production-parity browser evidence, catalogue accounting
   and the full verification record.
