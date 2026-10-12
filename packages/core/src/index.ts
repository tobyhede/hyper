export * from './schema';
export * from './title';
export * from './types';
export * from './resource-geometry';
export * from './compact-uuid';
export * from './graph-head-shape';
export * from './resource-shape';
export * from './resource-size';
export * from './resource-content';
export * from './kinds/kind-module';
export * from './kinds/ur';
export * from './kinds/image';
export * from './kinds/markdown';
export * from './kinds/reference';
export * from './kinds/space';
export {
  KIND_IDS,
  canonicalResource,
  contentTarget,
  decodeFileContent,
  encodeFileContent,
  isKindId,
  isRegisteredKind,
  kindFlags,
  lifetimeSpaceReferences,
  mayBeTarget,
  DEFAULT_KIND,
  newDefaultResourceDocument,
  newResourceDocument,
  resolveContent,
  resourceReferences,
  sidecarNames,
  spaceReferences,
  spaceSelectionProblem,
  type KindId,
} from './kinds/registry';
