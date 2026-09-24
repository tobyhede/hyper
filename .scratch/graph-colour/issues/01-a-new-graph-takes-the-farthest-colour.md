# 01 — A new Graph takes the colour farthest from its Map's other Graphs

Status: ready-for-agent

**What to build:** Adding a Graph — through the Dock's New Graph, or by drawing the first connection in an empty Map, or any other creation gesture — stores the palette colour whose *nearest* colour among that Map's other Graphs is farthest away. Today the next colour is chosen by rotating through the palette by the Map's Graph count, and because the palette is ordered for the two-column swatch grid (each hue's dark then light slot, hues in colour-wheel order), a Map's first two Graphs are blue and blue light, and every neighbour is a near relation.

**Blocked by:** None (can start immediately).

**Why:** Graphs on one Map must be told apart at a glance (`CONTEXT.md`, Graph). Choosing by distance from what the Map already carries makes near pairs impossible by construction rather than unlikely by chance, which is why randomness was considered and rejected: a random pick could still land on an existing colour's light partner, and it would need a random source injected once at composition under ADR 0016. This rule is deterministic, so nothing is injected.

Decided:
- **Distance is perceptual (OKLab)**, computed from the palette hex values; no colour library. Hue angle alone was rejected because it cannot separate a hue from its light partner.
- **Maximise the minimum**: the chosen candidate is the one whose closest existing colour on the Map is as far away as possible.
- **Only the Map's own Graphs count**, not the Space's — a Map is where Graphs are drawn together, and the current rule is already Map-local. Every creation gesture uses the same rule, so a Graph's colour never depends on how it was created.
- **Candidates are the ten dark slots while any is unused on the Map**, then all twenty. The light slots win distance contests easily and are the weakest strokes on a light canvas; an author can still choose them from Colour….
- **Ties break by palette order**, so an empty Map's first Graph is still the first slot (blue).
- Existing Graphs keep their stored colours; nothing is recoloured, and the swatch grid's layout is unchanged.
- The resolved fallback for an imported Graph with no stored colour is out of scope.

- [ ] Every Graph creation gesture stores a colour chosen by the rule above, and none still rotates by count
- [ ] Property test: for any set of existing Map colours, no other candidate in the eligible set has a larger minimum distance than the one chosen
- [ ] Example tests: empty Map → first slot; one blue Graph → a non-blue strong colour; ten strong colours in use → the light slots become eligible; ties resolve by palette order
- [ ] `CONTEXT.md`'s Graph entry already states the rule (landed with this ticket's filing); the code's doc comments agree with it
