# Design Route-scoped View navigation and authoring

Type: grilling
Status: resolved
Blocked by: 06

## Question

How does an author select a Layout-owned Route as the subject of an application-
supplied Algorithmic View such as Tree; which activation, management, presenting
and structural actions remain available while that View borrows the Route; and
which actions convert by copying the rendered Cards, positions and Route into a
new Layout without accidentally editing or deleting the source Route?

## Answer

This feature is deferred from the current Card and Route authoring destination.
The architecture may allow a future application-supplied View, such as Tree, to
take one Layout-owned Route as its subject, but version 1 specifies no such View,
subject selector, navigation, management, presenting, or conversion interaction.

This is a scope boundary rather than a product decision on the route to the
destination, so the ticket closes under the map's **Out of scope** section and
does not appear in **Decisions so far**.
