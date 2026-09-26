# 04: The connection preview draws the Active Graph's head shape

**What to build:** While an author draws an Edge, the preview line ends in the Active Graph's head shape and colour — the Graph the new Edge will join — rather than the present fixed arrow (ADR 0105).

**Blocked by:** 01

**Status:** done

- [x] The connection preview ends in the Active Graph's head shape, in its colour.
- [x] Activating a Graph with a different head shape changes the next preview accordingly.
- [x] A Graph with no stored head shape previews as `arrow`.

Built in `GraphConnectionLine`, which now draws `GraphHeadMarker` in place of its fixed arrow. React Flow hands a connection line only its geometry and `connectionLineStyle`, so the colour still rides on the style's stroke and the head shape reaches the preview through `GraphConnectionLineHeadShape`, a context provider `SpaceCanvas` wraps around `ReactFlow` with the Active Graph's `graphHeadShape` — or the default arrow when no Graph is active yet, the head shape the Graph a first connection mints starts with. The preview's props are narrowed to the fields it reads (`GraphConnectionLineProps`), so its unit test builds them without an assertion. The application proof is `editing.spec.ts`'s "the connection preview ends in the Active Graph’s head shape" (Mid `dot`, then Short `diamond`), and the existing drawing test now reads the arrow on a Graph that stores none.
