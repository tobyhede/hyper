# A Space Card creates the normal new Space

Status: accepted
Refines: 0018, 0058
Related: 0025

Creating a Space Card creates its target from the same complete new-Space
template used at first boot: one Markdown Card, no Layout, and no authored
placement. The application's automatic renderer supplies the initial placement;
editing later converts that computed placement into a Layout under ADR 0025.

ADR 0058's phrase "new, empty target Space" was internally inconsistent with
its own reference to ADR 0018's one-card template. "Empty" meant newly created,
not zero Cards. This ADR removes that ambiguity without changing the atomic Edit
boundary: the Space Card, target Space, and target's initial Card are created
together.
