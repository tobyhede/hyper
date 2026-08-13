# Transient authoring and failure contract

Status: accepted specification

## State classes

Hyper distinguishes four states rather than treating everything unfinished as
an unsaved Edit.

| State | Owner | Authored Space changed? | Cancel meaning |
| --- | --- | --- | --- |
| Navigation state | Navigation or the local View | No | Return to the prior navigation context |
| Interaction draft | The field, picker, primitive or gesture conducting it | No | Discard the local proposed value |
| Completed Edit | Space Authoring and `SpaceSession.working` | Yes, immediately | Not cancellable; a later semantic Edit may change it |
| Persistence state | SpaceSession | No additional domain change | Retry, Keep local or Accept stored at Space scope |

Navigation state includes selection, opened surfaces, Graph activation,
Traversal history, a branch candidate, Cards View search and focus. It can
shape an interaction without becoming authored data.

An Interaction draft is the smallest local value that lets one unfinished
interaction continue: dirty text plus its stored value, an unconfirmed Card
identity, an in-progress pointer position, or an armed confirmation. It never
contains a Space snapshot, a React Flow node pretending to be domain state, or
a sequence of mutations a caller must coordinate.

## The completion crossing

Every pointer and keyboard path for one semantic operation meets at the same
Space Authoring interface. The interaction supplies only identities and the
completed authored fact it knows—for example `CardId + position`,
`GraphId + title`, or `EdgeId + replacement endpoint`. Space Authoring then:

1. Re-reads the current working Space, current renderer, Active Graph and
   authoritative completed placement.
2. Checks that the referenced owner and entity still exist and that the
   operation is eligible now.
3. Derives the complete next Space in a pure core.
4. Validates it through normal domain intake before any collaborator moves.
5. Installs the working Space, placement and Navigation as one externally
   published optimistic Edit.
6. Lets SpaceSession start or coalesce persistence asynchronously.

The shared semantic result vocabulary is:

- **completed** — one Edit was installed; the result may name the created or
  changed object needed for focus.
- **unchanged** — the completed value equals authored state; no Edit and no
  error.
- **refused** — stale context or domain eligibility prevents the operation; no
  Edit, with an explanation associated with the initiating surface.

An expected refusal never throws. A broken internal invariant may still throw
or be reported through the existing non-throwing observer reporter; hiding it
as a validation sentence would make a programming defect look like an author
mistake. Reentrant completions retain Space Authoring's ordered queue and are
derived from the fully installed preceding state.

## Draft and completion boundaries

| Operation | Interaction draft | Completion point | Cancel outcome |
| --- | --- | --- | --- |
| Add Card | None for creation | Action creates, places and selects the Card | Follow-up title Escape keeps the Card and restores `Card N` |
| Rename Card | Dirty title | Enter or valid blur | Restore stored title |
| Edit Markdown | Dirty title/description/body in the open Card | `Done` on the pane, over every pending field | Discard every pending field and close (ADR 0048) |
| Add Alias | Empty title plus unconfirmed Target | Selecting an eligible Target creates and places the Alias | Close with no Alias and no conversion |
| Retarget Alias | Pending Target on the open pane | `Done` on the pane, with the pane's other fields (ADR 0048) | Discard every pending field and close |
| Add Graph | None for creation | Action appends, colours and activates the Graph | Follow-up title Escape keeps the Graph and restores `Graph N` |
| Rename Graph | Dirty title | Enter or valid blur | Restore stored title |
| Recolour Graph | None | Choosing a different swatch | Choosing current swatch is unchanged |
| Connect | React Flow drag or open target picker | Valid target selection/drop | Restore source Card focus/selection; no conversion |
| Reconnect | Endpoint drag or endpoint picker | Valid non-duplicate endpoint selection/drop | Restore the original Edge |
| Add to Layout | External drag or active Cards View item | Eligible empty-canvas drop or center-add | Card remains absent from that Layout |
| Move Card | React Flow drag frames | Settled position differs from authored position | Restore/project authored position if cancelled |
| Remove from Layout | Armed Card consequence | Second activation | Disarm and keep Card plus Edges |
| Delete Edge | None after focused command | Command or eligible endpoint empty-drop | Cancelled endpoint drag restores Edge |
| Delete Graph | Armed Graph consequence | Second activation | Disarm and keep Graph |
| Delete Card from Space | Armed aggregate consequence | Second activation | Disarm and keep Card everywhere |

Invalid text retains its draft, associated error and focus so the author can
repair it. A stale picker or drop is refused and retains focus when its surface
still exists. Exact duplicate Edges and reconnecting to the existing endpoint
produce no Edit; controls prevent the duplicate where they can know it before
completion and otherwise announce the refusal required by the keyboard
contract.

Add Card and Add Graph deliberately have no creation draft. Their neutral title
is valid authored content, so creation completes immediately and the title
field is an ordinary follow-up Edit. Add Alias is different because an Alias
without an eligible Target is not a valid Card; its picker must finish before
any Space change or Algorithmic View conversion.

## Escape and surface dismissal

Escape continues to belong to exactly one topmost owner, in this order:

1. Cancel an in-progress pointer gesture, picker, or dirty field.
2. Disarm a pending destructive confirmation.
3. Close the Edge editor, Graph manager, Cards View, or Card editor.
4. On the bare canvas, clear selection and Traversal history and focus canvas.
5. During Presenting, exit Presenting.

**Amended by ADR 0048.** This paragraph previously read: "A dirty field consumes
Escape by restoring its stored value without closing its containing surface. A
second Escape may close that surface." That rule is withdrawn, for the reasons
recorded in the ADR and in the keyboard contract's matching amendment.

Escape is decided by the surface. **In a pane**, it is an alias of Cancel:
discard every pending field and close, with no field intercepting it — which is
also why the Cancel outcomes in the table above now read the same way for every
field on that pane. **In place on the canvas**, where blur is the commit, it
reverts the field to its stored value and dismisses the editor.

Dismissal never converts an Algorithmic View merely because a draft was opened
there.

## Persistence outcomes

Completed Edits are optimistic authored state before the backend answers.
Persistence status is global and never becomes an operation-specific modal.

| Persistence outcome | Working Space | Open drafts/focus | Next action |
| --- | --- | --- | --- |
| Pending | Newest local Space remains visible | Unchanged; Authoring remains available | Automatic coalesced commit |
| Settled | Newest local Space remains visible | Unchanged | None |
| Retryable failure | Newest local Space remains visible | Unchanged | Retry commits newest working Space |
| Permanent rejection | Newest local Space remains visible with global explanation | Unchanged | A later valid Edit may attempt the newest snapshot again |
| Conflict | Newest local Space remains visible | Unchanged | Keep local or Accept stored |
| Keep local | Newest local Space remains visible | Unchanged | Commit newest local Space against stored revision |
| Invalid stored replacement | Local Space and conflict remain | Unchanged; refusal stays by action | Repair externally or Keep local |
| Accept stored | Stored Space replaces local Space atomically | All target-bound transients clear; focus moves to canvas | Continue from fresh Navigation |

Later Edits while persistence is pending, failed or conflicted are legal. Retry
and Keep local always operate on the newest complete local Space, including
those later Edits. Escape never means rollback. Before-unload protection stays
active for every non-settled persistence state.

## Replacement invalidation

Space Authoring publishes a monotonic `replacementEpoch` only after a validated
stored Space has atomically replaced session working state, placement and fresh
Navigation. It does not advance for ordinary Edits, renderer selection,
persistence status, Retry or Keep local.

Every target-bound interaction owner observes that epoch directly or is keyed
by it. On change:

- dirty fields and pickers discard their drafts;
- pointer drags and connections cancel;
- armed confirmations disarm;
- Card, Edge and Graph editors/managers close;
- Cards View search and open state reset with the fresh workspace;
- selection, candidate branch and Traversal history clear;
- queued focus restoration to an old element is ignored;
- the canvas receives focus after the replacement projection is ready.

No owner registers itself with Space Authoring. The epoch carries only “the
Space you referenced was replaced,” while each primitive applies its normal
cancellation. A failed attempt to Accept stored advances nothing and clears
nothing.

## Ownership and test seams

- shadcn and React Flow primitives own their local drafts and ordinary
  cancellation behavior.
- The render adapter owns pointer-frame state and reports only completed
  gestures.
- Each application surface adapts its primitive's completed value into one
  semantic Space Authoring operation and owns the resulting local message and
  focus.
- Space Authoring owns eligibility, complete Space derivation, validation,
  optimistic installation, replacement epoch and the persistence controls it
  already exposes.
- SpaceSession owns commit ordering, coalescing, retry and conflict state.
- App composition owns topmost Escape precedence and final canvas focus after
  replacement.

There is no generic Draft union, command bus, hotkey registry, cancellation
callback registry or operation-specific persistence adapter. Contract tests
exercise completion, unchanged/refused outcomes, latest-working retry/keep,
and atomic replacement through the Space Authoring interface. Surface tests
exercise their local draft, Escape and focus behavior. Browser tests remain
responsible for React Flow drag cancellation and real focus transfer.
