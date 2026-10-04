# 04 — Treatments follow the outline

Status: ready-for-agent
Blocked by: 03

**What to build:** the selection ring and a Reference Resource's dotted border follow the Shape's outline rather than the bounding rect, for every Shape. An embedded Map (Open Space Resource, Reference to a Space Resource) draws its Resources' Shapes through the shared surface (ADR 0112), and the Shape choice is offered there wherever the embedded Map's policy allows authoring.

**Acceptance:** Ladle stories for a selected and a Reference Resource in a non-rectangular Shape; application E2E changes a Shape inside an embedded Map and sees it in the target Space's own Map.
