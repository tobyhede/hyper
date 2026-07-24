declare module 'virtual:space-file' {
  // The space file the dev server chose to serve (local override or base). Typed
  // as `unknown` deliberately: it is on-disk shape, not yet validated, and
  // `loadSpace` is the one thing that turns it into a `Space`.
  const spaceFile: unknown;
  export default spaceFile;
}
