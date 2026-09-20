import type { Story } from '@ladle/react';
import { GraphHudFixture } from '../support/GraphHudFixture';
import { sparseAuthoredSpace } from '../support/spaces';

export default { title: 'Surfaces/Graph HUD' };

/**
 * The canvas HUD on a real canvas.
 *
 * A surface rather than a component, because the MiniMap only means anything
 * with a flow under it: it draws the nodes React Flow measured, at the viewport
 * React Flow is showing. Nothing here replaces it or supplies geometry in its
 * place — the fixture provides the Space, the Graphs, the colours and the
 * viewport, and the framework does the rest.
 *
 * The claim it carries is the one ADR 0053 left open when the Sidebar gained a
 * Graphs group: the key stays, and the two surfaces must not disagree about a
 * Graph's title, its colour, or which one is active.
 */
export const Retained: Story = () => <GraphHudFixture />;
Retained.meta = { iframed: true };

/**
 * The same tracked Space, opened on its other Map.
 *
 * `authoredSpace` owns two Maps — `Collection 1`, above, owning three
 * Graphs, and `Collection 2`, owning one. `sparseAuthoredSpace` is the same
 * Space declaring `Collection 2` as its `defaultMap`, so this story's key
 * holds exactly the one Graph that Map owns and none of `Collection 1`'s.
 * That is the evidence a single Map's story cannot give: a key which
 * changes with the Map it opens on, shown rather than merely asserted.
 */
export const SparseMap: Story = () => <GraphHudFixture space={sparseAuthoredSpace} />;
SparseMap.meta = { iframed: true };
