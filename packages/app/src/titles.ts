/**
 * The neutral titles the app mints for structure the author did not name.
 *
 * It sits in its own module because two collaborators mint them and neither may
 * import the other: a View names the Graph it returns on conversion (ADR 0045),
 * and Space Authoring names the Layout and the Card an Edit creates. Putting the
 * rule beside either one would make `view.ts` and `space-authoring.ts` circular.
 */

/**
 * The next `<Prefix> N` above the highest one already taken.
 *
 * One past the highest rather than one past the count, so deleting the middle
 * of a numbered set never mints a title that is already in use. Unnumbered
 * titles an author wrote contribute nothing. `BigInt` because the number comes
 * from a title and has no bound; the prefixes are literals at each call site, so
 * the built pattern carries nothing to escape.
 */
export function nextNumberedTitle(prefix: string, titles: Iterable<string>): string {
  const numbered = new RegExp(`^${prefix} ([1-9]\\d*)$`);
  let highest = 0n;
  for (const title of titles) {
    const match = numbered.exec(title);
    if (match?.[1] === undefined) continue;
    const number = BigInt(match[1]);
    if (number > highest) highest = number;
  }
  return `${prefix} ${highest + 1n}`;
}
