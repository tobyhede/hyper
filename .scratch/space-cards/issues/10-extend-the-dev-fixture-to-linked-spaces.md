# 10 — Extend the dev fixture to a tree of linked Spaces

**What to build:** The tracked fixture is one Space called "Layout fixture", holding Cards titled A through H whose bodies describe the fixture rather than saying anything. Nothing in it can exercise a Space Card, and nothing in it makes a legible demo. Give it both: several Spaces reachable through Space Cards, and content worth looking at.

**Blocked by:** 03 — Build the Space Card kind in core (as rewritten by issue 08).

**Status:** ready-for-agent

- [ ] The fixture becomes a set of Spaces rather than one. The importer reads a set of Space directories; today it reads exactly one and hands a single-element array to `importSpaces`, which already takes many.
- [ ] The root Space carries Space Cards reaching the others, so every Space in the fixture is reachable the way ADR 0068 says a Space is reached. At least one Space is reached from two different Space Cards, since ADR 0068 allows references to converge — that case has no fixture today and will otherwise go untested by hand.
- [ ] Depth is at least three, so the rail has something to draw beyond one crossing.
- [ ] The Cards say something. Titles and bodies carry real content on a real subject, so `pnpm dev:fixture` is a surface someone can be shown rather than a lattice of placeholders. Keep at least one Space with no authored Layout, so the automatic strategy path stays exercised.
- [ ] `pnpm dev:fixture` and the e2e `chromium` project both serve the extended fixture through the same importer, and the existing e2e suite is rolled forward with it rather than pinned to the old shape.
- [ ] A Space Card whose target is an ancestor is not in the fixture, and the cycle-rejection case keeps its own test rather than relying on the fixture to fail.

## Why the content matters as much as the shape

This is the fixture the app is demonstrated from. Placeholder titles made sense while the only question was whether a Layout arranged five boxes; they stop making sense the moment the demo is "cross into another Space and come back". A reader who has to translate "Card D" into a role while also following a traversal is being asked to do the work the fixture exists to save.

## Splittable

The content pass does not actually need the `space` kind. If issue 03 is slow, land the rewrite of the Cards first and add the Space Cards after — the blocking edge is only on the second half.
