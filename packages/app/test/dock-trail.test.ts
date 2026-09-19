import { describe, expect, it } from 'vitest';
import { newUuid } from '@project/core';
import { unwellElsewhere, type OpenRow, type SpaceStep } from '../src/dock-model';

const step = (title: string): SpaceStep => ({ spaceId: newUuid(), title });

/** A commit that failed on one of the open Spaces, which is the least of the three unwell states. */
const failedOn = (open: readonly OpenRow[], spaceId: string): readonly OpenRow[] =>
  open.map((row) =>
    row.spaceId === spaceId
      ? {
          ...row,
          persistence: {
            kind: 'failed' as const,
            failure: {
              kind: 'retryable-failure' as const,
              code: 'network' as const,
              message: 'The space could not be reached.',
            },
          },
        }
      : row,
  );

/** Which open Spaces the Open Spaces trigger's dot and count report. */
describe('the unwell Spaces the Open Spaces trigger reports', () => {
  /**
   * **A standing failure announces itself rather than waiting to be opened
   * (ADR 0082)**, so a parent whose commit failed is counted even while the
   * Opener control is already naming it.
   */
  it('counts a Space the bar is not naming that needs attention', () => {
    const current = newUuid();
    const parent = step('Design system');
    const open: readonly OpenRow[] = failedOn(
      [
        {
          spaceId: parent.spaceId,
          title: parent.title,
          depth: 0,
          persistence: { kind: 'settled' },
        },
        { spaceId: current, title: 'Rendering', depth: 1, persistence: { kind: 'settled' } },
      ],
      parent.spaceId,
    );

    expect(unwellElsewhere(open, current)).toBe(1);
  });

  /**
   * And the Space the reader is *in* does not count, because it reports for
   * itself: its own `PersistenceNotice` is on this same bar with the recovery in
   * it, so a chevron opened for it would disclose a Space the reader is already
   * looking at.
   */
  it('does not count the unwell Space that is the one being read', () => {
    const current = newUuid();
    const parent = step('Design system');
    const open: readonly OpenRow[] = failedOn(
      [
        {
          spaceId: parent.spaceId,
          title: parent.title,
          depth: 0,
          persistence: { kind: 'settled' },
        },
        { spaceId: current, title: 'Rendering', depth: 1, persistence: { kind: 'settled' } },
      ],
      current,
    );

    expect(unwellElsewhere(open, current)).toBe(0);
  });
});
