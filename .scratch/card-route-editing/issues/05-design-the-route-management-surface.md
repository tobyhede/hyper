# Design the Route management surface

Type: prototype
Status: resolved
Blocked by: 01, 04

## Question

What single coherent surface should let an author see Routes, activate one,
begin creating another, rename and recolour it, and deliberately delete it,
while keeping activation as navigation and each completed property or
structural change as an Edit?

## Prototype

[Route management surface — interaction storyboard](../prototypes/route-management-surface.md)

## Answer

The active-Route toolbar trigger opens a two-pane Route-management popover. A
Layout's left pane lists its owned **Routes in this Layout** in stored order.
Activating a row keeps the popover open, immediately updates graph emphasis and
makes that Route the subject of the right pane. It is navigation and submits no
Edit. There is no second selected-Route concept. The graph Route legend remains
a read-only key, and the active Route's Present action remains adjacent to the
trigger rather than moving inside the manager. Space-scoped Algorithmic Views
have no Routes; the borrowed-Route behavior of Route-scoped Views is reopened
in **Design Route-scoped View navigation and authoring**.

The active pane contains Title, a palette-only Colour control, read-only Edge
count and a deliberately visible Delete Route action. Title completes one Edit
on `Enter` or valid blur, restores on `Escape`, and rejects an empty value.
Choosing a different colour swatch completes one immediate Edit; choosing the
stored colour is a no-op. The surface has no Automatic colour choice. A Route
whose optional domain colour is absent still displays its resolved fallback,
but the first author choice stores an explicit colour.

An active empty Route is labelled **Empty route** and remains fully manageable.
Present is disabled with **Add an Edge to present this Route**. Delete Route
enters the confirmation interaction owned by **Design structural deletion
interactions** and is disabled when this is the Layout's only Route. After
confirmed deletion the popover remains open and the first surviving Route in
that Layout becomes active.

Add Route stays in a stable footer and immediately completes one durable Edit:
create and append Layout-owned `Route N`, assign and store the next colour by
rotating through the authoring palette, and activate it. On an Algorithmic View,
conversion creates this requested Route as the new Layout's initial Route rather
than creating an extra predecessor. The manager remains open and
focuses the new Route's selected neutral title; cancelling that rename keeps
the created Route. The Route-less first-connection shortcut also stores its
palette colour, so both authoring paths create equivalent Route properties.
Colour remains optional in the domain and the authoring palette can expand.

Every Layout has an active Route. On an Algorithmic View there is no Layout and
therefore no Route yet; its toolbar trigger reads **No routes**, Present is
disabled, and Add Route converts and creates the initial Route in one Edit. The
manager uses vertical shadcn Tabs with its underlying default keyboard behavior;
Escape first cancels a title draft and then closes the popover. Global shortcuts
remain owned by **Define the keyboard authoring contract**.

Layout Route order remains domain-significant but is not manually editable
here. Creation appends and deletion preserves survivor order. Manual reordering
is separate future work. Each property or structural action crosses
one authoring interface as a complete Edit; the UI does not coordinate partial
domain mutations or persistence steps.
