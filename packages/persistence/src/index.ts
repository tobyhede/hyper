export * from './backend';
/* The wire contract's two ends live in different processes. These are the
 * codecs the portable HTTP package and the legacy Node host share during the
 * migration. */
export {
  decodeCommitRequest,
  decodeCommittedRevision,
  decodeErrorMessage,
  decodeLoadedSpace,
  decodeSpaceSummaries,
  encodeCommitRequest,
  encodeLoadedSpace,
} from './http-protocol';
export type { LoadedSpaceJson } from './http-protocol';
export type { CommitRequestJson } from './http-protocol';
export { MemorySpaceBackend } from './memory';
export * from './session';
