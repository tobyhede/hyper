import { describe, expect, it } from 'vitest';
import { newUuid } from '@project/core';
import { trailControls, type OpenRow, type SpaceStep } from '../stories/review/dock-model';

const step = (title: string): SpaceStep => ({ spaceId: newUuid(), title });

const rows = (count: number): readonly OpenRow[] =>
  Array.from({ length: count }, (_, index) => ({
    spaceId: newUuid(),
    title: `Space ${index + 1}`,
    depth: index,
    persistence: { kind: 'settled' },
  }));

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
    expect(trailControls(step('Tooling'), rows(7))).toBe('parent-and-open-spaces-menu');
  });

  it('draws nothing at all in a session that has never crossed', () => {
    expect(trailControls(null, rows(1))).toBe('none');
  });

  it('keeps the Open Spaces menu at the root, which is otherwise the one place with no way back', () => {
    // No parent step to spend a name on, so the Open Spaces menu arrives one Space
    // earlier than it does below the root.
    expect(trailControls(null, rows(2))).toBe('open-spaces-menu');
  });

  it('leaves the Open Spaces menu off while the parent step already names the whole set', () => {
    expect(trailControls(step('Platform'), rows(2))).toBe('parent');
  });

  it('discloses the Space after the ones the bar is already naming', () => {
    expect(trailControls(step('Platform'), rows(3))).toBe('parent-and-open-spaces-menu');
  });
});
