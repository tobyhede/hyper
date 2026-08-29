import type { Story } from '@ladle/react';
import { ZoomSliderSpecimen } from '../support/ReactFlowCanvas';
import '../support/inventory.css';

export default { title: 'Components/Zoom Control' };

/** The shipped themed controls operating a real React Flow viewport. */
export const Canvas: Story = () => <ZoomSliderSpecimen />;
Canvas.meta = { iframed: true };
