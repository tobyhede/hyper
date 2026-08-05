import { describe, expect, it } from 'vitest';
import { PostgresSpaceRepository } from '../../src/persistence/postgres-space-repository';

/**
 * `importSpaces` decodes its whole batch before it opens a transaction, so this
 * half of the adapter is reachable — and worth pinning — without a database.
 * Nothing here touches the connection the constructor is handed.
 *
 * What is pinned is the shape of the rejection a client reads. The message
 * travels to the CLI's stderr and, through `rejectInvalidSnapshot`, into the
 * `{ message: string }` HTTP error contract: a field rendered as a sentence.
 * Zod's `error.message` is its entire serialized issue array — a JSON document
 * nested inside that field — which is what "a wire codec throws prose, not Zod"
 * forbids. Pin the shape, not Zod's wording, which is version-dependent.
 */
describe('PostgresSpaceRepository import decoding', () => {
  const repository = new PostgresSpaceRepository();

  it('rejects a malformed import with prose rather than a serialized Zod dump', async () => {
    const result = await repository.importSpaces(
      [{ document: { version: 2, title: 7, routes: [] }, cards: [] } as never],
      'insert',
    );

    expect(result).toMatchObject({ kind: 'rejected', code: 'invalid-snapshot' });
    const message = result.kind === 'rejected' ? result.message : '';
    expect(message.startsWith('[')).toBe(false);
    expect(() => JSON.parse(message) as unknown).toThrow();
    expect(message).toMatch(/^import space is invalid: document\.title \S/);
  });

  it('summarises a long issue list instead of listing every one of them', async () => {
    const result = await repository.importSpaces(
      [
        {
          document: { version: 9, title: 7, routes: 'no', layouts: 4 },
          cards: [{ document: { title: 5, kind: 'nope', body: 3 } }],
        } as never,
      ],
      'insert',
    );

    expect(result).toMatchObject({ kind: 'rejected', code: 'invalid-snapshot' });
    const message = result.kind === 'rejected' ? result.message : '';
    expect(message.split('; ')).toHaveLength(3);
    expect(message).toMatch(/\(and \d+ more\)$/);
  });
});
