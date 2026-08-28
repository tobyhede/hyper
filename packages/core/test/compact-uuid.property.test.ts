import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeCompactUuid, encodeCompactUuid, uuidSchema } from '../src';

const uuid = fc.uuid().map((value) => uuidSchema.parse(value));

/**
 * Text that reaches both answers the codec can give.
 *
 * `fc.string()` alone leaves the property below vacuous: a 22-character string
 * drawn entirely from the base64url alphabet is unreachable at its default
 * size, so the accepted branch — the one carrying the round-trip assertion —
 * never runs. Mixing real encodings and near misses in is what makes the
 * property say something, and the counter in the test is what keeps it saying
 * it.
 */
const candidate = fc.oneof(
  fc.string(),
  uuid.map(encodeCompactUuid),
  // Near misses: right alphabet, wrong length, and right length with one digit
  // replaced by a character outside the alphabet.
  uuid.map((id) => encodeCompactUuid(id).slice(0, 21)),
  fc.tuple(uuid, fc.integer({ min: 0, max: 21 })).map(([id, at]) => {
    const encoded = encodeCompactUuid(id);
    return `${encoded.slice(0, at)}+${encoded.slice(at + 1)}`;
  }),
);

describe('compact UUID route codec', () => {
  it('round-trips every UUID through one 22-character base64url spelling', () => {
    fc.assert(
      fc.property(uuid, (id) => {
        const encoded = encodeCompactUuid(id);

        expect(encoded).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(decodeCompactUuid(encoded)).toBe(id);
      }),
    );
  });

  it('rejects every noncanonical final digit that decodes to the same 128 bits loosely', () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

    fc.assert(
      fc.property(uuid, fc.integer({ min: 1, max: 15 }), (id, aliasBits) => {
        const encoded = encodeCompactUuid(id);
        const final = encoded.at(-1);
        if (final === undefined) throw new Error('A compact UUID has no final digit');
        const canonicalIndex = alphabet.indexOf(final);
        const alias = `${encoded.slice(0, -1)}${alphabet[(canonicalIndex & 0b110000) | aliasBits]}`;

        expect(decodeCompactUuid(alias)).toBeUndefined();
      }),
    );
  });

  it('either decodes arbitrary text canonically or rejects it', () => {
    let accepted = 0;

    fc.assert(
      fc.property(candidate, (value) => {
        const decoded = decodeCompactUuid(value);
        if (decoded === undefined) return;
        accepted += 1;
        expect(encodeCompactUuid(decoded)).toBe(value);
      }),
    );

    // The assertion above only says something about the values the codec
    // accepts, so a generator that never produces one makes the whole property
    // vacuous and silently stops defending the round trip.
    expect(accepted).toBeGreaterThan(0);
  });
});
