/** A path as one word a POSIX shell reads back unchanged, so a printed command can be pasted. */
export const shellWord = (path: string): string =>
  /^[\w./+:@%-]+$/.test(path) ? path : `'${path.replaceAll("'", `'\\''`)}'`;
