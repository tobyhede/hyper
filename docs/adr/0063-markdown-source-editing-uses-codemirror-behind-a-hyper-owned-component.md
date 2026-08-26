# Markdown source editing uses CodeMirror behind a Hyper-owned component

Status: accepted
Refines: 0011, 0037
Refined by: 0064, 0067
Related: 0047, 0048, 0050, 0052

An opened Markdown Card continues to author its literal Markdown string, but the
source field uses CodeMirror 6 through a `MarkdownSourceEditor` owned by
`@project/ui`. CodeMirror is the editing engine only: it owns the editable text
rectangle, selection, history, line wrapping, line numbers and Markdown-aware
syntax treatment. `OpenCard` still owns the Interaction draft and completion,
`CardPane` still owns the modal and focus lifecycle, and `CardContent` remains
the one rendered-Markdown boundary.

The wrapper exposes Hyper's small controlled-value and focus contract, not
CodeMirror's `EditorView`, extension list or theme. Hyper owns the keyboard and
visual policy through that wrapper: Escape remains the pane's dismissal key,
Tab remains focus navigation, and the editor introduces no toolbar, preview,
format-on-save behavior or independent panel chrome.

The wrapper is exported from the narrow public
`@project/ui/MarkdownSourceEditor` subpath rather than the package root. The
specialist dependency stays out of the initial bundle through a lazy boundary;
ADR 0067 refines ownership of that boundary now that `MarkdownCardBody` is a
second consumer inside `ui`.

## Why

Hyper authors Markdown source. A source editor preserves the one representation
already established by ADR 0011 and ADR 0037 while adding the editing behavior a
plain textarea lacks. A rich-text editor would introduce a second document model
and a parse/edit/serialize round trip, with normalization and unsupported-syntax
decisions that are not product requirements. Rebuilding CodeMirror's React
lifecycle locally would also spend Hyper code on editor creation, teardown,
controlled updates and Strict Mode behavior rather than on product policy, so
the integration uses the maintained `@uiw/react-codemirror` adapter behind the
Hyper component.

## Consequences

`Card.body` remains a string and saved source is not normalized. Application
callers cannot configure CodeMirror directly; a new editor capability must first
become an explicit Hyper-level capability. CodeMirror and every package imported
directly by the wrapper are direct dependencies of `@project/ui`, and Hyper
maintains browser evidence for the focus, keyboard and modal boundary. Rich-text
editing, preview, formatting commands, autocomplete and Hyper-specific Markdown
dialects are separate future decisions, not latent configuration exposed now.
