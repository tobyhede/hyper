import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { openSpaceStatusLabel } from '@project/ui';
import {
  exitReportSentence,
  openSpacesName,
  unwellReport,
  type ExitOutcome,
} from '../src/dock-model';

/**
 * What the Command Dock's Open Spaces menu says about an open Space that is not well.
 *
 * The test runs against the shared label rather than against a literal.
 * `openSpaceStatusLabel` is where the wording is decided, and holding the menu
 * to it is what keeps a literal from being typed here the next time someone
 * edits a row.
 */
describe('the Command Dock reports an unwell Space', () => {
  it('in the words `openSpaceStatusLabel` decides', () => {
    expect(unwellReport({ kind: 'failed', failure: retryable })).toBe(
      openSpaceStatusLabel('failed'),
    );
    expect(unwellReport({ kind: 'rejected', failure: permanent })).toBe(
      openSpaceStatusLabel('rejected'),
    );
    // A refused aggregate is a distinct persistence state from a permanent
    // rejection, reported with the same word: both mean the
    // server declined this Space's last commit and only a further Edit
    // recovers it.
    expect(unwellReport({ kind: 'refused', failure: refused })).toBe(
      openSpaceStatusLabel('rejected'),
    );
    expect(unwellReport({ kind: 'conflicted', current: undefined, baseline: undefined })).toBe(
      openSpaceStatusLabel('conflicted'),
    );
  });
});

const retryable = {
  kind: 'retryable-failure',
  code: 'network',
} as const;

const permanent = {
  kind: 'permanent-failure',
  code: 'forbidden',
} as const;

const refused = {
  kind: 'aggregate-refused',
  errors: [
    {
      kind: 'ordinary-space-unreferenced',
      spaceId: uuidSchema.parse('00000000-0000-4000-8000-000000000001'),
    },
  ],
} as const;

/**
 * What an exit that did not happen owes the reader.
 *
 * ADR 0082 binds the surface to name *which* open Space is unwell, so a
 * refusal that draws nothing is not an option. There are three arms and
 * four sentences, because `persistence-recovery-required` names two different
 * recoveries and a reader told "resolve the conflict" when the fix is Retry has
 * been sent to the wrong control.
 */
describe('what the Command Dock says when an exit does not happen', () => {
  const outcomes: readonly ExitOutcome[] = [
    { kind: 'warning', warning: 'persistence-rejected' },
    { kind: 'refused', refusal: { code: 'meta-space-permanent' } },
    { kind: 'refused', refusal: { code: 'persistence-recovery-required', recovery: 'retry' } },
    {
      kind: 'refused',
      refusal: { code: 'persistence-recovery-required', recovery: 'resolve-conflict' },
    },
  ];

  it('names the Space it is about, in every arm', () => {
    for (const outcome of outcomes) {
      expect(exitReportSentence('Rendering', outcome)).toContain('Rendering');
    }
  });

  it('says a different resource for each, including for each recovery', () => {
    const said = outcomes.map((outcome) => exitReportSentence('Rendering', outcome));

    expect(new Set(said).size).toBe(outcomes.length);
  });
});

/**
 * **The Open Spaces trigger's accessible name, which is where the count lives.**
 *
 * The mark on the trigger is a glyph, and a glyph is colour and shape — so the
 * count joins the *name* rather than riding on the mark alone, and a reader who
 * never opens the menu is still told how much is wrong. That makes the sentence
 * something a screen reader speaks in full, and a number agreeing with its verb
 * is the difference between a sentence and a template.
 *
 * The visible word is shared rather than spelled here, for the reason the
 * component states: the name has to *contain* the label on the trigger's face
 * (WCAG 2.5.3), and two copies of a word is a pair that comes apart the first
 * time one is edited.
 */
describe("the Open Spaces trigger's name", () => {
  it('says nothing about attention while every open Space is well', () => {
    expect(openSpacesName(3, 0)).toBe('Spaces. 3 open.');
  });

  it('agrees with its count', () => {
    expect(openSpacesName(2, 1)).toBe('Spaces. 2 open, 1 needs attention.');
    expect(openSpacesName(3, 2)).toBe('Spaces. 3 open, 2 need attention.');
  });
});
