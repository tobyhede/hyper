import type { Story } from '@ladle/react';
import { SelectedEdgeCanvasFixture } from '../support/SelectedEdgeCanvasFixture';

export default { title: 'Review/Selected Edge On Canvas' };

/**
 * The selected Edge's controls in the context that decides whether they work.
 *
 * The stable `Components/Selected Edge Controls` stories mount the same
 * component in isolation, which is right for the states a canvas cannot reach —
 * three of the four refusals need the Space to change under an open editor — and
 * wrong for every question about the surface itself. `EdgeLabelRenderer` draws
 * these controls inside the flow's transformed layer, so they are rendered at
 * the viewport's scale, sit on the Edge, pan and zoom with it, and compete for
 * pixels with the Cards and the HUD. A component story at 1:1 shows none of that
 * and quietly flatters the result.
 *
 * `Review/` deliberately: these carry no parity claim and assert nothing. They
 * are here to be looked at while the surface is being changed.
 */

/** As an author meets it: the whole Layout in view, controls at that scale. */
export const AtOverviewZoom: Story = () => <SelectedEdgeCanvasFixture />;
AtOverviewZoom.meta = { iframed: true };

/** The same controls at 1:1 — what the isolated component stories show. */
export const CloseIn: Story = () => <SelectedEdgeCanvasFixture zoom="close" />;
CloseIn.meta = { iframed: true };

/**
 * The endpoint editor open over the canvas, anchored to the Edge's controls.
 *
 * **The two halves are drawn at different scales**, which is the first thing
 * this story showed and which no component story could: the toolbar is inside
 * `EdgeLabelRenderer` and so is painted at the viewport's zoom, while the
 * popover is portalled to the document by Base UI and is painted at 1:1. At the
 * opening zoom the editor is several times the size of the control that opened
 * it, and covers the two Cards the Edge runs between. Left as a thing to look
 * at rather than fixed here.
 */
export const EditorOnCanvas: Story = () => <SelectedEdgeCanvasFixture editorOpen />;
EditorOnCanvas.meta = { iframed: true };

/** A refused Delete, drawn where the author is actually looking. */
export const DeletionRefusalOnCanvas: Story = () => (
  <SelectedEdgeCanvasFixture
    refusal={{ kind: 'deletion', refusal: { code: 'layout-required', operation: 'deleted-edge' } }}
  />
);
DeletionRefusalOnCanvas.meta = { iframed: true };
