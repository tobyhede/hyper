import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import {
  describeAuthoringRefusal,
  describePersistenceFailure,
  describeStoredSpaceRefusal,
  type PersistenceFailure,
  presentEdgeDeletionRefusal,
  presentEdgeEndpointRefusal,
  presentNewAliasRefusal,
} from '../src/authoring-refusal';
import type { AuthoringRefusal } from '../src/space-authoring';

const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const MISSING_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');

/** One transport sentence, so any copy that leaked it is visible as a collision. */
const WIRE = 'the transport said this';

/** One sample of every AuthoringRefusal, keyed by code for exhaustive iteration. */
const EVERY_REFUSAL = {
  'placement-pending': { code: 'placement-pending' },
  'diagram-not-found': { code: 'diagram-not-found' },
  'diagram-required': { code: 'diagram-required', operation: 'added-card-to-diagram' },
  'card-not-found': { code: 'card-not-found' },
  'card-kind-immutable': { code: 'card-kind-immutable' },
  'alias-target-immutable': { code: 'alias-target-immutable' },
  'space-card-target-immutable': { code: 'space-card-target-immutable' },
  'card-title-required': { code: 'card-title-required' },
  'diagram-title-required': { code: 'diagram-title-required' },
  'alias-target-not-found': { code: 'alias-target-not-found', targetId: TARGET_ID },
  'alias-target-must-own-content': { code: 'alias-target-must-own-content', targetId: TARGET_ID },
  'card-already-in-diagram': { code: 'card-already-in-diagram' },
  'card-not-in-diagram': { code: 'card-not-in-diagram' },
  'card-not-expanded': { code: 'card-not-expanded' },
  'card-has-aliases': { code: 'card-has-aliases', aliasTitles: ['Recap'] },
  'graph-title-required': { code: 'graph-title-required' },
  'diagram-must-keep-graph': { code: 'diagram-must-keep-graph' },
  'space-must-keep-diagram': { code: 'space-must-keep-diagram' },
  'graph-not-owned': { code: 'graph-not-owned' },
  'edge-not-found': { code: 'edge-not-found' },
  'edge-card-outside-diagram': { code: 'edge-card-outside-diagram' },
  'edge-already-exists': { code: 'edge-already-exists' },
  'diagram-active-graph-required': { code: 'diagram-active-graph-required' },
  'space-card-deletion-unsupported': { code: 'space-card-deletion-unsupported' },
} as const satisfies Readonly<Record<AuthoringRefusal['code'], AuthoringRefusal>>;

/**
 * The New Alias pane owns two fields and nothing else, so every refusal it can
 * be handed lands on the Title, on the Target, or on the form.
 *
 * The two lists are written out rather than read from `titleAndTargetPlacements`
 * — a test that consults the same table the code does agrees with it by
 * construction and can never disagree. What they say is which refusals are
 * *about a field the author can reach*: an empty Title is the Title's, a Target
 * that does not resolve or owns no content is the Target's. Everything else,
 * `alias-target-immutable` included, is the form's — an Alias created here has
 * no Target to keep, so that refusal names no field on this pane.
 */
describe('New Alias creation places every refusal on the field that owns it', () => {
  const onTheTitle: readonly AuthoringRefusal['code'][] = ['card-title-required'];
  const onTheTarget: readonly AuthoringRefusal['code'][] = [
    'alias-target-not-found',
    'alias-target-must-own-content',
  ];

  it.each(Object.values(EVERY_REFUSAL))('for $code', (refusal) => {
    const errors = presentNewAliasRefusal(refusal);
    const message = describeAuthoringRefusal(refusal);

    if (onTheTitle.includes(refusal.code)) {
      expect(errors).toEqual({ fields: { title: message } });
      return;
    }
    if (onTheTarget.includes(refusal.code)) {
      expect(errors).toEqual({ fields: { target: message } });
      return;
    }
    expect(errors).toEqual({ fields: {}, form: message });
  });
});

describe('describeAuthoringRefusal', () => {
  it('preserves the placement strategy failure that prevented authoring', () => {
    expect(
      describeAuthoringRefusal({
        code: 'placement-failed',
        error: new Error('No position for Card A'),
      }),
    ).toBe('This view could not place its Cards: No position for Card A');
  });
});

/**
 * The three Edge surfaces, and the one rule that separates their channels.
 *
 * A refusal a different endpoint or target could correct belongs on the field
 * that names it; a stale Diagram, Graph or Edge belongs on the form, because no
 * choice in the picker would answer it (ADR 0057).
 */
const CORRECTABLE_BY_CHOOSING_ANOTHER_CARD = [
  'edge-card-outside-diagram',
  'edge-already-exists',
] as const;

/** The same list, widened once so the loops below can ask it about any code. */
const correctable: ReadonlySet<string> = new Set(CORRECTABLE_BY_CHOOSING_ANOTHER_CARD);

describe('presentEdgeEndpointRefusal', () => {
  it.each(['from', 'to'] as const)('marks only the attempted %s Field invalid', (endpoint) => {
    for (const code of CORRECTABLE_BY_CHOOSING_ANOTHER_CARD) {
      const refusal = EVERY_REFUSAL[code];
      expect(presentEdgeEndpointRefusal(refusal, endpoint)).toEqual({
        fields: { [endpoint]: describeAuthoringRefusal(refusal) },
      });
    }
  });

  it.each(['from', 'to'] as const)(
    'leaves both Fields valid for a refusal no endpoint can correct, from %s',
    (endpoint) => {
      for (const [code, refusal] of Object.entries(EVERY_REFUSAL)) {
        if (correctable.has(code)) continue;
        const errors = presentEdgeEndpointRefusal(refusal, endpoint);
        expect(errors.fields).toEqual({});
        expect(errors.form).toBe(describeAuthoringRefusal(refusal));
      }
    },
  );
});

describe('presentEdgeDeletionRefusal', () => {
  it('owns a form channel and no field, because Delete names no field to correct', () => {
    for (const refusal of Object.values(EVERY_REFUSAL)) {
      expect(presentEdgeDeletionRefusal(refusal)).toEqual({
        fields: {},
        form: describeAuthoringRefusal(refusal),
      });
    }
  });
});

/**
 * Persistence failures are refusals like any other (ADR 0057): the code is the
 * identity, and the sentence is the application's. The `message` each one
 * carries is the transport's — `problem.detail` off the wire, or a thrown
 * `Error`'s own text — and it is deliberately not what the author reads.
 */
describe('describePersistenceFailure', () => {
  it('writes its own sentence for a forbidden rejection rather than the wire’s', () => {
    const description = describePersistenceFailure({
      kind: 'permanent-failure',
      code: 'forbidden',
      message: 'Permission denied',
    });

    expect(description).not.toBe('Permission denied');
    expect(description).toBe('You do not have permission to save this space.');
  });

  /**
   * One sample of every persistence failure, keyed by code, on the same
   * precedent as `EVERY_REFUSAL` above: `satisfies` proves a sentence exists
   * for each code, not that it is reachable, distinct, or the right one.
   *
   * Every `message` here is deliberately the same string, so a sentence that
   * leaked the transport's prose would collapse the distinctness assertion
   * rather than passing quietly.
   */
  const EVERY_FAILURE = {
    network: { kind: 'retryable-failure', code: 'network', message: WIRE },
    timeout: { kind: 'retryable-failure', code: 'timeout', message: WIRE },
    unavailable: { kind: 'retryable-failure', code: 'unavailable', message: WIRE },
    'rate-limited': { kind: 'retryable-failure', code: 'rate-limited', message: WIRE },
    'invalid-commit': { kind: 'permanent-failure', code: 'invalid-commit', message: WIRE },
    forbidden: { kind: 'permanent-failure', code: 'forbidden', message: WIRE },
    'payload-too-large': { kind: 'permanent-failure', code: 'payload-too-large', message: WIRE },
    protocol: { kind: 'permanent-failure', code: 'protocol', message: WIRE },
  } as const satisfies Readonly<Record<PersistenceFailure['code'], PersistenceFailure>>;

  it('gives every code a sentence of its own, and none of them the wire’s', () => {
    const descriptions = Object.values(EVERY_FAILURE).map(describePersistenceFailure);

    for (const description of descriptions) {
      expect(description).not.toBe(WIRE);
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
   * exceed it on Card *count* with no long Card anywhere — and the rejection
   * dialog offers only Continue editing, since `PersistenceNotice`, which owns
   * Retry, draws nothing for `rejected`.
   */
  it('tells an author over the size limit what to do about it', () => {
    const description = describePersistenceFailure({
      kind: 'permanent-failure',
      code: 'payload-too-large',
      message: 'Send a request body no larger than 1048576 bytes.',
    });

    expect(description).toMatch(/large|size|limit/i);
    expect(description).not.toBe(
      'The application and the server disagree about how changes are saved.',
    );
    // Not one Card: the limit is on the whole change.
    expect(description).not.toMatch(/\ba (long )?card\b/i);
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
      kind: 'graph-edge-missing-card' as const,
      ref: `00000000-0000-4000-8000-00000000000${index}`,
      message: 'graph edge references unknown card',
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
          kind: 'graph-edge-missing-card',
          ref: MISSING_CARD_ID,
          message: 'graph edge references unknown card',
        },
      ],
    });

    expect(description).toContain('The remote space is invalid and was not accepted');
    expect(description).toContain(MISSING_CARD_ID);
    expect(description).not.toContain('graph edge references unknown card');
  });
});
