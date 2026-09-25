import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import type { LoadedSpace } from '@project/persistence';
import { PersistenceControl, PersistenceNotice } from '../src/components/PersistenceControl';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a1');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a2');
const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a3');

const SNAPSHOT: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'Stored space' },
  resources: [],
};

const STORED: LoadedSpace = { snapshot: SNAPSHOT, revision: 5n, exportedRevision: null };

describe('PersistenceControl', () => {
  it('explains an aggregate refusal instead of naming its error kinds', () => {
    render(
      <PersistenceControl
        persistence={{
          kind: 'refused',
          failure: {
            kind: 'aggregate-refused',
            errors: [
              {
                kind: 'space-resource-target-missing',
                spaceId: SPACE_ID,
                resourceId: RESOURCE_ID,
                targetSpaceId: TARGET_ID,
              },
              { kind: 'ordinary-space-unreferenced', spaceId: TARGET_ID },
            ],
          },
        }}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/space resource points at a space that no longer exists/i),
    ).toBeVisible();
    expect(screen.getByText(/nothing pointing at it/i)).toBeVisible();
    // The domain identity stays in the domain: a refusal code is a stable name
    // for the repository to answer with, not a sentence to show an author.
    expect(screen.queryByText(/space-resource-target-missing/)).toBeNull();
    expect(screen.queryByText(/ordinary-space-unreferenced/)).toBeNull();
  });

  it('repeats a shared explanation once however many errors carry it', () => {
    render(
      <PersistenceControl
        persistence={{
          kind: 'refused',
          failure: {
            kind: 'aggregate-refused',
            errors: [
              { kind: 'ordinary-space-unreferenced', spaceId: SPACE_ID },
              { kind: 'ordinary-space-unreferenced', spaceId: TARGET_ID },
            ],
          },
        }}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/nothing pointing at it/i)).toHaveLength(1);
  });

  it('can accept the stored side when no stored Space remains', () => {
    const onAcceptRemote = vi.fn(() => null);
    render(
      <PersistenceControl
        persistence={{ kind: 'conflicted', current: undefined, baseline: undefined }}
        onAcceptRemote={onAcceptRemote}
        onKeepLocal={vi.fn()}
      />,
    );

    const reload = screen.getByRole('button', { name: 'Reload' });
    expect(reload).toBeEnabled();
    expect(screen.getByText(/there is no stored version of this space/i)).toBeVisible();

    fireEvent.click(reload);
    expect(onAcceptRemote).toHaveBeenCalledTimes(1);
  });

  it('offers a revert to the baseline for a Space the conflict never named', () => {
    const onAcceptRemote = vi.fn(() => null);
    render(
      <PersistenceControl
        persistence={{
          kind: 'conflicted',
          current: undefined,
          baseline: {
            id: SPACE_ID,
            document: { version: 1, title: 'Before the coordinated edit' },
            resources: [],
          },
        }}
        onAcceptRemote={onAcceptRemote}
        onKeepLocal={vi.fn()}
      />,
    );

    // The coordinated edit never committed, so the baseline is what is stored
    // and reloading it is an ordinary discard rather than a dead end.
    const reload = screen.getByRole('button', { name: 'Reload' });
    expect(reload).toBeEnabled();
    expect(screen.getByText(/returns this space to how it was before the edit/i)).toBeVisible();

    fireEvent.click(reload);
    expect(onAcceptRemote).toHaveBeenCalledTimes(1);
  });

  /**
   * The rejection dialog's other arm. An aggregate refusal is structured and
   * already described from its errors; a permanent failure carries only a code,
   * and the sentence is the application's for that code.
   */
  it('explains a permanent rejection from its code', () => {
    render(
      <PersistenceControl
        persistence={{
          kind: 'rejected',
          failure: { kind: 'permanent-failure', code: 'forbidden' },
        }}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    expect(screen.getByText('You do not have permission to save this space.')).toBeVisible();
  });

  /**
   * The three recoveries a conflict can offer, each with its own sentence.
   *
   * Written before the copy moved out of the component, so the move is proved
   * to change nothing the author reads. Which recovery a conflict is remains
   * derived from the two snapshots it carries: a newer stored Space reloads, a
   * participant the conflict never named reverts to its baseline, and a Space
   * with neither has nothing stored to accept.
   */
  it.each([
    [
      'reload',
      { current: STORED, baseline: undefined },
      /A newer version of this space is available\. Reload discards your local changes, including unsaved text you have typed into an open Resource\. Keep local and retry preserves that editing and tries to save it again\./,
    ],
    [
      'revert',
      { current: undefined, baseline: SNAPSHOT },
      /A related space changed while this coordinated edit was saving\. Reload returns this space to how it was before the edit and discards unsaved text typed into an open Resource\. Keep local and retry preserves that editing and tries to save it again\./,
    ],
    [
      'none',
      { current: undefined, baseline: undefined },
      /There is no stored version of this space/,
    ],
  ] as const)('explains the %s recovery a conflict offers', (_recovery, conflict, sentence) => {
    render(
      <PersistenceControl
        persistence={{ kind: 'conflicted', ...conflict }}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    expect(screen.getByText(sentence)).toBeVisible();
  });

  /**
   * Two rejections of one code are two rejections.
   *
   * Dismissing the dialog is an acknowledgement of the failure in front of the
   * author, not a standing preference, so the next failure has to draw it
   * again. Nothing in the failure's *value* can tell the two apart — both are
   * `invalid-commit` and nothing else — so what separates them is that they
   * are different publications, and the control follows the failure it was
   * handed rather than a key derived from what that failure says.
   *
   * The coordinated path is why this matters rather than being theoretical:
   * `prepareCoordinatedCommit` installs `pending` without notifying, so the
   * render that would otherwise unmount this control between two rejections is
   * not guaranteed to happen.
   */
  it('draws a second rejection of the same code after the first was dismissed', () => {
    // Equal by value on purpose: a key derived from what the failure *says*
    // cannot tell these two apart, and they are exactly the pair the fix is for.
    const rejection = () =>
      ({
        kind: 'rejected',
        failure: { kind: 'permanent-failure', code: 'invalid-commit' },
      }) as const;
    const view = render(
      <PersistenceControl
        persistence={rejection()}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('persistence-rejection-continue'));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    view.rerender(
      <PersistenceControl
        persistence={rejection()}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    expect(screen.getByRole('alertdialog', { name: 'Changes couldn’t be saved' })).toBeVisible();
  });

  /**
   * `v1-release/17` criterion 2: a permanent rejection (`kind: 'rejected'`)
   * and an aggregate refusal (`kind: 'refused'`) are distinct
   * `SpaceSessionState['persistence']` kinds. `PersistenceControl`'s own
   * `Rejection` type spans both, and this exercises the acknowledge/dismiss
   * flow across the pair in one sequence — acknowledging one and then
   * receiving the other draws the dialog again with the other's own sentence,
   * never the first's.
   */
  it('draws an aggregate refusal after acknowledging an unrelated permanent rejection', () => {
    const rejection = {
      kind: 'rejected',
      failure: { kind: 'permanent-failure', code: 'forbidden' },
    } as const;
    const refusal = {
      kind: 'refused',
      failure: {
        kind: 'aggregate-refused',
        errors: [{ kind: 'ordinary-space-unreferenced', spaceId: SPACE_ID }],
      },
    } as const;
    const view = render(
      <PersistenceControl
        persistence={rejection}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('persistence-rejection-continue'));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    view.rerender(
      <PersistenceControl
        persistence={refusal}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('alertdialog', { name: 'Changes couldn’t be saved' });
    expect(dialog).toBeVisible();
    expect(screen.getByText(/nothing pointing at it/i)).toBeVisible();
    expect(screen.queryByText('You do not have permission to save this space.')).toBeNull();
  });

  /**
   * A dismissal is spent by the next failure, not by leaving the Space.
   *
   * `active` is false for every open Space but the one on screen (`open-spaces-context.ts`),
   * and every managed Space stays mounted behind it
   * (`OpenSpacesApplication.tsx`). So switching away and back is not a
   * republication and must not re-raise a dialog the author already answered.
   */
  it('keeps a rejection dismissed across a switch away from the Space', () => {
    const persistence = {
      kind: 'rejected',
      failure: { kind: 'permanent-failure', code: 'forbidden' },
    } as const;
    const control = (active: boolean) => (
      <PersistenceControl
        active={active}
        persistence={persistence}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />
    );
    const view = render(control(true));

    fireEvent.click(screen.getByTestId('persistence-rejection-continue'));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    view.rerender(control(false));
    view.rerender(control(true));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Persistence rejected' })).toBeVisible();
  });

  /**
   * A refusal belongs to the conflict that raised it.
   *
   * Two coordinated conflicts are equal by value — neither carries a stored
   * revision to key on — and the coordinated path installs its states without
   * notifying (`session.ts`), so no render between them unmounts this control.
   * The refusal from the first must not be left standing over the second.
   */
  it('drops a remote refusal when a second coordinated conflict arrives', () => {
    const conflict = () =>
      ({ kind: 'conflicted', current: undefined, baseline: SNAPSHOT }) as const;
    const view = render(
      <PersistenceControl
        persistence={conflict()}
        onAcceptRemote={vi.fn(() => ({ code: 'stored-space-deleted' }) as const)}
        onKeepLocal={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(screen.getByTestId('persistence-remote-refused')).toBeVisible();

    view.rerender(
      <PersistenceControl
        persistence={conflict()}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('persistence-remote-refused')).toBeNull();
  });
});

/**
 * The standing notice behind the toolbar's red dot. A retryable failure
 * carries a code and no prose, and the author reads the application's sentence
 * for it (ADR 0057).
 */
describe('PersistenceNotice', () => {
  it('explains a retryable failure from its code', () => {
    render(
      <PersistenceNotice
        persistence={{
          kind: 'failed',
          failure: { kind: 'retryable-failure', code: 'network' },
        }}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('Your device could not reach the server.')).toBeVisible();
  });
  const blockedByTarget = {
    code: 'persistence-recovery-required',
    spaceId: TARGET_ID,
    title: 'Target',
    recovery: 'resolve-conflict',
  } as const;

  it('names the Space whose recovery blocks a rejected save, and offers to open it and Retry', () => {
    const onRetry = vi.fn();
    const onOpenSpace = vi.fn();
    render(
      <PersistenceNotice
        persistence={{
          kind: 'rejected',
          failure: { kind: 'permanent-failure', code: 'forbidden' },
          blocked: blockedByTarget,
        }}
        onRetry={onRetry}
        onOpenSpace={onOpenSpace}
      />,
    );

    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent(
      'Target has a conflict to resolve before these changes can be saved. Resolve it there, then retry here.',
    );
    // The rejection it recovers from is not the reason any more.
    expect(notice).not.toHaveTextContent('permission');

    fireEvent.click(screen.getByRole('button', { name: 'Open Target' }));
    expect(onOpenSpace).toHaveBeenCalledWith(TARGET_ID, 'Target');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('says a failed replay read did not send the changes, with Retry and nothing to open', () => {
    render(
      <PersistenceNotice
        persistence={{
          kind: 'failed',
          failure: { kind: 'retryable-failure', code: 'network' },
          blocked: { code: 'persistence-read-failed' },
        }}
        onRetry={vi.fn()}
        onOpenSpace={vi.fn()}
      />,
    );

    expect(
      screen.getByText('The stored Spaces could not be read, so these changes were not sent.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Open/ })).toBeNull();
  });

  it('draws nothing for a rejection no recovery attempt has blocked', () => {
    render(
      <PersistenceNotice
        persistence={{
          kind: 'rejected',
          failure: { kind: 'permanent-failure', code: 'forbidden' },
        }}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('leaves a blocked rejection to the notice rather than a dialog', () => {
    render(
      <PersistenceControl
        persistence={{
          kind: 'rejected',
          failure: { kind: 'permanent-failure', code: 'forbidden' },
          blocked: blockedByTarget,
        }}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('explains inside the conflict why keeping local work did not save', () => {
    render(
      <PersistenceControl
        persistence={{
          kind: 'conflicted',
          current: STORED,
          baseline: undefined,
          blocked: { code: 'persistence-read-failed' },
        }}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    expect(screen.getByTestId('persistence-keep-local-blocked')).toHaveTextContent(
      'The stored Spaces could not be read, so these changes were not sent.',
    );
    expect(screen.getByRole('button', { name: 'Keep local and retry' })).toBeVisible();
  });

  it('offers to open the Space whose recovery blocks keeping local work', () => {
    const onOpenSpace = vi.fn();
    render(
      <PersistenceControl
        persistence={{
          kind: 'conflicted',
          current: STORED,
          baseline: undefined,
          blocked: blockedByTarget,
        }}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
        onOpenSpace={onOpenSpace}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Target' }));
    expect(onOpenSpace).toHaveBeenCalledWith(TARGET_ID, 'Target');
  });
});
