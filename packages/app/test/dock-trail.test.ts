import { describe, expect, it } from 'vitest';
import { newUuid } from '@project/core';
import { openCount, unwellElsewhere } from '../src/dock-model';
import type { ListingRow, NamedSpace, OpenListingRow } from '../src/open-spaces';

const named = (title: string): NamedSpace => ({ spaceId: newUuid(), title });

/** A commit that failed on one of the open Spaces, which is the least of the three unwell states. */
const failedOn = (listing: readonly OpenListingRow[], spaceId: string): readonly OpenListingRow[] =>
  listing.map((row) =>
    row.spaceId === spaceId
      ? {
          ...row,
          persistence: {
            kind: 'failed' as const,
            failure: {
              kind: 'retryable-failure' as const,
              code: 'network' as const,
            },
          },
        }
      : row,
  );

/** Which open Spaces the Open Spaces trigger's dot and count report. */
describe('the unwell Spaces the Open Spaces trigger reports', () => {
  /**
   * **A standing failure announces itself rather than waiting to be opened
   * (ADR 0082)**, so an Opener whose commit failed is counted even while the
   * Opener control is already naming it.
   */
  it('counts a Space the bar is not naming that needs attention', () => {
    const current = newUuid();
    const opener = named('Design system');
    const listing: readonly OpenListingRow[] = failedOn(
      [
        {
          spaceId: opener.spaceId,
          title: opener.title,
          depth: 0,
          open: true,
          persistence: { kind: 'settled' },
        },
        {
          spaceId: current,
          title: 'Rendering',
          depth: 1,
          open: true,
          persistence: { kind: 'settled' },
        },
      ],
      opener.spaceId,
    );

    expect(unwellElsewhere(listing, current)).toBe(1);
  });

  /**
   * And the Space the reader is *in* does not count, because it reports for
   * itself: its own `PersistenceNotice` is on this same bar with the recovery in
   * it, so a chevron opened for it would disclose a Space the reader is already
   * looking at.
   */
  it('does not count the unwell Space that is the one being read', () => {
    const current = newUuid();
    const opener = named('Design system');
    const listing: readonly OpenListingRow[] = failedOn(
      [
        {
          spaceId: opener.spaceId,
          title: opener.title,
          depth: 0,
          open: true,
          persistence: { kind: 'settled' },
        },
        {
          spaceId: current,
          title: 'Rendering',
          depth: 1,
          open: true,
          persistence: { kind: 'settled' },
        },
      ],
      current,
    );

    expect(unwellElsewhere(listing, current)).toBe(0);
  });

  /**
   * The closed Meta row carries no `persistence` to be unwell about, and it
   * cannot be the Space being read either — so it is excluded by construction
   * rather than by a check either function has to make
   * (`.scratch/command-dock/issues/28`, decision 3).
   */
  it('does not count a closed Meta row', () => {
    const current = newUuid();
    const meta = named('Meta');
    const listing: readonly ListingRow[] = [
      { spaceId: meta.spaceId, title: meta.title, depth: 0, open: false },
      {
        spaceId: current,
        title: 'Rendering',
        depth: 0,
        open: true,
        persistence: { kind: 'settled' },
      },
    ];

    expect(unwellElsewhere(listing, current)).toBe(0);
  });
});

describe('how many rows of the listing are open', () => {
  it('excludes the closed Meta row from the count', () => {
    const meta = named('Meta');
    const listing: readonly ListingRow[] = [
      { spaceId: meta.spaceId, title: meta.title, depth: 0, open: false },
      {
        spaceId: newUuid(),
        title: 'New space',
        depth: 0,
        open: true,
        persistence: { kind: 'settled' },
      },
    ];

    expect(openCount(listing)).toBe(1);
  });

  it('counts every row once Meta is open too', () => {
    const listing: readonly ListingRow[] = [
      { spaceId: newUuid(), title: 'Meta', depth: 0, open: true, persistence: { kind: 'settled' } },
      {
        spaceId: newUuid(),
        title: 'Platform',
        depth: 1,
        open: true,
        persistence: { kind: 'settled' },
      },
    ];

    expect(openCount(listing)).toBe(2);
  });
});
