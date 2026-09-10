import { describe, expect, it } from 'vitest';
import { openSpaceStatusLabel } from '@project/ui';
import { exitReportSentence, unwellReport, type ExitOutcome } from '../src/dock-model';

/**
 * What the Command Dock's Open Spaces menu says about an open Space that is not well.
 *
 * The Dock's Open Spaces menu is proposed to replace `OpenSpaces`, the vertical tab
 * strip that already badges each open Space for `conflicted`, `failed` and
 * `rejected`. Two surfaces reporting one state is a transitional fact, not a
 * design — so what they must not do is report it in *different words*, which is
 * how a reader learns that "Save failed" and "Changes not saved" are two
 * things.
 *
 * The test is against the shared label rather than against a literal, so the
 * wording stays one decision. Changing it changes both surfaces or neither.
 */
describe('the Command Dock reports an unwell Space', () => {
  it('in the same words as the open-Spaces strip it replaces', () => {
    expect(unwellReport({ kind: 'failed', failure: retryable })).toBe(
      openSpaceStatusLabel('failed'),
    );
    expect(unwellReport({ kind: 'rejected', failure: permanent })).toBe(
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
  message: 'The space could not be reached.',
} as const;

const permanent = {
  kind: 'permanent-failure',
  code: 'forbidden',
  message: 'Permission denied',
} as const;

/**
 * What an exit that did not happen owes the reader.
 *
 * ADR 0082 binds the surface to name *which* open Space is unwell, so a
 * refusal that draws nothing — which is what the prototype did, having invented
 * a Close that could not refuse — is not an option. There are three arms and
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

  it('says a different thing for each, including for each recovery', () => {
    const said = outcomes.map((outcome) => exitReportSentence('Rendering', outcome));

    expect(new Set(said).size).toBe(outcomes.length);
  });
});
