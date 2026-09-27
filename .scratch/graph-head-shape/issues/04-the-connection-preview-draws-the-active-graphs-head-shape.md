# 04: The connection preview draws the Active Graph's head shape

**What to build:** While an author draws an Edge, the preview line ends in the Active Graph's head shape and colour — the Graph the new Edge will join — rather than the present fixed arrow (ADR 0105).

**Blocked by:** 01

**Status:** done

- [x] The connection preview ends in the Active Graph's head shape, in its colour.
- [x] Activating a Graph with a different head shape changes the next preview accordingly.
- [x] A Graph with no stored head shape previews as `arrow`.
- [x] A connection drawn between two Resources inside an Open Space Resource previews the Graph that embedding shows, because the Edge joins the target Space's Graph, not the containing Space's Active Graph.

Built in `GraphConnectionLine`, which now draws `GraphHeadMarker` in place of its fixed arrow. React Flow hands a connection line only its geometry and `connectionLineStyle`, so the colour still rides on the style's stroke and the head shape reaches the preview through `GraphConnectionLineHeadShape`, a context provider `SpaceCanvas` wraps around `ReactFlow`. Both come from `connectionAppearance` in `colors.ts`, which resolves the joined Graph's colour and head shape together as a `GraphAppearance`: the Active Graph's — or the default arrow when no Graph is active yet, the head shape the Graph a first connection mints starts with — or, while a connection that started inside an embedding is in flight, the embedding's shown Graph, answered by its publication's `connectionAppearance`. The preview's props are narrowed to the fields it reads (`GraphConnectionLineProps`), so its unit test builds them without an assertion. The application proof is `editing.spec.ts`'s "the connection preview ends in the Active Graph’s head shape" (Mid `dot`, then Short `diamond`), and the existing drawing test now reads the arrow on a Graph that stores none. The embedded proofs make the shown Graph differ from the containing Space's Active Graph: `space-resource.spec.ts`'s embedded connect activates Short on the host first, and the embedded-map story's Overview stores its own colour and `diamond`.
