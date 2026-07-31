export * from './backend';
export { HttpSpaceBackend } from './http';
export type { HttpSpaceBackendOptions } from './http';
/* The wire contract's two ends live in different processes. `HttpSpaceBackend`
 * keeps the browser half private; these are the halves the server answers with
 * and the ones a test needs to speak the protocol from outside. */
export { decodeCommitRequest, encodeCommitRequest, encodeLoadedSpace } from './http-protocol';
export { MemorySpaceBackend } from './memory';
export * from './session';
