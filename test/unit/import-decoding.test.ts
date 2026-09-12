import {
  aliasThingFrontmatterSchema,
  importSpaceSchema,
  markdownThingFrontmatterSchema,
  spaceSnapshotSchema,
  uuidSchema,
  type ImportSpace,
  type UUID,
} from '@project/core';
import { decodeCommitRequest } from '@project/persistence';
import { describe, expect, it } from 'vitest';
import {
  describeSchemaFailure,
  identifySpace,
  SpaceIdentityError,
} from '../../src/aggregate-directory';

/**
 * What is pinned is the shape of the rejection a client reads, not import
 * semantics. The message travels to the CLI's stderr and, through
 * `rejectInvalidSnapshot`, into the `{ message: string }` HTTP error contract: a
 * field rendered as a sentence. Zod's `error.message` is its entire serialized
 * issue array — a JSON document nested inside that field — which is what "a wire
 * codec throws prose, not Zod" forbids. Pin the shape, not Zod's wording, which
 * is version-dependent.
 *
 * **The door moved and the guard outlived it.** This reached that prose through
 * `PostgresSpaceRepository.importSpaces`, because the compatibility facade was
 * the only door parsing input the importer had not yet identified. ADR 0078
 * retired it, and `describeSchemaFailure` moved to `src/aggregate-directory/identify-space.ts`
 * with the minting it sits beside — so the door is `identifySpace` now, and it
 * raises `SpaceIdentityError` carrying the same summary. The debt the guard
 * exists for did not move with it: two functions still format that summary —
 * `describeSchemaFailure` here and `decodeSnapshot` in
 * `packages/persistence/src/http-protocol.ts` — because sharing one would export
 * a string formatter from a browser-safe package for a single server-side
 * caller. The duplication is the deliberate half; the drift is not, and nothing
 * but this stops the CLI and the wire describing one failure two ways.
 *
 * One thing did get easier. The old door parsed with `importSpaceSchema` and the
 * wire with `spaceSnapshotSchema`, so every fixture had to be built to fail
 * identically under both; `identifySpace` parses the identified snapshot with
 * `spaceSnapshotSchema`, the very schema the wire uses, so what is left under
 * test is the two summarisers. That the two *schemas* still agree about the
 * sentences they write is held below, where both are scanned.
 */
describe('import decoding', () => {
  const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
  const THING_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
  const SECOND_THING_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
  const DIAGRAM_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
  const GRAPH_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');

  /**
   * Every fixture here names every id it carries, so the object `identifySpace`
   * parses is the object the wire is handed and the two summarisers are given
   * one issue list. A mint would make them different documents and the parity
   * below would be comparing two things rather than one — so a mint throws
   * instead of quietly succeeding (ADR 0016: the caller owns identity).
   */
  const unmintable = (): UUID => {
    throw new Error('A fixture left an id out, so the two doors would not see one document.');
  };

  /** The rejection message the CLI prints for one malformed Space. */
  const cliMessage = (input: ImportSpace): string => {
    try {
      identifySpace(input, unmintable);
    } catch (error) {
      if (error instanceof SpaceIdentityError) return error.message;
      throw error;
    }
    throw new Error('Expected the identified space to be refused');
  };

  /** The same failure as the wire sees it, through the commit-request codec. */
  const wireMessage = (snapshot: unknown): string => {
    try {
      decodeCommitRequest({
        changes: [{ kind: 'create', spaceId: SPACE_ID, snapshot }],
      });
    } catch (error) {
      return error instanceof Error ? error.message : '';
    }
    return '';
  };

  /** Everything after the label — the part the two are held to character for character. */
  const summaryOf = (message: string): string | undefined => message.split(' is invalid: ')[1];

  /**
   * One document, failing at one to five paths, chosen for how many paths fail
   * rather than for what fails: three is the most the summary shows, so it is
   * the last count with nothing left to say, and four is the first the tail
   * counts.
   *
   * **Every fault is a title the schema refuses**, because `identifySpace` takes
   * an `ImportSpace` rather than unproven input: it walks the diagrams and the
   * things to mint what they left out *before* it parses, so a wrong-typed
   * `diagrams` never reaches the summariser at all — it throws a `TypeError` on
   * the way. A blank title is a fault the type permits and the schema names, at
   * five nested paths, which is what lets the counts be built without handing
   * the door something its contract says it cannot be handed. Variety in the
   * sentences themselves is scanned further down, straight off both schemas.
   */
  const documentFailingIn = (paths: 1 | 3 | 4 | 5): ImportSpace => {
    const title = (at: 1 | 2 | 3 | 4 | 5, written: string): string => (paths >= at ? '' : written);
    return {
      id: SPACE_ID,
      document: {
        version: 1,
        title: title(1, 'Space'),
        diagrams: [
          {
            id: DIAGRAM_ID,
            title: title(2, 'Diagram 1'),
            kind: 'positioned',
            positions: { [THING_ID]: { x: 0, y: 0, open: false } },
            graphs: [{ id: GRAPH_ID, title: title(3, 'Graph 1'), edges: [] }],
            activeGraph: GRAPH_ID,
          },
        ],
      },
      things: [
        { id: THING_ID, document: { title: title(4, 'One'), kind: 'markdown', body: '' } },
        { id: SECOND_THING_ID, document: { title: title(5, 'Two'), kind: 'markdown', body: '' } },
      ],
    };
  };

  it('rejects a malformed import with prose rather than a serialized Zod dump', () => {
    const message = cliMessage(documentFailingIn(1));

    expect(message.startsWith('[')).toBe(false);
    // SAFETY: `JSON.parse` returns `any`; the cast narrows it to `unknown`
    // rather than trusting the parsed shape — the assertion only checks that
    // parsing throws, so the narrowed value itself is never used.
    expect(() => JSON.parse(message) as unknown).toThrow();
    expect(message).toMatch(/^identified space is invalid: document\.title \S/);
  });

  it('summarises a long issue list instead of listing every one of them', () => {
    const message = cliMessage(documentFailingIn(5));

    expect(message.split('; ')).toHaveLength(3);
    expect(message).toMatch(/\(and \d+ more\)$/);
  });

  /**
   * The label is the one word allowed to differ: `identified space` names what
   * the importer was holding, `create change snapshot` what the codec was
   * handed. Each function's root-path placeholder — `space` here, `snapshot`
   * there — names the same thing and is out of play, both fixtures being objects
   * whose every issue has a path.
   */
  it('describes one malformed document the same way for the CLI and for the wire', () => {
    const malformed = documentFailingIn(5);

    expect(summaryOf(cliMessage(malformed))).toBeDefined();
    expect(summaryOf(cliMessage(malformed))).toBe(summaryOf(wireMessage(malformed)));
  });

  it('shows all three failing paths at three, and counts no remainder', () => {
    const cli = cliMessage(documentFailingIn(3));

    expect(summaryOf(cli)?.split('; ')).toHaveLength(3);
    expect(cli).not.toMatch(/more\)/);
    expect(summaryOf(cli)).toBe(summaryOf(wireMessage(documentFailingIn(3))));
  });

  it('counts the fourth failing path as one, and the fifth as two', () => {
    const four = cliMessage(documentFailingIn(4));
    const five = cliMessage(documentFailingIn(5));

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
  it('always names a failing path and never counts a negative remainder', () => {
    for (const paths of [1, 3, 4, 5] as const) {
      const cli = cliMessage(documentFailingIn(paths));
      const wire = wireMessage(documentFailingIn(paths));

      expect(cli).toMatch(/ is invalid: \S/);
      expect(wire).toMatch(/ is invalid: \S/);
      expect(cli).not.toMatch(/\(and -/);
      expect(summaryOf(cli)).toBe(summaryOf(wire));
    }
  });

  /**
   * The one message a well-typed document can reach that Zod writes as a
   * standing sentence: a Thing Title of nothing but whitespace normalizes to
   * empty and `thingTitleSchema` answers with prose of its own (ADR 0083). Both
   * doors fold it to a clause after the path, and they have to fold it the same
   * way — which is the general precondition the scan below checks, met here by
   * the one message that exercises it end to end.
   */
  it('folds a schema sentence into a clause identically at both doors', () => {
    const blankLine: ImportSpace = {
      id: SPACE_ID,
      document: { version: 1, title: 'Space' },
      things: [{ id: THING_ID, document: { title: '   ', kind: 'markdown', body: '' } }],
    };

    expect(cliMessage(blankLine)).toBe(
      'identified space is invalid: things.0.document.title a title must have at least one line with something in it',
    );
    expect(summaryOf(cliMessage(blankLine))).toBe(summaryOf(wireMessage(blankLine)));
  });

  /**
   * Both summarisers case-fold Zod's sentence (`issue.message.toLowerCase()`) so
   * it reads as a clause after the path. That is safe only while no message
   * carries a word whose case is information, and this is the check that it does
   * not: no acronym, and no quoted identifier with a capital in it.
   *
   * Both schemas, although only `spaceSnapshotSchema` is behind the two doors
   * above: `describeSchemaFailure` folds `importSpaceSchema`'s failures too,
   * `read-single-space` parsing a `space.json` with that one before the importer
   * identifies it.
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
      { id: 'not-a-uuid', document: { version: 1, title: 'T' }, things: [] },
      {
        id: SPACE_ID,
        document: { version: 1, title: 'T' },
        things: [{ id: 'nope', document: { title: 'C', kind: 'markdown', body: '' } }],
      },
      {
        id: SPACE_ID,
        document: {
          version: 1,
          title: 'T',
          diagrams: [
            {
              id: SPACE_ID,
              title: 'L',
              kind: 'positioned',
              positions: {},
              graphs: [{ id: SPACE_ID, title: 'R', edges: [{ from: 'x', to: 'y' }] }],
            },
          ],
        },
        things: [],
      },
      // A bad literal version, and wrong-typed fields.
      { id: SPACE_ID, document: { version: 9, title: 'T' }, things: [] },
      {
        id: SPACE_ID,
        document: { version: 1, title: 7, diagrams: 4, defaultDiagram: 7 },
        things: [],
      },
      // Discriminated-union failures, on a thing's kind and on a diagram's.
      {
        id: SPACE_ID,
        document: { version: 1, title: 'T' },
        things: [{ id: THING_ID, document: { title: 'C', kind: 'Nope', body: '' } }],
      },
      {
        id: SPACE_ID,
        document: {
          version: 1,
          title: 'T',
          diagrams: [{ id: SPACE_ID, title: 'L', kind: 'Weird', positions: {}, graphs: [] }],
        },
        things: [],
      },
      // A bounded string and the one union that is not discriminated — each
      // writes a different sentence.
      { id: SPACE_ID, document: { version: 1, title: '' }, things: [] },
      {
        id: SPACE_ID,
        document: { version: 1, title: 'T', defaultDiagram: 'SpaceCanvas' },
        things: [],
      },
      { id: SPACE_ID, document: { version: 1, title: 'T', defaultDiagram: 7 }, things: [] },
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
   * The same conclusion at the level a reader meets it: the kinds a thing may
   * declare survive the fold verbatim. Read off the schemas rather than written
   * out, so changing a literal to `'Markdown'` fails here instead of quietly
   * shipping a summary that names a kind nothing accepts.
   *
   * Off the pair the door composes — `spaceSnapshotSchema` and
   * `describeSchemaFailure` — rather than through `identifySpace` itself,
   * because a `kind` outside the union is not a value an `ImportSpace` can
   * carry, and the tests above are what tie that pair to the door.
   */
  it('leaves a thing kind legible in the summary it prints', () => {
    const parsed = spaceSnapshotSchema.safeParse({
      id: SPACE_ID,
      document: { version: 1, title: 'T' },
      things: [{ id: THING_ID, document: { title: 'C', kind: 'Nope', body: '' } }],
    });
    if (parsed.success) throw new Error('Expected an unknown thing kind to be refused');
    const summary = describeSchemaFailure(parsed.error.issues, 'identified space');

    expect(summary).toContain(`'${markdownThingFrontmatterSchema.shape.kind.value}'`);
    expect(summary).toContain(`'${aliasThingFrontmatterSchema.shape.kind.value}'`);
  });
});
