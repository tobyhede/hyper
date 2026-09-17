# 01 — Reorganise Graph and Diagram menus

**What to build:** Reorder the Graph and Diagram command menus so they share one grouping grammar, and apply that same menu on every surface that already draws those commands — the Command Dock and an Open Space Thing's Diagram and Graph menus. This is reorganisation: reorder and relabel. The only behaviour change is removing Copy permanent link from Graph menus. Every remaining command keeps its current effect, destination, availability and reporting.

**Blocked by:** None — can start immediately

**Status:** done

- [x] The Graph menu shows these groups in order, with one separator between groups: the Graph selection list; Colour…; New Graph; Rename, Copy link to Graph; Delete {title}.
- [x] Colour… is its own group immediately after the list. It is the existing palette submenu on the Active Graph, and picking a colour keeps the current close-on-pick behaviour.
- [x] Copy link to Graph copies the same within-Diagram Graph address Copy link copies today. Copy permanent link is absent. Opening that copied address still selects the named Diagram and activates that Graph.
- [x] The Diagram menu shows these groups in order, with one separator between groups: the Diagram selection list; New Diagram; Rename, Copy link to Diagram; Delete {title}. There is no Colour group.
- [x] Copy link to Diagram copies the Diagram's existing address. Rename, New Graph, New Diagram, selection, Present, and last-Diagram / last-Graph Delete keep their current behaviour. Delete {title} stays visible and disabled when it cannot run.
- [x] An Open Space Thing's Diagram and Graph menus match the Dock's grouping, labels and availability. They remain the same commands, not a second interaction model.
- [x] Use the shared UI menu and selection primitives, following shadcn-first-ui. Pointer and keyboard reach the same commands.
- [x] Application and Ladle behaviour evidence verifies the ordered groups, separator boundaries, Colour…, the copied Graph and Diagram destinations, the absence of Copy permanent link, rename and create focus, and deletion safeguards.
