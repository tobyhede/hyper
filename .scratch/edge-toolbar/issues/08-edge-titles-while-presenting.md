# 08 — Edge Titles while presenting

Status: needs-info

**What to decide:** What an Edge Title does while presenting. Deferred out of the Edge toolbar effort.

**Why:** A Title's first argument was telling apart the choices at a fork, and `PresentingChrome` names each choice by its target Resource today.

Open:
- Does a titled choice read by its Title, or `Title → Target`?
- Does the canvas draw Edge Titles while presenting?
- Does `titleHidden` (authored, hides the Title at rest) apply while presenting, and to the choice list as well as the canvas?
- **Fork order.** The choices at a fork are listed in `graph.edges` order, which is drawing order. With reconnect dropped, Delete-then-draw appends the redrawn Edge, so it moves to the last choice and nothing moves it back. Accepted for now (recorded in ticket 02's ADR); decide here whether authors need control over the order.
