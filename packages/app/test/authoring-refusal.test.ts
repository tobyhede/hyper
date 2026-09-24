import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import {
  describeAuthoringRefusal,
  describePersistenceFailure,
  describeStoredSpaceRefusal,
  type PersistenceFailure,
} from '../src/authoring-refusal';
import type { AuthoringRefusal } from '../src/space-authoring';

const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const MISSING_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');

/** One sample of every AuthoringRefusal, keyed by code for exhaustive iteration. */
const EVERY_REFUSAL = {
  'map-not-found': { code: 'map-not-found' },
  'map-required': { code: 'map-required', operation: 'added-resource-to-map' },
  'resource-not-found': { code: 'resource-not-found' },
  'resource-kind-immutable': { code: 'resource-kind-immutable' },
  'reference-target-immutable': { code: 'reference-target-immutable' },
  'space-resource-target-immutable': { code: 'space-resource-target-immutable' },
  'resource-title-required': { code: 'resource-title-required' },
  'map-title-required': { code: 'map-title-required' },
  'space-title-required': { code: 'space-title-required' },
  'reference-target-not-found': { code: 'reference-target-not-found', targetId: TARGET_ID },
  'reference-target-must-own-content': {
    code: 'reference-target-must-own-content',
    targetId: TARGET_ID,
  },
  'resource-already-in-map': { code: 'resource-already-in-map' },
  'resource-not-in-map': { code: 'resource-not-in-map' },
  'resource-not-expanded': { code: 'resource-not-expanded' },
  'resource-has-references': { code: 'resource-has-references', referenceTitles: ['Recap'] },
  'graph-title-required': { code: 'graph-title-required' },
  'map-must-keep-graph': { code: 'map-must-keep-graph' },
  'space-must-keep-map': { code: 'space-must-keep-map' },
  'graph-not-owned': { code: 'graph-not-owned' },
  'edge-not-found': { code: 'edge-not-found' },
  'edge-resource-outside-map': { code: 'edge-resource-outside-map' },
  'edge-already-exists': { code: 'edge-already-exists' },
  'map-active-graph-required': { code: 'map-active-graph-required' },
  'space-resource-deletion-unsupported': { code: 'space-resource-deletion-unsupported' },
  'edge-title-one-line': { code: 'edge-title-one-line' },
  'edge-title-required': { code: 'edge-title-required' },
} as const satisfies Readonly<Record<AuthoringRefusal['code'], AuthoringRefusal>>;

describe('describeAuthoringRefusal', () => {
  it('preserves the placement strategy failure that prevented authoring', () => {
    expect(
      describeAuthoringRefusal({
        code: 'placement-failed',
        error: new Error('No position for Resource A'),
      }),
    ).toBe('This view could not place its Resources: No position for Resource A');
  });

  /** The Edge toolbar's one alert region has no field to fall back on. */
  it('writes one distinct sentence for every refusal', () => {
    const sentences = Object.values(EVERY_REFUSAL).map(describeAuthoringRefusal);
    for (const sentence of sentences) expect(sentence).toMatch(/\S/u);
    // `map-required` is sampled once, so its per-operation wording cannot collide.
    expect(new Set(sentences).size).toBe(sentences.length);
  });
});

/**
 * Persistence failures are refusals like any other (ADR 0057): the code is the
 * identity, and the sentence is the application's. A failure carries no prose
 * of the transport's to show instead — `problem.detail` stops at the wire.
 */
describe('describePersistenceFailure', () => {
  it('writes its own sentence for a forbidden rejection', () => {
    const description = describePersistenceFailure({
      kind: 'permanent-failure',
      code: 'forbidden',
    });

    expect(description).toBe('You do not have permission to save this space.');
  });

  /**
   * One sample of every persistence failure, keyed by code, on the same
   * precedent as `EVERY_REFUSAL` above: `satisfies` proves a sentence exists
   * for each code, not that it is reachable, distinct, or the right one.
   */
  const EVERY_FAILURE = {
    network: { kind: 'retryable-failure', code: 'network' },
    timeout: { kind: 'retryable-failure', code: 'timeout' },
    unavailable: { kind: 'retryable-failure', code: 'unavailable' },
    'rate-limited': { kind: 'retryable-failure', code: 'rate-limited' },
    'invalid-commit': { kind: 'permanent-failure', code: 'invalid-commit' },
    forbidden: { kind: 'permanent-failure', code: 'forbidden' },
    'payload-too-large': { kind: 'permanent-failure', code: 'payload-too-large' },
    protocol: {
      kind: 'permanent-failure',
      code: 'protocol',
      fault: { kind: 'revision-omitted', spaceId: TARGET_ID },
    },
  } as const satisfies Readonly<Record<PersistenceFailure['code'], PersistenceFailure>>;

  it('gives every code a sentence of its own', () => {
    const descriptions = Object.values(EVERY_FAILURE).map(describePersistenceFailure);

    for (const description of descriptions) {
      expect(description.length).toBeGreaterThan(0);
    }
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  /**
   * `protocol` is a bucket, and one of the conditions in it is actionable.
   * A commit over the server's size limit is not a disagreement about format:
   * the author can fix it by writing less, and the sentence has to say so or
   * the only instruction they had is gone.
   *
   * What it must not do is misdescribe the limit or the recovery. `MAX_COMMIT_
   * BODY_BYTES` is checked over the whole serialised snapshot, so a Space can
   * exceed it on Resource *count* with no long Resource anywhere — and the rejection
   * dialog offers only Continue editing, since `PersistenceNotice`, which owns
   * Retry, draws nothing for `rejected`.
   */
  it('tells an author over the size limit what to do about it', () => {
    const description = describePersistenceFailure({
      kind: 'permanent-failure',
      code: 'payload-too-large',
    });

    expect(description).toMatch(/large|size|limit/i);
    expect(description).not.toBe(
      'The application and the server disagree about how changes are saved.',
    );
    // Not one Resource: the limit is on the whole change.
    expect(description).not.toMatch(/\ba (long )?resource\b/i);
    // Not a retry: this dialog has no such control.
    expect(description).not.toMatch(/try again|retry/i);
  });
});

/**
 * Accepting the stored side of a conflict, refused.
 *
 * The invalid arm is the one place in this module that recites ids, and the
 * reason is that it is a diagnostic rather than an instruction. A stored Space
 * that fails intake is a repository producing a document that cannot load —
 * `persistence` depends on `graph` precisely so every committed snapshot passes
 * intake — so there is no authored correction to describe, and the id is the
 * only handle the author has for reporting it. Contrast the aggregate table
 * above, which names Spaces the author was just editing and can fix.
 */
describe('describeStoredSpaceRefusal', () => {
  it('tells an author whose Space was deleted what recovers it', () => {
    expect(describeStoredSpaceRefusal({ code: 'stored-space-deleted' })).toBe(
      'This Space was deleted while the coordinated edit was saving. Keep your local version to restore it.',
    );
  });

  /**
   * A shape or version failure names nothing: the document as a whole is what
   * failed, so there is no reference to recite and the sentence stands alone.
   */
  it('says only the sentence when no error carries an identity', () => {
    expect(
      describeStoredSpaceRefusal({
        code: 'stored-space-invalid',
        errors: [{ kind: 'invalid-shape', message: 'document is not an object' }],
      }),
    ).toBe('The remote space is invalid and was not accepted.');
  });

  /**
   * The recital is capped because the alert announces it.
   *
   * The point of naming a reference is to give the author one handle to report;
   * a `role="alert"` reading out dozens of UUIDs is the illegibility the
   * aggregate table above is written to avoid, arriving by another route.
   */
  it('caps how many references it recites and says how many it left out', () => {
    const errors = Array.from({ length: 7 }, (_, index) => ({
      kind: 'graph-edge-missing-resource' as const,
      ref: `00000000-0000-4000-8000-00000000000${index}`,
      message: 'graph edge references unknown resource',
    }));

    const description = describeStoredSpaceRefusal({ code: 'stored-space-invalid', errors });

    expect(description).toContain('00000000-0000-4000-8000-000000000000');
    expect(description).not.toContain('00000000-0000-4000-8000-000000000006');
    expect(description).toContain('4 more');
  });

  it('names the failing reference and not intake’s own prose', () => {
    const description = describeStoredSpaceRefusal({
      code: 'stored-space-invalid',
      errors: [
        {
          kind: 'graph-edge-missing-resource',
          ref: MISSING_RESOURCE_ID,
          message: 'graph edge references unknown resource',
        },
      ],
    });

    expect(description).toContain('The remote space is invalid and was not accepted');
    expect(description).toContain(MISSING_RESOURCE_ID);
    expect(description).not.toContain('graph edge references unknown resource');
  });
});
