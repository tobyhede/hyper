import { describe, expect, it } from 'vitest';
import { resourceDocumentSchema, resourceFileSchema, resourceSchema } from '../src/index';

/**
 * A Resource that fails both its envelope and its kind is refused with every
 * failure at once, so an author fixing a file sees all of them in one pass
 * rather than one envelope error hiding the kind's.
 */
const RESOURCE_ID = '00000000-0000-4000-8000-000000000001';

const failedPaths = (result: { success: boolean; error?: { issues: { path: unknown[] }[] } }) =>
  (result.error?.issues ?? []).map((issue) => issue.path.join('.'));

describe('a Resource failing its envelope and its kind', () => {
  it('reports a Resource file key the envelope refuses and a content key its kind refuses', () => {
    const result = resourceFileSchema.safeParse({
      id: RESOURCE_ID,
      title: 'A',
      kind: 'ur',
      content: { bad: 1 },
      extra: 1,
    });

    expect(result.success).toBe(false);
    expect(failedPaths(result)).toEqual(expect.arrayContaining(['', 'content']));
  });

  it('reports a stored document whose title is empty and whose kind no module registers', () => {
    const result = resourceDocumentSchema.safeParse({ title: '', kind: 'nope', content: {} });

    expect(result.success).toBe(false);
    expect(failedPaths(result)).toEqual(expect.arrayContaining(['title', 'kind']));
  });

  it('reports a Resource whose id is malformed and whose content its kind refuses', () => {
    const result = resourceSchema.safeParse({
      id: 'not-a-uuid',
      title: 'A',
      kind: 'ur',
      content: { bad: 1 },
    });

    expect(result.success).toBe(false);
    expect(failedPaths(result)).toEqual(expect.arrayContaining(['id', 'content']));
  });
});
