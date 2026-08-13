# Define the keyboard authoring contract

Type: grilling
Status: resolved
Blocked by: 02, 03, 05, 06, 09

## Question

What keyboard navigation, commands, focus movement, labelling, confirmation,
and cancellation contract provides an equivalent path through every new Card,
Alias, Graph, and Edge operation without conflicting with existing selection,
opening, title editing, presentation, or browser behavior?

## Specification

[Keyboard authoring contract](../prototypes/keyboard-authoring-contract.md)

## Answer

Hyper follows React Flow and the selected shadcn primitive's documented
keyboard, focus, selection, dismissal, and accessibility behavior by default.
Every deviation requires an explicit Hyper requirement and a recorded reason.
There is no monolithic hotkey registry: local primitives retain local behavior,
Edge Authoring owns its React Flow translation, Presenting owns traversal, and
App composition owns only the workspace-wide Cards View toggle and topmost
precedence.

`C` is the only unmodified authoring shortcut and applies only while the graph
is focused. `Cmd/Ctrl+B` toggles the Cards View across the workspace when that
View is available. Add Alias, Add Graph, Graph management, Card editing, and Edge
editing remain keyboard-accessible through visible controls. Shortcuts are
shown with those controls and exposed to assistive technology; version 1 adds no
separate keyboard-help surface.

Card focus also selects because Hyper deliberately assigns React Flow's native
`Enter`/`Space` selection keys to opening the Card. React Flow otherwise owns
the canvas Tab order and native focus behavior. Card nodes, their explicit Edit
and Connect controls, and Active Graph Edges are focusable; inactive Graph Edges
are visible but skipped because they are not authorable.

React Flow does not select an Edge on focus, so Hyper bridges Edge focus to the
sole selection. React Flow's Edge Escape can blur to `body`, so Hyper restores
canvas focus when no other control has taken it. These are recorded deviations:
Tab-to-Edge then Delete needs the visible Edge as its command subject, and
`body` is not a Hyper authoring context. Hyper accepts that React Flow pans to
focused Nodes only and adds no Edge focus panning.

Every Layout owns at least one Graph and always resolves one Active Graph.
Unmodified arrows navigate it: Right follows the selected outgoing Edge, Left
retraces transient Traversal history, and Up/Down select a fork branch without
moving. `Shift` plus arrows retains React Flow's native four-unit Card movement.
An Algorithmic View has no Graph, so native one-unit/four-unit movement applies
and the first movement converts while creating the new Layout's initial empty
Active Graph. Focus, selection, visible Edge emphasis, and live announcements
make Graph navigation perceivable.

React Flow does not supply keyboard connection or endpoint-reconnection
gestures. One of the four otherwise equivalent source handles is therefore a
keyboard Tab stop that opens a shadcn Card Combobox. Active Graph Edges enter the
Tab order; selection shows an `EdgeToolbar`, whose normal button opens a minimal
shadcn Popover with From and To fields that reuse that picker. Enter and Space
keep React Flow's native Edge-selection meaning. These paths invoke the same
semantic Connect and Reconnect operations as pointer gestures rather than
simulating spatial dragging.

The Graph manager uses vertical shadcn Tabs. The Cards View uses shadcn Command,
where `Enter` selects the active Card and `Space` remains Search input. Alias and
Graph target selection use the shadcn Combobox composition. The focus
deviations are listed above; the primitives retain their local behavior.

Delete and Backspace follow React Flow selection. Package 7 configures both keys
because React Flow 12.11.2 defaults to Backspace alone. `onBeforeDelete` routes the
sole selected canvas object through semantic authoring before the controlled
projection changes. Card removal uses the accepted two-activation armed state;
Active Graph Edge deletion is immediate; React Flow's normal input protection
leaves text editing unchanged and Hyper toolbars use `.nokey`. Multi-selection
is disabled. Escape cancels exactly one topmost interaction. Successful
commands move focus only when the operation removes the focused element or
establishes the next authoring context. Validation and persistence status never
steal focus, and accepting remote state clears every transient keyboard
interaction before focusing the replacement canvas.

`Shift` is the Alias pointer-creation modifier; it is only an accelerator. The
visible Add Alias action and picker remain the complete keyboard path.
