import { describe, expect, it } from 'vitest';
import { uuidSchema, type UUID } from '@project/core';
import { openTree, type OpenSpaceRow } from '../src/dock-model';

/**
 * What `openTree` owes the Open Spaces menu, held as a pure function.
 *
 * This was the one claim `dock-session.test.ts` made that outlived the
 * stand-ins it also tested. `openTree` is production's (`App.tsx`), its two
 * obligations are derivation and totality, and neither is asserted by
 * `dock-trail.test.ts` — that file *supplies* `depth` as fixture input rather
 * than deriving it. The browser suite that draws the menu is `e2e:ladle`, which
 * neither `verify` nor `e2e` runs, so without this the derivation is checked by
 * nothing a developer runs before committing.
 */

const id = (n: number): UUID =>
  uuidSchema.parse(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);

const META = id(1);
const PLATFORM = id(2);
const RENDERING = id(3);
const TRAVERSAL = id(4);

const row = (spaceId: UUID, title: string, from: UUID | null): OpenSpaceRow => ({
  spaceId,
  title,
  from,
  persistence: { kind: 'settled' },
});

describe('the open-Spaces tree (ADR 0082)', () => {
  /**
   * The set is a tree and not a path: two Spaces opened off Meta both hang at
   * depth 1, and the one below Platform hangs under it rather than beside it.
   */
  it('derives each row depth from its opener, depth-first', () => {
    const rows = [
      row(META, 'Meta', null),
      row(PLATFORM, 'Platform', META),
      row(RENDERING, 'Rendering', PLATFORM),
      row(TRAVERSAL, 'Traversal', META),
    ];

    expect(openTree(rows, META).map((each) => [each.title, each.depth])).toEqual([
      ['Meta', 0],
      ['Platform', 1],
      ['Rendering', 2],
      ['Traversal', 1],
    ]);
  });

  /**
   * Siblings keep the order they were opened in. Nothing sorts them: a menu
   * that reordered itself as the reader moved would move the row they were
   * aiming at.
   */
  it('keeps siblings in the order the caller lists them', () => {
    const rows = [
      row(META, 'Meta', null),
      row(TRAVERSAL, 'Traversal', META),
      row(PLATFORM, 'Platform', META),
    ];

    expect(openTree(rows, META).map((each) => each.title)).toEqual([
      'Meta',
      'Traversal',
      'Platform',
    ]);
  });

  /**
   * **Totality is the invariant the doc comment names**, and it is Open Spaces
   * that keeps it: exiting a Space re-homes the rows below it onto its own
   * opener. Here Platform has exited and Rendering has been re-homed to Meta.
   * Drop that re-homing and Rendering is still open and absent from the only
   * list that leads back to it.
   */
  it('keeps every Space whose opener exited and was re-homed', () => {
    const rows = [
      row(META, 'Meta', null),
      row(RENDERING, 'Rendering', META),
      row(TRAVERSAL, 'Traversal', META),
    ];

    expect(openTree(rows, META).map((each) => [each.title, each.depth])).toEqual([
      ['Meta', 0],
      ['Rendering', 1],
      ['Traversal', 1],
    ]);
  });

  /**
   * **Meta tops the menu whoever opened it.** A Space Thing may target Meta, so
   * Meta can be Entered from Platform and record Platform as its Opener. Hung
   * by that Opener it drew under Platform, and a sort among the roots could not
   * reach it. It draws first at the root instead, with what was Entered from it
   * beneath, and Platform keeps its place after it.
   */
  it('draws Meta first at the root when it was Entered from another Space', () => {
    const rows = [
      row(PLATFORM, 'Platform', null),
      row(META, 'Meta', PLATFORM),
      row(TRAVERSAL, 'Traversal', META),
    ];

    expect(openTree(rows, META).map((each) => [each.title, each.depth])).toEqual([
      ['Meta', 0],
      ['Traversal', 1],
      ['Platform', 0],
    ]);
  });

  /** Meta first among the roots when it was opened directly after another Space. */
  it('draws Meta first when it was opened directly after another Space', () => {
    const rows = [row(PLATFORM, 'Platform', null), row(META, 'Meta', null)];

    expect(openTree(rows, META).map((each) => each.title)).toEqual(['Meta', 'Platform']);
  });

  /** A row whose opener is not in the list is not drawable, and is not drawn. */
  it('draws nothing for a row whose opener is absent', () => {
    expect(openTree([row(RENDERING, 'Rendering', PLATFORM)], META)).toEqual([]);
  });
});
