import { uuidSchema } from './schema';
import type { UUID } from './types';

const compactUuidPattern = /^[A-Za-z0-9_-]{22}$/;

/** Project one UUID's 128 bits into ADR 0069's canonical product-route spelling. */
export const encodeCompactUuid = (id: UUID): string =>
  Uint8Array.fromHex(id.replaceAll('-', '')).toBase64({
    alphabet: 'base64url',
    omitPadding: true,
  });

/** Decode only ADR 0069's one canonical product-route spelling. */
export const decodeCompactUuid = (value: string): UUID | undefined => {
  if (!compactUuidPattern.test(value)) return undefined;

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.fromBase64(`${value}==`, {
      alphabet: 'base64url',
      lastChunkHandling: 'strict',
    });
  } catch {
    return undefined;
  }
  if (bytes.length !== 16) return undefined;
  if (bytes.toBase64({ alphabet: 'base64url', omitPadding: true }) !== value) return undefined;

  const hex = bytes.toHex();
  return uuidSchema.safeParse(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
  ).data;
};
