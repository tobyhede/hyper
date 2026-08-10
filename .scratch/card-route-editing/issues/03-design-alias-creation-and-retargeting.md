# Design Alias creation and retargeting

Type: prototype
Status: resolved
Blocked by: 02

## Question

How should an author create a placed Alias, choose its non-Alias Card target,
give the occurrence its own title, and later retarget it while keeping
the occurrence-versus-content distinction explicit and preserving all Alias
reference invariants?

## Prototype

[Alias creation and retargeting — interaction storyboard](../prototypes/alias-creation-and-retargeting.md)

## Answer

Add Alias is an explicit Card-kind creation action. It opens the normal Card
editor in an Alias creation state with an empty Title and a focused **Target**
picker whose placeholder is **Search** and whose prompt is **Select Alias
Target**. The picker lists only non-Alias Cards in the current Space and shows
each result's persistent kind icon and title. Any non-Alias kind is valid,
including Markdown and Space Cards. Alias Cards are excluded to preserve the
single-hop invariant.

The creation state is editor-local rather than an invalid persisted Card.
Cancelling before target selection creates nothing. Selecting a target
completes one atomic Edit: convert an Algorithmic View if needed, create the
Alias, place it through the same viewport-center stacking rule as Add Card,
select it, and persist the Space. Conversion creates the new Layout's required
initial empty Active Graph in that Edit; Alias creation creates no Edge and
adds no further Graph to an existing Layout. If Title is still empty it takes
the target's current title; author-entered text is never overwritten.

Card kind is always apparent on the Card Front through a persistent,
accessible icon. Alias and Space Cards have distinct icons and Markdown is the
visual default. An Alias Front shows its own title plus its target Card's title
as read-only secondary information. Double-clicking the primary title remains
inline rename, while opening the Alias continues to open its target's content.

The same Card editor is the canonical retargeting surface. Its ordinary
**Target** field uses the same picker; there is no retargeting-specific wording
or mode. Changing Target atomically updates only the pointer. The Alias keeps
its id, independent title, positions, selection and incident Route Edges, and
its title never changes automatically during retargeting. ADRs 0025 and 0031's
uniform crossing still applies: completing the Edit through an Algorithmic View
converts its rendered Cards and positions before replacing the Target.

Modifier-dragging any Card body is the direct spatial accelerator. It previews
an Alias ghost, leaves the source in place, then creates and selects the Alias
at the drop position. A non-Alias source becomes the target; an Alias source
resolves once to its underlying non-Alias target. Using the Alias modifier on
a connection empty-drop creates that same Alias together with the active Route
Edge atomically and leaves it selected for continued Route drawing without
forcing title editing. Issue `07` assigns the exact modifier. Card copying is
a separate operation and is not implied by Alias creation.
