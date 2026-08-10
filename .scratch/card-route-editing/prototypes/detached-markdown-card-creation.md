# Detached Markdown Card creation — interaction storyboard

Status: accepted prototype

## Frame 1 — create immediately

```text
┌ Hyper ──────────────────────────────────────────────────────────────┐
│ [Graph] [Layouts] [Route]                         [＋ Add Card]      │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│          ┌───────────┐                                             │
│          │ Card 1    │                                             │
│          └───────────┘                                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

Choosing **Add Card** immediately creates a blank detached Markdown Card at the
visible graph viewport's center. There is no placement mode, ghost, second
click, or creation draft.

The same action is available through `C` while the graph has focus. It does
nothing while the author is typing, using another control, opening a Card, or
presenting; browser shortcuts remain untouched.

## Frame 2 — avoid an exact stack

```text
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│                       ┌───────────┐                                │
│                       │ Card 1    │                                │
│                       └───────────┘                                │
│                           ┏━━━━━━━━━━━┓                             │
│                           ┃ Card 2    ┃  selected                  │
│                           ┗━━━━━━━━━━━┛                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

If the center anchor is already occupied, Hyper takes small diagonal steps
until it finds an unused anchor. The result is a visible stack, not general
collision avoidance: existing Cards never move and partial overlap is
deliberate.

## Frame 3 — name in place

```text
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│          ┌───────────┐                    ┏━━━━━━━━━━━━━┓            │
│          │ Card 1    │                    ┃ [Card 2___] ┃ selected  │
│          └───────────┘                    ┗━━━━━━━━━━━━━┛            │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

Add Card completes one atomic Edit: convert the Algorithmic View to a Layout if
needed, create the blank Markdown Card, write only its position into the
current Layout, select it, and persist the complete Space snapshot. Other
Layouts remain sparse and unchanged. On conversion, that same Edit also creates
the new Layout's required initial empty Active Graph. Add Card creates no Edge
and adds no further Graph to an existing Layout. It does not move the camera.

The new Card immediately enters the existing inline title editor with its
neutral `Card N` title selected. `Enter` or valid blur completes the rename;
`Escape` cancels the rename but keeps the already-created Card. The existing
Card-open control and `Enter`/`Space` on the selected Card open its Markdown
editor; creation does not open content automatically. Keyboard activation of
the toolbar action or `C` moves focus into this title input.

## Existing gesture retained

Option/Alt plus connection empty-drop remains create-and-connect. It does not
enter title editing and still creates the Card, its position, and its Edge
atomically, leaving the Card selected so Route drawing can continue.

## Interaction boundary

- **At Add Card:** one durable Card-and-placement Edit.
- **After creation:** ordinary title and content authoring operations; no
  creation draft spans multiple persistence commits.
