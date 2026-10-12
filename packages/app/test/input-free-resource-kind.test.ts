import { describe, expect, it } from 'vitest';
import { newResourceDocument } from '@project/core';
import type { InputFreeResourceKind } from '../src/space-authoring';

/**
 * Every kind `InputFreeResourceKind` admits, written out so that widening the
 * type fails to compile here until the kind is listed: `created-resource`
 * completes and never refuses (docs/agents/authoring-refusal-cascade.md), so a
 * kind whose module declares no `newContent` must not reach it.
 */
const INPUT_FREE_KINDS = ['markdown', 'ur'] as const satisfies readonly InputFreeResourceKind[];
type Unlisted = Exclude<InputFreeResourceKind, (typeof INPUT_FREE_KINDS)[number]>;
const everyKindListed: [Unlisted] extends [never] ? true : false = true;

describe('a Resource created without input', () => {
  it('lists every kind the completion admits', () => {
    expect(everyKindListed).toBe(true);
  });

  it.each(INPUT_FREE_KINDS)('starts a %s Resource from its module’s empty content', (kind) => {
    expect(newResourceDocument(kind, 'Untitled')).toBeDefined();
  });
});
