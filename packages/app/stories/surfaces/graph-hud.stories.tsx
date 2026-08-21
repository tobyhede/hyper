import type { Story } from '@ladle/react';
import { GraphHudFixture } from '../support/GraphHudFixture';

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
