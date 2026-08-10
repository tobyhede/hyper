# Alias creation and retargeting — interaction storyboard

Status: accepted prototype

## Frame 1 — Add Alias opens the Card editor

```text
┌ Hyper ──────────────────────────────────────────────────────────────┐
│ [Graph] [Layouts] [Route]                    [＋ Add Card ▾]         │
├───────────────────────────────────────────────┬────────────────────┤
│                                               │ New Alias          │
│                                               │                    │
│               graph remains unchanged         │ Title              │
│                                               │ [                 ]│
│                                               │                    │
│                                               │ Target             │
│                                               │ [Search…          ]│
│                                               │                    │
│                                               │ Select Alias Target│
└───────────────────────────────────────────────┴────────────────────┘
```

**Add Alias** is an explicit Card-kind creation action. It opens the normal
Card editor in an Alias creation state with **Target** focused. The title starts
empty. Nothing has been added to the Space, converted into a Layout or
persisted yet; cancelling at this point creates nothing.

The creation state is not a Markdown Card that will later change kind. Card
kind is visible in the editor and is fixed for the Card's lifetime.

## Frame 2 — select a valid target

```text
┌ Card editor ───────────────────────────────┐
│ New Alias                                 │
│                                           │
│ Title  [                                 ]│
│ Target [intro____________________________]│
│        ┌─────────────────────────────────┐│
│        │ [Markdown icon] Introduction    ││
│        │ [Space icon]    Intro examples  ││
│        └─────────────────────────────────┘│
└───────────────────────────────────────────┘
```

The Target picker searches non-Alias Cards in the current Space. Every result
shows its persistent Card-kind icon and title. Markdown Cards and Space Cards
are valid; Alias Cards never appear. When there are no eligible Cards, the
creation state explains that an Alias requires a non-Alias Card in this Space.

Selecting a target completes one atomic Edit: convert the Algorithmic View to
a Layout if needed, create the Alias, place it using the same visible
viewport-center stack as Add Card, select it, and persist the complete Space
snapshot. On conversion, that Edit also creates the new Layout's required
initial empty Active Graph. Alias creation creates no Edge and adds no further
Graph to an existing Layout.

If the title is still empty when the target is chosen, it takes the target's
current title as a convenient initial value. Text the author already entered is
never overwritten. The editor remains open on the now-authored Alias.

## Frame 3 — make Card kind and target apparent on the Front

```text
              ┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓
              ┃ [Alias icon] Recap       ┃  Alias title
              ┃              Introduction┃  target title
              ┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

Card kind is apparent through a persistent icon on the Card Front; it is not a
hover-only affordance. Alias and Space Cards have distinct icons, while
Markdown remains the visual default. Icons have accessible labels and
tooltips.

An Alias Front shows the target Card's title beneath its own title. The target
title is read-only. Double-clicking the primary title remains the quick inline
rename interaction; opening the Alias continues to open its target's content.

## Frame 4 — retarget in the same editor

```text
┌ Card editor ───────────────────────────────┐
│ [Alias icon] Alias                        │
│                                           │
│ Title  [Recap                           ]│
│ Target [Introduction                 ▾  ]│
└───────────────────────────────────────────┘
```

The ordinary Card editor is the one canonical place to change an Alias target.
The field remains **Target**, its placeholder remains **Search**, and choosing
another non-Alias Card is simply editing that field rather than entering a
special retargeting mode.

Changing Target is one atomic Edit. The Alias keeps its id, independent title,
positions, selection and incident Route Edges. Retargeting never copies the new
target's title. Like every Edit made through an Algorithmic View, retargeting
converts the rendered Cards and positions into a Layout before applying the
Card edit; the Target change itself adds no placement or Edge.

## Frame 5 — direct creation shortcuts

```text
  ┌──────────────┐       modifier-drag       ┏━━━━━━━━━━━━━━━━┓
  │ Introduction│  ───────────────────────▶  ┃ [Alias] Intro  ┃
  └──────────────┘                            ┗━━━━━━━━━━━━━━━━┛

  ┌──────────────┐       modifier-connect    ┏━━━━━━━━━━━━━━━━┓
  │ Introduction│  ───────────────────────▶  ┃ [Alias] Intro  ┃
  └──────────────┘          active Route Edge┗━━━━━━━━━━━━━━━━┛
```

Modifier-dragging a Card body previews an Alias ghost while leaving the source
Card in place. Drop creates and selects the Alias at that position. A Markdown
or Space source becomes the target directly; an Alias source resolves once to
its non-Alias target, so the new Alias never creates a chain.

Using the Alias modifier while dropping a connection on empty canvas creates
the same Alias and the active Route Edge atomically. It follows the existing
create-and-connect continuation: the new Alias is selected and ready for more
Route drawing without forcing title editing.

These gestures define behaviour, not their exact modifier. The keyboard
contract ticket assigns the modifier alongside every other authoring shortcut.
Copying a Card is a separate operation with different identity and content
semantics.

## Interaction boundary

- **Add Alias before Target:** an editor-local creation state, not a domain
  Card.
- **Select Target:** one durable Alias-and-placement Edit.
- **Change Target:** one durable Edit of the existing Alias only.
- **Modifier body drop:** one durable Alias-and-placement Edit.
- **Modifier connection drop:** one durable Alias, placement and Edge Edit.
