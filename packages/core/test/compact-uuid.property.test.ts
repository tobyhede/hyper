import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeCompactUuid, encodeCompactUuid, uuidSchema } from '../src';

const uuid = fc.uuid().map((value) => uuidSchema.parse(value));

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
    fc.assert(
      fc.property(fc.string(), (value) => {
        const decoded = decodeCompactUuid(value);
        if (decoded !== undefined) expect(encodeCompactUuid(decoded)).toBe(value);
      }),
    );
  });
});
