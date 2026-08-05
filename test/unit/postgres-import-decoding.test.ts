import {
  aliasCardFrontmatterSchema,
  importSpaceSchema,
  markdownCardFrontmatterSchema,
  spaceSnapshotSchema,
} from '@project/core';
import { decodeCommitRequest } from '@project/persistence';
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

  const SPACE_ID = '11111111-1111-4111-8111-111111111111';
  const CARD_ID = '22222222-2222-4222-8222-222222222222';

  /** The rejection message the CLI prints for a batch of one malformed Space. */
  const cliMessage = async (input: unknown): Promise<string> => {
    const result = await repository.importSpaces([input as never], 'insert');
    expect(result).toMatchObject({ kind: 'rejected', code: 'invalid-snapshot' });
    return result.kind === 'rejected' ? result.message : '';
  };

  /** The same failure as the wire sees it, through the commit-request codec. */
  const wireMessage = (snapshot: unknown): string => {
    try {
      decodeCommitRequest({ snapshot, expectedRevision: '0' });
    } catch (error) {
      return error instanceof Error ? error.message : '';
    }
    return '';
  };

  /** Everything after the label — the part the two are held to character for character. */
  const summaryOf = (message: string): string | undefined => message.split(' is invalid: ')[1];

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

  /**
   * Two functions format that summary — `describeSchemaFailure` here and
   * `decodeSnapshot` in `packages/persistence/src/http-protocol.ts` — because
   * sharing one would export a string formatter from a browser-safe package for
   * a single server-side caller. The duplication is the deliberate half; the
   * drift is not, and nothing but this stops the CLI and the wire describing one
   * failure two ways.
   *
   * The document below is built to fail *identically* under both schemas: every
   * id it carries is present and valid, so the one place `importSpaceSchema` and
   * `spaceSnapshotSchema` differ — whether an id may be omitted — is out of
   * play, and the two summarisers are handed the same issue list. It is also an
   * object, so every issue has a path and neither reaches for its root-path
   * placeholder — `space` here, `snapshot` there. Those, like the label, name the
   * value each function was given, and are the only words allowed to differ.
   */
  it('describes one malformed document the same way for the CLI and for the wire', async () => {
    const malformed = {
      id: SPACE_ID,
      document: { version: 9, title: 7, routes: 'no', layouts: 4 },
      cards: [{ id: CARD_ID, document: { title: 5, kind: 'nope', body: 3 } }],
    };

    const cli = await cliMessage(malformed);
    const wire = wireMessage(malformed);

    expect(summaryOf(cli)).toBeDefined();
    expect(summaryOf(cli)).toBe(summaryOf(wire));
  });

  /**
   * Four documents chosen for how many paths fail, not for what fails: one,
   * three, four and five. Three is the most the summary shows, so it is the last
   * count with nothing left to say; four is the first the tail counts. Each is
   * built like the document above — every id present and valid — so the two
   * schemas hand their summariser the same issue list and the CLI and the wire
   * can be held to the same string at each boundary.
   */
  const documentFailingIn = (paths: 1 | 3 | 4 | 5): unknown => ({
    id: SPACE_ID,
    document: {
      version: paths === 1 ? 2 : 9,
      title: 7,
      routes: paths === 1 ? [] : 'no',
      ...(paths >= 4 ? { layouts: 4 } : {}),
    },
    cards: paths >= 5 ? [{ id: CARD_ID, document: { title: 5, kind: 'nope', body: 3 } }] : [],
  });

  it('shows all three failing paths at three, and counts no remainder', async () => {
    const cli = await cliMessage(documentFailingIn(3));

    expect(summaryOf(cli)?.split('; ')).toHaveLength(3);
    expect(cli).not.toMatch(/more\)/);
    expect(summaryOf(cli)).toBe(summaryOf(wireMessage(documentFailingIn(3))));
  });

  it('counts the fourth failing path as one, and the fifth as two', async () => {
    const four = await cliMessage(documentFailingIn(4));
    const five = await cliMessage(documentFailingIn(5));

    expect(four).toMatch(/\(and 1 more\)$/);
    expect(five).toMatch(/\(and 2 more\)$/);
    expect(summaryOf(four)).toBe(summaryOf(wireMessage(documentFailingIn(4))));
    expect(summaryOf(five)).toBe(summaryOf(wireMessage(documentFailingIn(5))));
  });

  /**
   * The degenerate renders the `issues.length - 3` arithmetic could produce if it
   * were ever handed fewer issues than it slices: a summary with nothing after
   * the colon, or a negative remainder. Neither is reachable — a failed
   * `safeParse` always carries at least one issue, because Zod's `handleResult`
   * throws `Validation failed but no issues detected.` rather than returning a
   * zero-issue error — so this pins the render across the counts that *are*
   * reachable, including the single-issue one below three.
   */
  it('always names a failing path and never counts a negative remainder', async () => {
    for (const paths of [1, 3, 4, 5] as const) {
      const cli = await cliMessage(documentFailingIn(paths));
      const wire = wireMessage(documentFailingIn(paths));

      expect(cli).toMatch(/ is invalid: \S/);
      expect(wire).toMatch(/ is invalid: \S/);
      expect(cli).not.toMatch(/\(and -/);
      expect(summaryOf(cli)).toBe(summaryOf(wire));
    }
  });

  /**
   * Both summarisers case-fold Zod's sentence (`issue.message.toLowerCase()`) so
   * it reads as a clause after the path. That is safe only while no message
   * carries a word whose case is information, and this is the check that it does
   * not: no acronym, and no quoted identifier with a capital in it.
   *
   * Zod's wording is deliberately not pinned here — it is version-dependent, and
   * the rest of this file pins our shape rather than its prose. What is pinned is
   * the *precondition* for folding it. Zod 3.25.76 writes "Invalid uuid", not
   * "Invalid UUID"; the day it capitalises that, or the day a schema literal in
   * `@project/core` gains a capital and turns up quoted in a discriminator
   * message, this goes red and the fold has to become first-character-only.
   */
  it('folds no acronym and no capitalised identifier out of a Zod message', () => {
    const malformed: readonly unknown[] = [
      // A bad UUID, in each position one can occupy.
      { id: 'not-a-uuid', document: { version: 2, title: 'T', routes: [] }, cards: [] },
      {
        id: SPACE_ID,
        document: { version: 2, title: 'T', routes: [] },
        cards: [{ id: 'nope', document: { title: 'C', kind: 'markdown', body: '' } }],
      },
      {
        id: SPACE_ID,
        document: {
          version: 2,
          title: 'T',
          routes: [{ id: SPACE_ID, title: 'R', edges: [{ from: 'x', to: 'y' }] }],
        },
        cards: [],
      },
      // A bad literal version, and wrong-typed fields.
      { id: SPACE_ID, document: { version: 9, title: 'T', routes: [] }, cards: [] },
      { id: SPACE_ID, document: { version: 2, title: 7, routes: 'no', layouts: 4 }, cards: [] },
      // Discriminated-union failures, on a card's kind and on a layout's.
      {
        id: SPACE_ID,
        document: { version: 2, title: 'T', routes: [] },
        cards: [{ id: CARD_ID, document: { title: 'C', kind: 'Nope', body: '' } }],
      },
      {
        id: SPACE_ID,
        document: {
          version: 2,
          title: 'T',
          routes: [],
          layouts: [{ id: SPACE_ID, title: 'L', kind: 'Weird', positions: {} }],
        },
        cards: [],
      },
      // The bounded strings, the refinement, and the one union that is not
      // discriminated — each writes a different sentence.
      { id: SPACE_ID, document: { version: 2, title: '', routes: [] }, cards: [] },
      {
        id: SPACE_ID,
        document: { version: 2, title: 'T', routes: [] },
        cards: [
          {
            id: CARD_ID,
            document: { title: 'C', kind: 'markdown', body: '', description: 'a\nb' },
          },
          {
            id: CARD_ID,
            document: { title: 'C', kind: 'markdown', body: '', description: 'x'.repeat(200) },
          },
        ],
      },
      {
        id: SPACE_ID,
        document: { version: 2, title: 'T', routes: [], defaultView: 'GraphView' },
        cards: [],
      },
      { id: SPACE_ID, document: { version: 2, title: 'T', routes: [], defaultView: 7 }, cards: [] },
      // And the root-path renders, where neither schema sees an object at all.
      'nope',
      42,
      null,
      [],
    ];

    const messagesOf = (parsed: {
      readonly success: boolean;
      readonly error?: { readonly issues: readonly { readonly message: string }[] };
    }): readonly string[] => parsed.error?.issues.map(({ message }) => message) ?? [];

    const messages = malformed.flatMap((input) => [
      ...messagesOf(importSpaceSchema.safeParse(input)),
      ...messagesOf(spaceSnapshotSchema.safeParse(input)),
    ]);

    expect(messages.length).toBeGreaterThan(20);
    for (const message of messages) {
      expect(message, `acronym in "${message}"`).not.toMatch(/[A-Z]{2,}/);
      expect(message, `capitalised identifier in "${message}"`).not.toMatch(/'[^']*[A-Z][^']*'/);
    }
  });

  /**
   * The same conclusion at the level a reader meets it: the kinds a card may
   * declare survive the fold verbatim. Read off the schemas rather than written
   * out, so changing a literal to `'Markdown'` fails here instead of quietly
   * shipping a summary that names a kind nothing accepts.
   */
  it('leaves a card kind legible in the summary it prints', async () => {
    const cli = await cliMessage({
      id: SPACE_ID,
      document: { version: 2, title: 'T', routes: [] },
      cards: [{ id: CARD_ID, document: { title: 'C', kind: 'Nope', body: '' } }],
    });

    expect(cli).toContain(`'${markdownCardFrontmatterSchema.shape.kind.value}'`);
    expect(cli).toContain(`'${aliasCardFrontmatterSchema.shape.kind.value}'`);
  });
});
