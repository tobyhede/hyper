/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';

/** The single durable identity used by every referenceable InfinityCube entity. */
export const uuidSchema = z.string().uuid().brand<'UUID'>();

/**
 * Mint a durable identity. The one place a UUID is generated.
 *
 * **Mint, not allocate.** Nothing reserves an id from a registry, and in
 * particular PostgreSQL does not hand them out: a Space's id comes from its
 * column default, and every other id — Resource, Graph, Map — is generated here,
 * in whichever process is doing the work.
 *
 * The `crypto` global rather than `node:crypto`, so `core` and the packages
 * above it stay browser-safe. Browsers expose `randomUUID` only in a secure
 * context (HTTPS or localhost). Generation lives here so a fallback, if one is
 * ever needed, has exactly one home. Don't add one speculatively.
 */
export const newUuid = () => uuidSchema.parse(crypto.randomUUID());
