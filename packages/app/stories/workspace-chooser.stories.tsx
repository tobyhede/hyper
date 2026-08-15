import type { Story } from '@ladle/react';
import type { SpaceSummary } from '@project/persistence';
import { WorkspaceSelection } from '../src/WorkspaceSelection';
import { spaceSummaries } from './fixture';

export default { title: 'Workspace chooser' };

/**
 * The real `WorkspaceSelection`, over fixture summaries.
 *
 * It opens nothing: `openSelected` answers a promise that never settles, which
 * is also what makes the busy state below reachable without a backend. Nothing
 * is mutated because there is nothing behind it to mutate.
 *
 * Three things this surface is here to have decided, and it is the least
 * designed of the pass-one surfaces:
 *
 *  - Every row prints its **UUID** beside the title. That is the only
 *    disambiguator the summary carries, and it is unreadable. What should a row
 *    show — a Card count, a last-edited time, nothing?
 *  - The rows are bare `<button>` elements styled in `styles.css`, not the
 *    shadcn `Card` the manifest earmarks for "panes and list items". This is the
 *    manifest's `Card` hypothesis, and this is the surface that confirms it.
 *  - There is no empty state in the component at all — the third story below is
 *    what it renders when handed nothing, which is a heading and a void.
 */
const openNothing = () => new Promise<never>(() => undefined);

const Chooser = ({ spaces }: { spaces: readonly SpaceSummary[] }) => (
  <div className="inv-app-surface">
    <WorkspaceSelection
      spaces={spaces}
      openSelected={openNothing}
      onOpened={() => undefined}
      onError={() => undefined}
    />
  </div>
);

export const Several: Story = () => <Chooser spaces={spaceSummaries} />;
Several.storyName = 'Several spaces';

/**
 * One space. Startup opens a sole space directly rather than drawing this, so
 * the state is only reachable when a second space existed and was removed —
 * worth seeing, and arguably worth never rendering.
 */
export const One: Story = () => <Chooser spaces={spaceSummaries.slice(0, 1)} />;
One.storyName = 'One space';

export const Empty: Story = () => <Chooser spaces={[]} />;
Empty.storyName = 'Empty — no spaces';

/**
 * Mid-open. The list sets `aria-busy` and disables every row; nothing else
 * changes, so there is no visible progress at all. Whether that needs a
 * `Skeleton` or a spinner is the manifest's "confirm need rather than adding
 * speculatively", and this story is the evidence for the call.
 */
export const Opening: Story = () => (
  <div
    className="inv-app-surface"
    ref={(node) => {
      // Click the first row on mount so the story lands in the busy state
      // rather than asking a reviewer to produce it.
      node?.querySelector('button')?.click();
    }}
  >
    <WorkspaceSelection
      spaces={spaceSummaries}
      openSelected={openNothing}
      onOpened={() => undefined}
      onError={() => undefined}
    />
  </div>
);
Opening.storyName = 'Opening (busy)';
