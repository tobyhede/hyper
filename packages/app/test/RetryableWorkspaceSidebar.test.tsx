import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { RetryableWorkspaceSidebarFixture } from '../stories/support/WorkspaceSidebarFixture';

/**
 * jsdom ships none, and the Sidebar primitive observes its own container.
 * `WorkspaceSidebar.test.tsx` installs the same stub for the same reason.
 */
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
});

afterAll(() => vi.unstubAllGlobals());

/**
 * The Failed story's one claim, pressed on the rendered story: **a failed save
 * keeps the unsaved work on screen** (ADR 0052).
 *
 * `Collection 3` is in the snapshot the session submitted and in no revision the
 * backend has stored, so a sidebar drawing anything but its own session's
 * working Space cannot show it. That is exactly what the story used to do — a
 * session over one snapshot beside a sidebar drawing an unrelated Space — and
 * each half was tested on its own, so nothing failed while the story was wrong
 * about the product. Written against that defect: with the old fixture this
 * fails here, with the failure notice up and no such row in the list.
 *
 * Three tests around one claim, and none of them is the other two. Its pair in
 * the application is `keeps persistence failure visible, accepts another Edit,
 * and retries the latest Space` in `space-authoring.test.ts`, which proves the
 * working state survives a failure; `story-spaces.test.ts` holds the Edit to
 * appending, which is what keeps this story renderable at all. This one says
 * the workspace draws that state. `issue-14-workspace-sidebar.spec.ts` presses
 * it in a browser too, and this is here as well because `pnpm verify` does not
 * run Ladle.
 */
it('keeps the unsaved Layout drawn through the failure and the retry', async () => {
  render(<RetryableWorkspaceSidebarFixture />);

  await screen.findByTestId('persistence-failure');
  expect(screen.getByRole('button', { name: 'Collection 3' })).toBeInTheDocument();

  fireEvent.click(screen.getByTestId('persistence-retry'));

  await waitFor(() => expect(screen.queryByTestId('persistence-failure')).toBeNull());
  // And the retry saved that same work rather than replacing it: revision 1 is
  // the commit the failure had not made.
  expect(screen.getByRole('button', { name: 'Collection 3' })).toBeInTheDocument();
  expect(screen.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});
