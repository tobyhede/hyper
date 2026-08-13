# Keyboard authoring contract

Status: accepted specification

## Governing rule

Hyper starts from the pinned React Flow release's documented interaction model
and from the documented behavior of the chosen shadcn component and its Radix,
Base UI, or cmdk primitive. A feature should fit those expectations. A
customization is permitted only when an explicit Hyper requirement cannot be
expressed by the component's default, and its reason must be recorded.

The justified React Flow deviations are deliberately narrow:

- Card `Enter` and `Space` open the Card, so keyboard focus also selects the
  Card instead of requiring React Flow's separate selection activation.
- While a Layout is selected, unmodified arrows navigate its Active Graph.
- React Flow does not provide keyboard connection authoring or endpoint
  reconnection, so Hyper exposes Card pickers for those operations.

React Flow retains Tab order, focusability, automatic focus panning, selection,
and shifted node movement wherever Hyper has not explicitly replaced them.
Inactive Graph Edges are individually non-focusable because they are visible
context rather than authorable objects.

References:

- [React Flow accessibility](https://reactflow.dev/learn/advanced-use/accessibility)
- [Radix Tabs](https://www.radix-ui.com/primitives/docs/components/tabs)
- [cmdk](https://github.com/pacocoursey/cmdk)

## Command map

| Context | Key | Result |
| --- | --- | --- |
| Graph focused | `C` | Add Card at the visible center stack |
| Workspace | `Cmd/Ctrl+B` | Toggle the Cards View when available |
| Focused Card | `Enter` / `Space` | Open the Card |
| Selected Card | `F2` | Rename inline |
| Focused Card in a Layout | Arrows | Navigate the Active Graph |
| Selected Card in a Layout | `Shift` + arrow | Move by React Flow's native four flow units |
| Selected Card in an Algorithmic View | Arrow | Move by React Flow's native one flow unit and convert |
| Selected Card in an Algorithmic View | `Shift` + arrow | Move by React Flow's native four flow units and convert |
| Focused Card | `Delete` / `Backspace` twice | Remove from Layout |
| Focused active-Graph Edge | `Delete` / `Backspace` | Delete Edge immediately |
| Topmost interaction | `Escape` | Cancel or close that interaction only |
| Presenting | Arrows / `Space` / `Escape` | Retain the existing presentation controls |

`C` is the only unmodified authoring shortcut. Add Alias, Add Graph, Graph
management, Card editing, and Edge editing remain keyboard-accessible through
visible controls and receive no global letter key.

Graph-focused means the React Flow canvas or one of its Cards or Edges has
focus, including after an empty-canvas pointer action explicitly focuses the
renderer. `C` does nothing in the toolbar, Cards View, Graph manager, Card
editor, any text-entry control, or Presenting. Exact command keys ignore key
repeat and composition. Hyper prevents the browser default only when a command
can execute.

`Cmd/Ctrl+B` is the sole workspace-wide command. It works from the graph,
toolbar, Graph manager, and Cards View. Opening focuses Cards View Search;
closing restores the element focused before opening when it still exists, then
falls back to the Cards trigger. It does nothing while Presenting or while a
Card editor temporarily hides the View.

## Focus, selection, and Tab

Keyboard focus on a Card makes it the sole selected Card. This is the minimum
compensation for assigning React Flow's native `Enter`/`Space` selection keys
to Hyper's primary Card-opening operation. Focus entering the Card's Edit or
Connect control retains that selection. Pointer focus and selection otherwise
remain React Flow behavior. Bulk keyboard authoring is outside version 1.

React Flow owns the canvas Tab order. `Tab` and `Shift+Tab` pass through Card
nodes, their explicit Edit and Connect controls, and active-Graph Edges.
Inactive Graph Edges are skipped. The order is stable render/Space order, not
pretend Graph traversal. Tab leaves the graph normally after the last item; the
canvas is not a focus trap. Focusing an Edge selects it and clears Card
selection.

## Graph navigation and movement

Every Layout owns one or more Graphs and always resolves one Active Graph.
Creating a Layout creates its initial empty Active Graph in the same Edit. An
Algorithmic View has neither Layout nor Graph until conversion.

With a Layout selected, unmodified arrows perform Graph navigation:

- `Right` follows the selected outgoing Edge.
- `Left` retraces Traversal history; it never guesses among incoming Edges.
- `Up` and `Down` choose among outgoing branches without moving.
- Focus, Card selection, and the Active Card move together on completed
  traversal.

The focused Card establishes a fresh Graph-navigation origin. Tabbing or
clicking to another Card clears prior Traversal history and begins there. If
that Card is outside the Active Graph, the first unmodified arrow focuses the
Graph's defined start Card without also advancing. Changing Graph, Layout, or
View clears Traversal history without unexpectedly moving focus. Starting
Presenting always creates its own fresh Traversal history at the Graph start;
it never inherits working navigation.

`Shift` plus an arrow retains React Flow's native four-unit selected-Card
movement. With an Algorithmic View selected there is no Graph navigation, so
React Flow's native one-unit Arrow and four-unit shifted movement both apply;
the first completed movement performs the normal conversion and creates the
new Layout's initial empty Active Graph.

The Active Card uses normal focus and selected styling. At a fork the candidate
Edge is visibly emphasized. A live region announces `Branch 2 of 3:
Deployment`, the title reached after Right or Left, `End of Graph`, or `Graph
has no Edges` as appropriate. An ineffective repeated key does not continuously
repeat an unchanged announcement.

## Connections and Edges

Pointer authoring retains four spatial source handles. Handle side is not
authored, so only one source handle is a keyboard Tab stop, named `Connect from
<Card title>`; the other three remain pointer-only.

Activating that control opens a shadcn Combobox labelled **Select Graph
Target**. It lists every Card in the Layout, including the source for a legal
self-Edge. An exact duplicate directed pair is disabled. Selecting a Card
completes the same semantic Connect operation as pointer drawing and focuses
and selects the target Card so another connection can continue naturally.
Escape cancels and restores the source Card. On an Algorithmic View, the same
operation converts, creates the initial Graph, and adds the Edge atomically.

Only the Active Graph's Edges enter the Tab order. `Enter` or `Space` on one
opens a minimal shadcn Popover for Edge editing. Its **From** and **To** fields
reuse the same Layout-Card Combobox; choosing the existing endpoint is a no-op
and a duplicate result is disabled. `Delete` or `Backspace` deletes the focused
Edge immediately. Escape uses Popover's normal dismissal and restores Edge
focus.

React Flow owns pointer endpoint dragging. Keyboard editing uses semantic Card
selection rather than attempting to simulate pointer geometry.

## shadcn authoring surfaces

The two-pane Graph manager uses vertical shadcn Tabs. Its underlying default
owns arrow, Home/End, looping, activation-following-focus, and Tab behavior.
Add Graph and Delete Graph are ordinary buttons outside the tab list. Delete
Graph is disabled for the Layout's last Graph. The only custom focus actions
are placing focus in a newly created Graph title and moving focus to the first
surviving Active Graph after deletion.

The Cards View uses shadcn Command. Search, active-result movement, selection,
and focus follow Command defaults. Each full Card Front is a Command item;
`Enter` performs Add to Layout while `Space` remains Search input. The Alias
target and Graph-target pickers use shadcn Combobox composition rather than a
second custom picker model.

Pointer-only accelerators do not define keyboard access. `Shift` is the Alias
creation modifier for **Card-body drag**. The Add Alias control and target
picker are the equivalent keyboard path. Option/Alt connection empty-drop
retains connected Markdown Card creation.

**Narrowed by issue `15`.** This previously assigned `Shift` to "both Card-body
drag and connection empty-drop". The connection empty-drop half is out of
first-public scope — it is an accelerator over a matrix row that already has a
working pointer and keyboard path, and it would require a sixteenth authoring
completion, reopening package 3's closed interface. `Shift` therefore specifies
one gesture, which package 4b builds, rather than one built and one that nothing
reads.

## Deletion and Escape

Deletion is scoped to the focused selected canvas object. A pointer-selected
object with focus elsewhere is not deleted, and native text/control deletion
is never intercepted.

On a focused Card, the first `Delete` or `Backspace` arms Remove from Layout,
visually makes the state bold and red, and announces its concise consequence.
A second Delete or Backspace completes it. Changing focus, target, or selection
disarms it. Multiple selection does nothing and announces `Bulk removal is not
available`. A focused active-Graph Edge deletes immediately because its
consequence is narrow. Delete Card from Space and Delete Graph remain their
visible two-activation buttons; the latter is unavailable for the last Graph.

Escape is consumed by exactly one topmost owner:

1. Cancel an in-progress connection, drag, picker, or field draft.
2. Disarm a pending two-step deletion.
3. Close the open Edge Popover, Graph manager, Cards View, or Card editor.
4. On the bare graph, clear selection and Traversal history and focus canvas.
5. During Presenting, exit Presenting.

**Amended by ADR 0048.** This paragraph previously read: "A field draft consumes
the first Escape without closing its containing surface; a second Escape may
then close that surface." That rule is withdrawn. It was never a primitive's
behavior — no Radix or shadcn component and no platform behavior reverts a text
input on Escape, while `Dialog.Content` closes — and inside a pane it was a
second, unlabelled copy of the **Cancel** button already on screen.

Escape is now decided by the surface, not by the field:

- **In a pane** (the Card editor, the Alias creation state), Escape is an alias
  of Cancel: it discards every pending field and closes. Fields do not intercept
  it. Ordering entries 2 through 5 above are unaffected.
- **In place on the canvas** (the Card Front's title editor), where blur is the
  commit, Escape reverts the field to its stored value and dismisses the editor
  — the only way out that does not author.

Every surface has exactly one non-committing exit; which mechanism supplies it
follows from what that surface's commit trigger is. Component primitives retain
their normal Escape behavior, which is now the default rather than a tolerance.

## Focus after completion

Focus follows the authored object:

- Add Card → title input; complete/cancel rename → new Card.
- Add Alias → created Alias in its open editor; close → Alias Card.
- Add Graph → new Graph title; complete/cancel → Graph tab.
- Connect → target Card.
- Reconnect → edited Edge.
- Add to Layout → added canvas Card.
- Remove from Layout → matching Card in the open Cards View when visible;
  otherwise canvas.
- Delete Edge → its source Card.
- Delete Graph → first surviving Active Graph.
- Delete Card from Space → canvas.

Pointer placement selects without forcing keyboard focus. No successful or
cancelled interaction may drop focus onto `body`.

## Labels, discovery, and failure

There is no separate keyboard-help surface in version 1. Visible actions show
shortcuts using their normal shadcn tooltip or menu treatment and expose
matching `aria-keyshortcuts`. React Flow's shared node instructions describe
Hyper's opening, Graph-navigation, shifted-movement, and cancellation behavior.
Focusable Edges and Connect controls receive object-specific names. Contextual
Delete consequences are announced when armed rather than repeated on every
Card.

Invalid or duplicate actions produce no Edit, retain focus on the invoking
control, and announce an associated error. Pending persistence does not lock
the keyboard. Retryable failure and conflict use the existing global status
without stealing focus; local optimistic authoring remains available. Retry
retains focus. Accept remote cancels every draft, picker, armed deletion, and
Traversal history, installs the replacement Space, and focuses canvas. No
operation-specific rollback or modal error is added.

## Ownership seams

There is no monolithic hotkey registry or new hotkey dependency.

- shadcn primitives own their local keyboard behavior.
- React Flow owns native canvas behavior.
- The graph adapter owns only the justified Graph deviations.
- Presenting owns its traversal keys.
- App composition owns `Cmd/Ctrl+B` and topmost-surface precedence.
- Semantic authoring operations own complete validated Space transitions.

Keyboard events never carry a snapshot or coordinate partial domain mutations.
Every keyboard and pointer path meets at the same authoring interface before
persistence.
