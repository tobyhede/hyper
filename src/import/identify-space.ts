import {
  spaceSnapshotSchema,
  type ImportSpace,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';

/** A space file or directory that cannot become a fully identified snapshot. */
export class SpaceIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpaceIdentityError';
  }
}

interface SchemaIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/**
 * Zod serializes its entire issue array into `Error.message`, and the caller
 * below reports that to the CLI's stderr — a JSON document nested inside a
 * field a human reads as a sentence.
 *
 * The same answer `decodeSnapshot` gives in `@project/persistence`'s wire codec
 * (`packages/persistence/src/http-protocol.ts`): the first three failing paths
 * and their reasons, then a count of the rest. Restated here rather than
 * shared, because sharing it means exporting a string-formatting helper from a
 * browser-safe package for one server-side caller. What the two owe each other
 * is the behaviour — prose, not Zod — and that format is the whole of the debt,
 * so neither moves alone: one failure should not read one way at the CLI and
 * another on the wire. `import-decoding.test.ts` holds them to it.
 *
 * It reached this module with the aggregate importer. It used to sit in
 * `PostgresSpaceRepository`, beside the compatibility `importSpaces` that was
 * the only door parsing unidentified input; that door is gone and this is the
 * door now, which is why the prose moved rather than being deleted with it.
 *
 * The fold to lower case is checked rather than incidental. Zod capitalises a
 * sentence that stands alone; here it is a clause after a path, so it reads as
 * one — but only while no message carries a word whose case is information.
 * None does: Zod 3 writes `Invalid uuid`, no reachable message echoes the input
 * back, and every literal `@project/core` declares is already lower case, so
 * the kinds a discriminator quotes survive intact. It costs exactly one thing,
 * the capital on the second sentence of that discriminator message. The test
 * scans real failures from both schemas for an acronym or a capitalised quoted
 * identifier, so the day Zod or a literal grows one, this stops being safe out
 * loud rather than quietly.
 *
 * `issues` is never empty. A failed `safeParse` goes through Zod's
 * `handleResult`, which throws `Validation failed but no issues detected.`
 * rather than returning a zero-issue error, so the summary always names a path
 * and `remaining` never counts below zero.
 */
export const describeSchemaFailure = (issues: readonly SchemaIssue[], label: string): string => {
  const described = issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'space'} ${issue.message.toLowerCase()}`)
    .join('; ');
  const remaining = issues.length - 3;
  return `${label} is invalid: ${described}${remaining > 0 ? ` (and ${remaining} more)` : ''}`;
};

/**
 * Fill in every id the import input left out, producing the fully identified
 * snapshot the persistence seam takes.
 *
 * **This is the importer's job, not a repository's.** Both adapters used to
 * mint here — `resolveImport` in `PostgresSpaceRepository` and `identifyImport`
 * in the memory double — which made the same rule a thing two implementations
 * had to agree about, with a shared contract test standing over them to check
 * that they did. `initializeAggregate` and `replaceAggregate` take fully
 * identified snapshots (ADR 0078), so the minting has one home on the way in
 * and the adapters have none.
 *
 * `newId` is the caller's (ADR 0016) rather than an ambient generator, so the
 * CLI's composition root is the one place identity comes from and a test can
 * name what it will assert on.
 *
 * A minted id is **unreferenceable by construction**, which is what makes
 * minting safe at all: nothing already in the document can name a UUID this
 * call has just invented. An id that *is* referenced was therefore written
 * down, and stays exactly as written. A reference to an id nobody declared is
 * left to dangle and refused by aggregate intake, which is where a dangling
 * reference is reported anyway.
 *
 * A diagram's own id and the ids of the graphs it owns are minted in the
 * **same pass**, because under version 1 a graph is reached only through its
 * owner (ADR 0040): there is no space-level collection to walk beside the
 * diagrams.
 *
 * `spaceId` **supplies** the identity the document omits; it never overrides one
 * the document declares. A caller has it because the identity was written
 * somewhere else too — a directory name — and where both exist they must agree,
 * exactly as `read-aggregate` requires of those two. Nothing here chooses
 * between them, because either answer would be a guess about which the author
 * meant. The rule lives in this function rather than only in its caller: an
 * override that passed silently would store a Space under an id its own
 * `space.json` does not spell, and no later intake would notice.
 */
export const identifySpace = (
  input: ImportSpace,
  newId: () => UUID,
  spaceId: UUID = input.id ?? newId(),
): SpaceSnapshot => {
  if (input.id !== undefined && input.id !== spaceId) {
    throw new SpaceIdentityError(
      `the space file declares Space ${input.id} but it is identified as ${spaceId}`,
    );
  }

  const diagrams = input.document.diagrams?.map((diagram) => ({
    ...diagram,
    id: diagram.id ?? newId(),
    graphs: diagram.graphs.map((graph) => ({ ...graph, id: graph.id ?? newId() })),
  }));

  // The document is carried through rather than rebuilt field by field, so a
  // version this build does not read reaches domain intake and is rejected
  // there. Rebuilding it stamped `version` with a constant, which quietly
  // rewrote an unsupported document into a supported one.
  const document = diagrams === undefined ? { ...input.document } : { ...input.document, diagrams };

  const parsed = spaceSnapshotSchema.safeParse({
    id: spaceId,
    document,
    things: input.things.map((thing) => ({ ...thing, id: thing.id ?? newId() })),
  });
  if (!parsed.success) {
    throw new SpaceIdentityError(describeSchemaFailure(parsed.error.issues, 'identified space'));
  }
  return parsed.data;
};
