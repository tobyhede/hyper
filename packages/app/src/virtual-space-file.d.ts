declare module 'virtual:space-file' {
  // The space the dev server chose to serve: its space file (local override or
  // base) and every card file in scope. The space file is typed as `unknown`
  // deliberately — it is on-disk shape, not yet validated, and `loadSpace` is the
  // one thing that turns the pair into a `Space`.
  export const spaceFile: unknown;
  export const cardFiles: { path: string; text: string }[];
}
