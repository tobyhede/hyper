/**
 * Which of an Aggregate directory's files Importing reads, given every regular
 * file in it by `/`-separated path relative to the directory.
 *
 * A stand-in until the browser-safe aggregate reader (Mounting ticket 01)
 * exports its own rule, which replaces this module whole. It restates what
 * `src/aggregate-directory` scans on disk:
 *
 * - `hyper.json`;
 * - each immediate child directory holding a `space.json` is a Space
 *   directory, and its `space.json`, every `.md` beside it, and every `.json`
 *   and `.md` directly in its `resources/` are read;
 * - every file directly in `images/` whose name does not begin with `.`.
 *
 * Nothing else is read: no deeper directory, and no file at the aggregate's
 * root beside `hyper.json`.
 */
export const scannedAggregatePaths = (files: readonly string[]): readonly string[] => {
  const spaceDirectories = new Set(
    files.flatMap((path) => {
      const [directory, name, ...deeper] = path.split('/');
      return name === 'space.json' && deeper.length === 0 && directory !== undefined
        ? [directory]
        : [];
    }),
  );

  return files.filter((path) => {
    const segments = path.split('/');
    const [first, second, third, ...deeper] = segments;
    if (first === undefined || deeper.length > 0) return false;
    if (second === undefined) return first === 'hyper.json';
    if (first === 'images' && third === undefined && !second.startsWith('.')) return true;
    if (!spaceDirectories.has(first)) return false;
    if (third === undefined) return second === 'space.json' || second.endsWith('.md');
    return second === 'resources' && (third.endsWith('.json') || third.endsWith('.md'));
  });
};
