# Decide what creating a Route means before its first Edge

Type: grilling
Status: resolved
Blocked by: none

## Question

A Route is its non-empty set of Edges, so the persisted domain cannot contain
an empty Route. When an author explicitly asks to create and configure another
Route before drawing its first Edge, what exists, what can be edited, and what
event completes the first durable Edit without introducing a second meaning of
Route?

## Answer

An empty Route is a Route, not a draft or a second UI-only entity. A Layout
contains one or more Routes, and every Route it owns has durable identity, title,
optional authored colour and the complete management lifecycle even when its
Edge set is empty. An empty Route can be activated, renamed, recoloured and
deleted. It cannot be presented until it has an Edge.

Route authoring happens through a Layout. **Add Route** is itself the completed
Edit: from an Algorithmic View it first copies the visible placement into a new
Layout under ADR 0025, then creates a new empty Route, gives it the next neutral
`Route N` title, makes it owned by that Layout, records it as the
Layout's authored `activeRoute`, and activates it in the current session. From
an existing Layout it updates that Layout in place. The authoring operation
assigns and stores the next colour by rotating through the application palette;
recolouring writes another explicit colour later. Colour remains optional in
the domain for imported or externally constructed Routes.

Add Route is literal and repeatable: it always creates another Route, even when
the active Route is already empty. No provisional form or setup dialog precedes
the Edit, so identity is minted and persistence begins when Add Route completes.
Naming and recolouring are ordinary later Edits.

The Route-less fast path remains for an Algorithmic View. Drawing its first
connection atomically creates the Layout and its initial Active Route, assigns
and stores that Route's palette colour, and adds its first Edge. Every existing
Layout already has an Active Route, so a connection adds to it. Adding the
first Edge to an explicitly created empty Route changes only its Edge set; it
does not complete a hidden lifecycle transition or replace its identity.

Removing the final Edge retains the clean empty Route. A Route is deleted only
through its explicit confirmed action, which is unavailable for a Layout's last
Route. Deleting the Layout is a separate operation. **Design structural deletion
interactions** owns that interaction.

**Design structural deletion interactions** later strengthened ownership: a
Route belongs to exactly one Layout, so creating it has no visibility or reuse
effect on any other Layout.
