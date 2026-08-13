# Complete Card and Graph authoring

## Destination

A decision-complete product and interaction specification for the remaining
Card and Graph authoring experience, ready to hand off for implementation
planning. An author can begin with the one-Card new Space and build an entire
presentable Space without importing or editing files externally.

## Notes

- Use the `grilling`, `domain-modeling`, and `codebase-design` skills while
  resolving decisions. Use `prototype` for interaction tickets if that skill is
  available in the resolving session.
- The built baseline is Card title and Markdown-content editing,
  Alias-delegated content editing, Card placement, drag-to-connect,
  initial-Graph minting, and Option/Alt create-and-connect. The built code still
  uses Route until ADR 0041's dedicated implementation rename lands.
- This effort completes the lifecycle for Markdown Cards, Aliases, Graphs, and
  Edges. Creating or editing nested-Space Cards is outside its destination.
- A Layout explicitly owns its positioned Card subset and a non-empty ordered
  Graph collection. Every Graph belongs to one Layout, and every Edge endpoint
  must be a Card in that Layout. A Graph is never reused across Layouts. Creating
  a Layout creates its initial empty Active Graph; Graph management cannot delete
  the last one (ADR 0041 supplies the first-public terminology for ADR 0040's
  historical Route wording).
- Remove from Layout is one atomic Edit: remove that Card's position and all
  incident Edges from the current Layout's Graphs. Delete Card from Space is a
  separate atomic Edit that performs that cascade in every Layout. A Card
  targeted by an Alias cannot be deleted from the Space until those Aliases are
  retargeted or deleted deliberately.
- Graph deletion removes one Layout-owned Graph only and is unavailable for the
  last Graph. Cards, positions, other Graphs and other Layouts remain untouched.
  Removing the last Edge retains the empty Graph; Graphs are deleted only through
  their explicit action.
- Every operation needs a keyboard-accessible path. Touch-specific interaction
  design is outside this effort.
- General undo/redo and recovery are outside this effort. Edits remain semantic
  authoring commands so a future bounded domain history is possible; React
  Flow's render projection is not authoritative history.
- Planning is the map's work. Do not implement the editing features while
  resolving it.
- Hyper is unreleased. Roll the repository forward to one first-public version
  1 format with UUID identities, explicit Layout Card membership,
  Layout-owned Graphs, and possibly empty Graphs; do not design compatibility
  for the repository's disposable version 2 development data.

## Decisions so far

- [Decide what creating a Graph means before its first Edge](issues/01-decide-what-creating-a-route-means-before-its-first-edge.md) — Empty Graphs are durable authored Graphs; Add Graph creates and activates one through the current Layout, while direct first-Edge drawing remains the Graph-less shortcut.
- [Design detached Markdown Card creation](issues/02-design-detached-markdown-card-creation.md) — Add Card immediately creates a detached Markdown Card in a visible center stack, selects it and begins inline naming; `C` is the graph-focused shortcut.
- [Design Alias creation and retargeting](issues/03-design-alias-creation-and-retargeting.md) — Add Alias opens the Card editor to choose any non-Alias target before atomically creating a centered occurrence; persistent kind icons and the target title distinguish its Front, the same Target picker retargets it, and modifier drags provide direct spatial creation.
- [Design the Graph management surface](issues/05-design-the-route-management-surface.md) — A Layout's Active-Graph toolbar opens a persistent two-pane manager for activation and completed Title, Colour, Add and Delete actions; authoring assigns rotating palette colours while the domain still permits absent colour.
- [Design structural deletion interactions](issues/06-design-structural-deletion-interactions.md) — Layouts own explicit Card membership and their Graphs; canvas deletion removes one Card plus incident Layout-local Edges, Space deletion remains separate, and Edge/Graph deletion preserves empty Graphs with concise two-step confirmation only where consequences are broad.
- [Design the Space-card palette and Layout membership](issues/09-design-the-space-card-palette-and-layout-membership.md) — The application-supplied Cards View is currently mounted as a collapsible Sidebar and stages absent Space Cards as the same full Card Fronts; click or keyboard adds at center, while React Flow's native external drag mechanics add one existing Card at a deliberate empty-canvas position through a single domain Edit.
- [Record the Layout-owned Graph architecture](issues/11-record-layout-owned-route-architecture.md) — ADR 0040 makes Layout Card membership and ordered Graph ownership explicit, closes every Graph Edge over that Card set, distinguishes Space- and Graph-scoped View subjects, and replaces omitted-Card fallback rendering with absence from the Layout; ADR 0041 refines its historical terminology.
- [Define the keyboard authoring contract](issues/07-define-the-keyboard-authoring-contract.md) — React Flow and shadcn defaults govern unless an explicit Hyper requirement justifies divergence; sparse shortcuts, Active Graph navigation, semantic Card pickers for connections, contextual deletion, strict Escape precedence, focus continuity, and accessible feedback provide complete keyboard paths.
- [Record the Route-to-Graph domain rename](issues/12-record-route-to-graph-domain-rename.md) — ADR 0041 makes Graph the sole first-public domain noun, fixes the version 1 `layouts[].graphs` vocabulary, retires Walk for Traversal history, and qualifies render/layout-strategy collisions without introducing compatibility aliases.
- [Define the transient authoring and failure contract](issues/13-define-transient-authoring-and-failure-contract.md) — Interaction drafts stay with their local primitive, completed Edits become optimistic authoritative work, persistence trouble never rolls them back, and validated Space replacement invalidates every target-bound transient through one `replacementEpoch` rather than a central registry.
- [Complete the acceptance matrix and implementation handoff](issues/14-complete-acceptance-matrix-and-implementation-handoff.md) — The final handoff reconciles every operation's transition, conversion, cancellation, focus and failure behavior, orders ten independently gated implementation packages, and assigns each invariant to its authoritative proof seam.

## Planning status

Decision-complete. The [implementation handoff](implementation-handoff.md)
contains the authority order, cross-operation acceptance matrices, complete
user journey, implementation sequence and proof obligations. Feature
implementation remains a separate effort.

Three tickets were raised by that implementation rather than by planning, and
all three are now **resolved** by a maintainer decision session. Two ADRs came
out of it and both are worth reading before touching the Card pane:
**[0047](../../docs/adr/0047-a-shadcn-component-is-the-default-and-a-hand-roll-is-a-deviation.md)**
(a shadcn component is the default, and a hand-roll is a deviation) and
**[0048](../../docs/adr/0048-escape-and-commit-are-decided-by-the-surface-not-the-field.md)**
(Escape and commit are decided by the surface, not the field).

- [The Frame 5 Alias modifier gestures are unbuilt and
  unowned](issues/15-frame-5-alias-modifier-gestures-are-unowned.md) —
  **resolved**, split. Body drag is in scope as package **4b**; connection empty-drop
  is out of scope and listed in the handoff with its reason, and the keyboard
  contract's `Shift` assignment is narrowed to the half that is built.
- [The content editor's Escape closes the pane over a dirty
  draft](issues/16-the-content-editors-escape-closes-over-a-dirty-draft.md) —
  **resolved**. Inside a pane, Escape is an alias of Cancel. The keyboard
  contract's two-stage rule is withdrawn: it was never a primitive's behaviour,
  and the pane's labelled Cancel button was already the gesture it duplicated.
  The three in-pane field Escapes go; the Card Front's in-place Escape stays,
  because blur is the commit there.
- [Retargeting an Alias discards the content
  draft](issues/17-retargeting-an-alias-discards-the-content-draft.md) —
  **resolved by deletion, not by an answer.** The Target stops committing on
  selection and pends to `Done` like every other field on the pane, so the
  content editor never remounts under an open draft. All three answers this
  ticket offered guarded a consequence of committing a form field on touch.

Two tickets are open. The first is the work those decisions imply:

- [Rebuild the Card pane on Radix Dialog, with one submit over its
  fields](issues/18-rebuild-the-card-pane-on-radix-dialog-and-one-submit.md) —
  `ready-for-agent`, package **4a**, sequenced before 4b and 5.

The second is a disagreement between a decision and the code that predates it,
surfaced by rebasing package 7 onto 4a:

- [Three pane fields still take their own
  Escape](issues/19-three-pane-fields-still-take-their-own-escape.md) —
  `needs-triage`. ADR 0048 says a pane's fields do not intercept Escape; the
  Alias title, the Alias rename and the Target search each still do, with nine
  tests holding them to the withdrawn rule. Both halves are package 4's, and
  which way it resolves is a decision rather than a fix.

## Out of scope

- Creating or editing nested-Space Cards.
- Converting an existing Card from one kind to another.
- General undo/redo, deletion recovery, collaborative editing, revision
  history, and bulk editing.
- Touch-specific gestures.
- Manual reordering of Layout Graph order; creation appends and
  deletion preserves the relative order of survivors.
- [Decide how the pre-release document shape rolls forward](issues/08-decide-how-explicit-layout-route-lists-migrate.md) — no migration is needed because Hyper is unreleased; existing development data is disposable and the repository rolls forward to one first-public version 1 format.
- [Design Graph-scoped View navigation and authoring](issues/10-design-route-scoped-view-navigation-and-authoring.md) — a future application-supplied View may take a Layout-owned Graph as its subject, but Tree-like Graph View selection, navigation, management, presenting, and conversion behavior are deferred from version 1.
- Implementing the specification produced by this effort.
