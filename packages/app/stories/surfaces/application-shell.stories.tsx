import type { Story } from '@ladle/react';
import { AppShell } from '@project/ui';
import { StaticCanvas } from '../support/StaticCanvas';
import { Toolbar } from '../support/Toolbar';
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
 * This is the story the first pass is for. The thing to look at is not any one
 * control but the seam between them — the header is `--panel` on `--bg`, dark,
 * and the canvas below it is `#efe9dc` paper. The handoff's token table covers
 * the card and the canvas and says nothing about the chrome, so that boundary
 * is an open decision rather than a rendering fault.
 */
export const Default: Story = () => (
  <div style={{ height: 620 }}>
    <AppShell title={spaceTitle} toolbar={<Toolbar />}>
      <div style={{ height: '100%', overflow: 'auto' }}>
        <StaticCanvas />
      </div>
    </AppShell>
  </div>
);
