# Route management surface — interaction storyboard

Status: accepted prototype

## Frame 1 — one toolbar Route manager

```text
┌ Hyper toolbar ─────────────────────────────────────────────────────┐
│ [Views] [Layouts]  [● Introduction ▾][Present]                    │
│                     ┌───────────────────────────────────────────┐  │
│                     │ Routes in this Layout                    │  │
│                     │                                           │  │
│                     │ ● Introduction  ✓ │ Title                │  │
│                     │ ● Deep dive       │ [Introduction____]   │  │
│                     │ ● Questions       │                      │  │
│                     │                   │ Colour               │  │
│                     │                   │ [●][●][●][●][●][●]  │  │
│                     │                   │                      │  │
│                     │                   │ 4 edges              │  │
│                     │                   │                      │  │
│                     │                   │ [Delete Route]       │  │
│                     ├───────────────────┴──────────────────────┤  │
│                     │ ＋ Add Route                              │  │
│                     └───────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

The active-Route toolbar trigger opens the single Route-management popover. A
Layout lists its owned **Routes in this Layout** in stored order. A Space-scoped
Algorithmic View has no Routes; Route-scoped View behavior belongs to **Design
Route-scoped View navigation and authoring**. The graph's Route legend remains
a read-only visual key rather than a second activation or management surface.

The popover has no second selected-Route concept. Its left pane activates a
Route; its right pane manages that active Route. Clicking or keyboarding to a
Route updates graph emphasis and the right pane immediately but keeps the
popover open. Activation is navigation and submits no Edit.

The adjacent **Present** control remains outside the popover so presenting the
active Route stays one click away.

## Frame 2 — complete property Edits

```text
┌ Active Route ─────────────────────────────┐
│ Title                                    │
│ [Deep dive______________________________]│
│                                          │
│ Colour                                   │
│ [● blue] [● amber] [● green] [● pink]   │
│ [● purple] [● red]                       │
│                                          │
│ 7 edges                                  │
│                                          │
│                         [Delete Route]   │
└──────────────────────────────────────────┘
```

Title editing follows the existing completed-title contract. Typing is local;
`Enter` or valid blur completes one Edit, `Escape` restores the previous title,
and an empty title reports an error without persistence.

Colour is a palette choice, not an automatic-versus-manual mode. Choosing a
swatch completes one Edit immediately; choosing the already stored colour is a
no-op. The domain still permits an absent colour for imported or externally
constructed Routes. Such a Route displays its resolved fallback colour in the
manager, but the authoring surface offers no **Automatic** choice; the first
swatch the author chooses stores an explicit colour.

The active pane shows **Empty route**, **1 edge**, or **N edges** as read-only
structure. An empty Route remains fully manageable, but the adjacent Present
button is disabled with **Add an Edge to present this Route**.

**Delete Route** is deliberately visible and separated at the bottom of the
active pane rather than hidden in an overflow menu. It invokes the confirmation
interaction owned by the structural-deletion ticket and is disabled when this
is the Layout's only Route. After confirmed deletion, the manager stays open and
the first surviving Route becomes active.

## Frame 3 — Add Route completes before naming

```text
┌ Routes in this Layout ───────────────────────────┐
│ ● Introduction                                  │
│ ● Deep dive                                     │
│ ● Route 3              ✓ │ Title [Route 3____] │
├──────────────────────────┴──────────────────────┤
│ ＋ Add Route                                    │
└─────────────────────────────────────────────────┘
```

**Add Route** immediately completes the durable Edit decided by the empty-Route
design: create and append Layout-owned `Route N`, assign and store the next
palette colour, and activate it. From an Algorithmic View that same Edit creates
the Layout and uses the requested Route as its initial Route rather than adding
an extra predecessor. The popover remains open and focuses the new Route's Title
with its neutral title selected. Cancelling this rename keeps the already-created
Route.

Authoring rotates through the palette by the new Route's appended Layout-order
position. The palette is an extensible authoring constant rather than a domain
constraint. The Route-less first-connection shortcut assigns and stores colour
through the same rule so authoring does not produce different Route properties
according to the creation gesture. `Route.color` remains optional in the
domain.

Add Route is still literal and repeatable: an already-empty active Route does
not turn the action into a no-op or redirect it to drawing an Edge.

## Frame 4 — Algorithmic View before conversion

```text
┌ Hyper toolbar ───────────────────────────────────────────────┐
│ [Views] [Layouts]  [No routes ▾][Present — disabled]        │
│                     ┌──────────────────────────────────────┐ │
│                     │ Routes in this Layout                │ │
│                     │                                      │ │
│                     │ No routes                            │ │
│                     │ Add a Route to begin another path    │ │
│                     │ through these Cards.                 │ │
│                     ├──────────────────────────────────────┤ │
│                     │ ＋ Add Route                          │ │
│                     └──────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Every Layout has an active Route. A Space-scoped Algorithmic View has no Layout
and therefore no Routes; it uses **No routes**, not **None**, in the trigger and
offers Add Route in the same stable location. Add Route converts it and creates
the new Layout's initial Route in one Edit. Route-scoped View management remains
deliberately unspecified here.

## Keyboard contract inside the surface

- The two-pane manager uses vertical shadcn Tabs and inherits its underlying
  keyboard and focus behavior.
- Opening the popover places focus on the active Route tab.
- Delete Route is disabled for the Layout's only Route.
- `Escape` in a dirty Title field restores its prior value; a subsequent
  `Escape` closes the popover.
- The global shortcuts for opening Route management or adding a Route belong
  to the keyboard-authoring-contract ticket.

## Edit and navigation boundary

- Opening or closing the manager and activating a Route are navigation, not
  Edits.
- Completing Title, choosing Colour, adding a Route and confirmed deletion are
  separate completed Edits.
- The authoring module owns each whole structural transition; the popover does
  not hand callers a multi-step mutation plan or assemble persistence
  snapshots.
- Manual Route reordering is not part of this surface. Creation appends and
  deletion preserves the relative order of survivors.
