import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import {
  describeAuthoringRefusal,
  presentEdgeDeletionRefusal,
  presentEdgeEndpointRefusal,
} from '../src/authoring-refusal';
import type { AuthoringRefusal } from '../src/space-authoring';

const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');

/** One sample of every AuthoringRefusal, keyed by code for exhaustive iteration. */
const EVERY_REFUSAL = {
  'placement-pending': { code: 'placement-pending' },
  'layout-not-found': { code: 'layout-not-found' },
  'layout-required': { code: 'layout-required', operation: 'added-card-to-layout' },
  'card-not-found': { code: 'card-not-found' },
  'card-kind-immutable': { code: 'card-kind-immutable' },
  'alias-target-immutable': { code: 'alias-target-immutable' },
  'card-title-required': { code: 'card-title-required' },
  'layout-title-required': { code: 'layout-title-required' },
  'alias-target-not-found': { code: 'alias-target-not-found', targetId: TARGET_ID },
  'alias-target-must-own-content': { code: 'alias-target-must-own-content', targetId: TARGET_ID },
  'card-already-in-layout': { code: 'card-already-in-layout' },
  'card-not-in-layout': { code: 'card-not-in-layout' },
  'card-not-expanded': { code: 'card-not-expanded' },
  'card-has-aliases': { code: 'card-has-aliases', aliasTitles: ['Recap'] },
  'graph-title-required': { code: 'graph-title-required' },
  'layout-must-keep-graph': { code: 'layout-must-keep-graph' },
  'graph-not-owned': { code: 'graph-not-owned' },
  'edge-not-found': { code: 'edge-not-found' },
  'edge-card-outside-layout': { code: 'edge-card-outside-layout' },
  'edge-already-exists': { code: 'edge-already-exists' },
  'layout-active-graph-required': { code: 'layout-active-graph-required' },
} as const satisfies Readonly<Record<AuthoringRefusal['code'], AuthoringRefusal>>;

/**
 * The three Edge surfaces, and the one rule that separates their channels.
 *
 * A refusal a different endpoint or target could correct belongs on the field
 * that names it; a stale Layout, Graph or Edge belongs on the form, because no
 * choice in the picker would answer it (ADR 0057).
 */
const CORRECTABLE_BY_CHOOSING_ANOTHER_CARD = [
  'edge-card-outside-layout',
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
