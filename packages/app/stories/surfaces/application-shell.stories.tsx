import type { Story } from '@ladle/react';
import { AppShell } from '@project/ui';
import { ReactFlowCanvas } from '../support/ReactFlowCanvas';
import { WorkspaceToolbarFixture } from '../support/WorkspaceToolbarFixture';
import { spaceTitle } from '../support/fixture';

export default { title: 'Surfaces/Application Shell' };

/**
 * Every story here draws the toolbar inside `.shell__header`, which is what
 * `AppShell` does — the controls are `inline-flex` and need a flex container to
 * centre against. Its component stories use the same header harness rather
 * than rendering those inline-flex controls in Ladle's plain container.
 */

/**
 * The whole frame: header, toolbar, canvas.
 *
 * The production frame and its real theme: header, toolbar and canvas together.
 */
export const Default: Story = () => (
  <div style={{ height: 620 }}>
    <AppShell title={spaceTitle} toolbar={<WorkspaceToolbarFixture />}>
      <div style={{ height: '100%', overflow: 'auto' }}>
        <ReactFlowCanvas />
      </div>
    </AppShell>
  </div>
);
