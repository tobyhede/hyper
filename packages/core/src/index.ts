import { manifestSchema } from './schema';
import type { Manifest } from './types';

export * from './schema';
export * from './types';

/** Parse and validate a manifest, throwing a `ZodError` on failure. */
export function parseManifest(input: unknown): Manifest {
  return manifestSchema.parse(input);
}

/** Non-throwing variant of {@link parseManifest}. */
export function safeParseManifest(input: unknown) {
  return manifestSchema.safeParse(input);
}
