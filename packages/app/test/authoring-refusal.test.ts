import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import {
  describeAuthoringRefusal,
  presentAliasCardRefusal,
  presentMarkdownCardRefusal,
  presentNewAliasRefusal,
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
  'card-title-required': { code: 'card-title-required' },
  'alias-target-not-found': { code: 'alias-target-not-found', targetId: TARGET_ID },
  'alias-target-must-own-content': { code: 'alias-target-must-own-content', targetId: TARGET_ID },
  'card-already-in-layout': { code: 'card-already-in-layout' },
  'card-not-in-layout': { code: 'card-not-in-layout' },
  'card-has-aliases': { code: 'card-has-aliases', aliasTitles: ['Recap'] },
  'graph-title-required': { code: 'graph-title-required' },
  'layout-must-keep-graph': { code: 'layout-must-keep-graph' },
  'graph-not-owned': { code: 'graph-not-owned' },
  'edge-not-found': { code: 'edge-not-found' },
  'edge-card-outside-layout': { code: 'edge-card-outside-layout' },
  'edge-already-exists': { code: 'edge-already-exists' },
  'layout-active-graph-required': { code: 'layout-active-graph-required' },
} as const satisfies Readonly<Record<AuthoringRefusal['code'], AuthoringRefusal>>;

describe('Alias Card editing and New Alias creation place every refusal identically', () => {
  it.each(Object.values(EVERY_REFUSAL))('for $code', (refusal) => {
    expect(presentAliasCardRefusal(refusal)).toEqual(presentNewAliasRefusal(refusal));
  });
});

describe('presentMarkdownCardRefusal', () => {
  it('attaches a title refusal to the title field and nothing else', () => {
    expect(presentMarkdownCardRefusal({ code: 'card-title-required' })).toEqual({
      fields: { title: 'A Card title is required.' },
    });
  });

  it('routes every other refusal to the form, since Markdown editing owns no other field', () => {
    for (const [code, refusal] of Object.entries(EVERY_REFUSAL)) {
      if (code === 'card-title-required') continue;
      const errors = presentMarkdownCardRefusal(refusal);
      expect(errors.fields).toEqual({});
      expect(errors.form).toBe(describeAuthoringRefusal(refusal));
    }
  });
});
