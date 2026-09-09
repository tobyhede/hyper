import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type UUID } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { ExitSpaceControl } from '../src/components/ExitSpaceControl';
import { createOpenSpaces, type ExitSpaceResult, type OpenSpaces } from '../src/open-spaces';
import { OpenSpacesContext } from '../src/open-spaces-context';
import { recordingHistory } from './browser-history';

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

const REFUSED_RETRY: ExitSpaceResult = {
  kind: 'refused',
  refusal: { code: 'persistence-recovery-required', recovery: 'retry' },
};
const REJECTED_WARNING: ExitSpaceResult = { kind: 'warning', warning: 'persistence-rejected' };

/**
 * A real Open Spaces with a scripted `exit`.
 *
 * The control reads two members off the session — `metaSpaceId`, which decides
 * whether it draws at all, and `exit` — but it takes the whole interface from
 * context. Spreading the real one and replacing the single operation under test
 * keeps every other member the type it actually is, rather than asserting a
 * hand-written partial into the interface (ADR 0062 forbids the assertion, and
 * the partial would go stale the day a member is added).
 *
 * The outcomes are a queue rather than one value because what is under test is
 * a *second* attempt: what the surface still says about the first one.
 */
const draw = (outcomes: readonly ExitSpaceResult[]) => {
  const remaining = [...outcomes];
  const confirmations: (boolean | undefined)[] = [];
  const session = createOpenSpaces({
    backend: new MemorySpaceBackend(META_ID),
    metaSpaceId: META_ID,
    newId: () => SPACE_ID,
    history: recordingHistory(),
  });
  const spaces: OpenSpaces = {
    ...session,
    exit: (_spaceId, confirmation) => {
      confirmations.push(confirmation?.warning === 'persistence-rejected');
      return Promise.resolve(remaining.shift() ?? { kind: 'exited' });
    },
  };
  render(
    <OpenSpacesContext.Provider value={spaces}>
      <ExitSpaceControl spaceId={SPACE_ID} />
    </OpenSpacesContext.Provider>,
  );
  return { confirmations };
};

/** The Exit the Sidebar draws, as opposed to the dialog's own confirmation. */
const pressExit = async () => {
  const [control] = screen.getAllByRole('button', { name: 'Exit Space' });
  if (control === undefined) throw new Error('Exit Space is not drawn');
  fireEvent.click(control);
  // The outcome lands in a resolved promise, so the render it causes is a tick
  // away rather than in the click.
  await screen.findByRole('button', { name: 'Exit Space' });
};

/**
 * A refusal is what the *last* attempt found, and the reader is told to go and
 * change it — recover the Space's persistence, then exit again. So by the time
 * a fresh attempt has an answer of its own, the refusal it replaced no longer
 * describes anything: leaving it up puts a destructive "retry saving first"
 * beside a confirmation dialog that only appears once saving is no longer what
 * stands in the way.
 *
 * The text query is deliberate. The dialog is modal, so Base UI hides the rest
 * of the surface from the accessibility tree while it is open — a role query
 * would answer "no alert" for the stale alert too, and pass over the bug.
 */
describe('a second exit attempt', () => {
  it('drops the refusal the reader has since recovered', async () => {
    draw([REFUSED_RETRY, REJECTED_WARNING]);

    await pressExit();
    expect(screen.getByText('Retry saving this Space before exiting.')).toBeVisible();

    await pressExit();

    expect(await screen.findByRole('alertdialog', { name: 'Exit without saving?' })).toBeVisible();
    expect(screen.queryByText('Retry saving this Space before exiting.')).toBeNull();
  });

  /**
   * The mirror the confirmation dialog does not need: `warning` is never reset
   * either, but the two footer buttons are both `AlertDialogPrimitive.Close`,
   * so the only gesture that starts an attempt from an open dialog closes it on
   * the way. A refusal answering the confirmed attempt therefore arrives with
   * the dialog already gone, and the surface says one thing rather than two.
   */
  it('has closed the confirmation before the confirmed attempt answers', async () => {
    const { confirmations } = draw([REJECTED_WARNING, REFUSED_RETRY]);

    await pressExit();
    const confirmation = await screen.findByRole('alertdialog', { name: 'Exit without saving?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Exit Space' }));
    await screen.findByText('Retry saving this Space before exiting.');

    expect(confirmations).toEqual([false, true]);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

/** The control is the Space's, and Meta is the one Space that cannot be left. */
describe('the exit control', () => {
  it('stays away from Meta', () => {
    const session = createOpenSpaces({
      backend: new MemorySpaceBackend(META_ID),
      metaSpaceId: META_ID,
      newId: (): UUID => SPACE_ID,
      history: recordingHistory(),
    });
    render(
      <OpenSpacesContext.Provider value={session}>
        <ExitSpaceControl spaceId={META_ID} />
      </OpenSpacesContext.Provider>,
    );

    expect(screen.queryByRole('button', { name: 'Exit Space' })).toBeNull();
  });
});
