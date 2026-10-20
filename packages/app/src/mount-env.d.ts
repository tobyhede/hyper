/** The build-time settings the mount entry reads (`vite.mount.config.ts`). */
interface ImportMetaEnv {
  /** The GitHub location a mounted page reads when its address has no `source` (ADR 0130). */
  readonly VITE_HYPER_DEFAULT_SOURCE?: string;
}
