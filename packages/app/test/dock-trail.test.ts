import { describe, expect, it } from 'vitest';
import { newUuid } from '@project/core';
import { trailControls, unwellElsewhere, type OpenRow, type SpaceStep } from '../src/dock-model';

const step = (title: string): SpaceStep => ({ spaceId: newUuid(), title });

const rows = (count: number): readonly OpenRow[] =>
  Array.from({ length: count }, (_, index) => ({
    spaceId: newUuid(),
    title: `Space ${index + 1}`,
    depth: index,
    persistence: { kind: 'settled' },
  }));

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

/**
 * The trail decision, held where deleting the sheet cannot take it.
 *
 * Nine schemes were drawn and the answer was the narrowest of them: the bar
 * names the parent and nothing above it, and the Open Spaces menu holds the rest. That
 * answer lived in a doc comment on a prototype component that ticket 07
 * rewrites, and on a sheet ticket 06 has now deleted, so this is what carries it
 * across — the rule is a value now, and a rewrite that changes it fails here
 * rather than passing quietly.
 */
describe('what the bar draws above the Space you are in', () => {
  it('names the parent and never the crossing above it', () => {
    // Six deep. Every scheme that spends a mark per crossing draws six things
    // here; the one that was chosen draws two, at this depth and at every other.
    expect(trailControls(step('Tooling'), rows(7), 0)).toBe('parent-and-open-spaces-menu');
  });

  it('draws nothing at all in a session that has never crossed', () => {
    expect(trailControls(null, rows(1), 0)).toBe('none');
  });

  it('keeps the Open Spaces menu at the root, which is otherwise the one place with no way back', () => {
    // No parent step to spend a name on, so the Open Spaces menu arrives one Space
    // earlier than it does below the root.
    expect(trailControls(null, rows(2), 0)).toBe('open-spaces-menu');
  });

  it('leaves the Open Spaces menu off while the parent step already names the whole set', () => {
    expect(trailControls(step('Platform'), rows(2), 0)).toBe('parent');
  });

  it('discloses the Space after the ones the bar is already naming', () => {
    expect(trailControls(step('Platform'), rows(3), 0)).toBe('parent-and-open-spaces-menu');
  });

  /**
   * **A standing failure announces itself rather than waiting to be opened
   * (ADR 0082).**
   *
   * The one shape where the width argument and the report obligation disagree:
   * two Spaces open, the reader in the child, and the parent's commit failed.
   * The bar names the parent — so by the rule above the Open Spaces menu has
   * nothing left to disclose and is withheld — and the parent step draws a name
   * and no state. The mark and the count both ride on that trigger, so
   * withholding it withholds the only report the surface has: nothing on the
   * bar, and nothing behind a chevron either, because there is no chevron.
   *
   * The set is what the disclosure is *for*, and it is also where an unwell
   * member is named; the ADR binds both. So the width rule yields to the report
   * for as long as the report stands, and the bar goes back to two controls when
   * the Space recovers.
   */
  it('discloses the set when a Space the bar is not naming needs attention', () => {
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
    expect(trailControls(parent, open, unwellElsewhere(open, current))).toBe(
      'parent-and-open-spaces-menu',
    );
  });

  /**
   * And the Space the reader is *in* does not count, because it reports for
   * itself: its own `PersistenceNotice` is on this same bar with the recovery in
   * it, so a chevron opened for it would disclose a Space the reader is already
   * looking at.
   */
  it('leaves the disclosure off when the unwell Space is the one being read', () => {
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
    expect(trailControls(parent, open, unwellElsewhere(open, current))).toBe('parent');
  });
});
