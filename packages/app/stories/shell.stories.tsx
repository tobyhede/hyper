import type { ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { AppShell } from '@project/ui';
import { StaticCanvas } from './StaticCanvas';
import { Toolbar } from './Toolbar';
import { spaceTitle } from './fixture';

export default { title: 'Shell' };

/**
 * Every story here draws the toolbar inside `.shell__header`, which is what
 * `AppShell` does — the controls are `inline-flex` and need a flex container to
 * centre against. `Toolbar` itself lives in `./Toolbar` rather than this module
 * because Ladle makes a story out of every export a story module has, and one
 * rendered bare stood the controls on their baselines.
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
export const Shell: Story = () => (
  <div style={{ height: 620 }}>
    <AppShell title={spaceTitle} toolbar={<Toolbar />}>
      <div style={{ height: '100%', overflow: 'auto' }}>
        <StaticCanvas />
      </div>
    </AppShell>
  </div>
);

/**
 * The toolbar alone, in the header it is drawn in. `AppShell` puts it in
 * `.shell__toolbar` beside the title; here it is the header's only content, so
 * the row reads left to right instead of being pushed right by
 * `justify-content: space-between`.
 */
const ToolbarRow = ({ children }: { children: ReactNode }) => (
  <div className="shell__header">
    <div className="shell__toolbar">{children}</div>
  </div>
);

export const ToolbarPersisted: Story = () => (
  <ToolbarRow>
    <Toolbar />
  </ToolbarRow>
);
ToolbarPersisted.storyName = 'Toolbar · persisted';

export const ToolbarPending: Story = () => (
  <ToolbarRow>
    <Toolbar persistence="pending" />
  </ToolbarRow>
);
ToolbarPending.storyName = 'Toolbar · persisting';

export const ToolbarFailed: Story = () => (
  <ToolbarRow>
    <Toolbar persistence="failed" />
  </ToolbarRow>
);
ToolbarFailed.storyName = 'Toolbar · retryable failure';

export const ToolbarConflicted: Story = () => (
  <ToolbarRow>
    <Toolbar persistence="conflicted" />
  </ToolbarRow>
);
ToolbarConflicted.storyName = 'Toolbar · conflict';

/**
 * Authoring withdrawn: presenting, or a pane is open, or no arrangement has
 * resolved. `AddCardControl` disables both halves of the split control, and the
 * Present button becomes Overview.
 */
export const ToolbarPresenting: Story = () => (
  <ToolbarRow>
    <Toolbar presenting authoringDisabled />
  </ToolbarRow>
);
ToolbarPresenting.storyName = 'Toolbar · presenting (authoring withdrawn)';
