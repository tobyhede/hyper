/**
 * A non-negative decimal with no leading zeros, bounded at 19 digits — the
 * width of a PostgreSQL `bigint`, still the widest either database's stored
 * Revision column can hold — so a hostile peer cannot hand `BigInt` an
 * arbitrarily long digit string to parse. Range is `REVISION_CEILING`'s
 * business, not this pattern's; this is only a bound on the work parsing will
 * do, which is why the `Retry-After` header in `packages/http/src/http.ts`
 * shares it despite being a different protocol concern.
 */
export const CANONICAL_DECIMAL = /^(0|[1-9]\d{0,18})$/;

/**
 * The ceiling every stored Revision is bound to: 2^63−1 (`CONTEXT.md`'s
 * Revision entry). Both databases store a Revision as canonical non-negative
 * decimal TEXT (ADR 0095) — this is the codec's own rule now, not either
 * column's native type; it happens to equal PostgreSQL `bigint`'s range
 * because that is where the ceiling was first enforced, but nothing here
 * reads it as "the PostgreSQL range" any more.
 */
export const REVISION_CEILING = 9_223_372_036_854_775_807n;

/**
 * The codec's own error identity, distinct from a bare `RangeError` so a
 * caller reading broken stored state (ADR 0095) can catch exactly this and
 * nothing else — an unrelated `RangeError` elsewhere in a read path must not
 * be misread as a canonical-revision failure. PostgreSQL's aggregate read
 * (`src/persistence/postgres-space-repository.ts`'s `loadEverySpace`) admits
 * this alongside its own `SnapshotValidationError` rather than widening its
 * catch to every error.
 */
export class RevisionCodecError extends RangeError {}

/**
 * Decode a stored Revision column's text into the domain `bigint`.
 *
 * Shared by both database adapters (ADR 0095) so the canonical-decimal format
 * and the ceiling are checked identically on read, whichever database the row
 * came from. Throws `RevisionCodecError` — never widened, never silently
 * clamped — because a value a live database actually holds that fails this
 * check is broken stored state, not a value to coerce.
 */
export const decodeStoredRevision = (value: string): bigint => {
  if (!CANONICAL_DECIMAL.test(value)) {
    throw new RevisionCodecError(
      `Database revision ${value} is not a canonical non-negative decimal`,
    );
  }
  const revision = BigInt(value);
  if (revision > REVISION_CEILING) {
    throw new RevisionCodecError(`Database revision ${value} exceeds the 2^63-1 ceiling`);
  }
  return revision;
};

/**
 * Encode a domain `bigint` Revision into the canonical decimal text both
 * database adapters write. Refuses a value above the ceiling before it ever
 * reaches a write — the write-side half of what `decodeStoredRevision` checks
 * on read, so a Revision that could not be read back is never stored in the
 * first place.
 */
export const encodeStoredRevision = (value: bigint): string => {
  if (value < 0n || value > REVISION_CEILING) {
    throw new RevisionCodecError(`Revision ${value} exceeds the 2^63-1 ceiling`);
  }
  return value.toString();
};
