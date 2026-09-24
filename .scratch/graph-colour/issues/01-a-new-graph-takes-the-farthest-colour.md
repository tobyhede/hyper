# 01 — A new Graph takes the colour farthest from its Map's other Graphs

Status: done

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

- [x] Every Graph creation gesture stores a colour chosen by the rule above, and none still rotates by count
- [x] Property test: for any set of existing Map colours, no other candidate in the eligible set has a larger minimum distance than the one chosen
- [x] Example tests: empty Map → first slot; one blue Graph → a non-blue strong colour; ten strong colours in use → the light slots become eligible; ties resolve by palette order
- [x] `CONTEXT.md`'s Graph entry already states the rule (landed with this ticket's filing); the code's doc comments agree with it

Follow-up (review of PR #274): the first box was not true when it was ticked. The rule lived in `packages/app/src/colors.ts`, which `@project/graph` and `@project/persistence` cannot import, so `initializeSpace`/`newSpace` (`packages/graph/src/new-space.ts`) and the first-load initialization of a mapless Space (`packages/persistence/src/working-space.ts`) created `Graph 1` with no stored colour. The palette, `GRAPH_PALETTE_ENTRIES`, `nextGraphColor`, `graphColorsByGraphId` and the OKLab measure now live in `packages/graph/src/graph-color.ts` and are offered from `@project/graph`'s index (`graphColorDistance` stays module-local, for its tests); `packages/app/src/colors.ts` keeps only `activeGraphColor`. Both of those creations now store `nextGraphColor([])`, held by `packages/graph/test/new-space.test.ts` and `packages/persistence/test/working-space.test.ts`, and the whole-document expectations that encoded a colourless new-Space or first-load Graph were rolled forward with it. The tests moved to `packages/graph/test/graph-color.test.ts`.

On ties: no two palette pairs lie at the same OKLab distance (`graph-color.test.ts` holds this), so with only palette colours on a Map a tie between candidates happens only at distance zero (every slot in use) or infinity (nothing readable), and those are the tie examples. A search over every `#rgb` colour as a single existing colour found no tie among the dark slots either, so no nonzero tie example exists to write honestly. The light slots being held back is this ticket's decision, not a measured property; `nextGraphColor`'s doc comment now says so.
