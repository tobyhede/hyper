import { titleName, type Graph, type SpaceSnapshot } from '@project/core';

/**
 * The neutral titles the app mints for structure the author did not name.
 *
 * It sits in its own module so every authoring operation shares one numbering
 * rule for Cards, Diagrams and Graphs.
 *
 * Three named operations rather than one helper taking a prefix. What a caller
 * knows is *what it is naming*; the `<Prefix> N` arithmetic and the prefix
 * literal are this module's, so no call site can spell "Diagram" a second way or
 * number one kind of thing differently from another. This is a deterministic
 * rule and stays one — it is not injected, because there is nothing about it a
 * test would want to replace.
 */

/**
 * The next `<Prefix> N` above the highest one already taken.
 *
 * One past the highest rather than one past the count, so deleting the middle
 * of a numbered set never mints a title that is already in use. Unnumbered
 * titles an author wrote contribute nothing. `BigInt` because the number comes
 * from a title and has no bound; the prefixes are literals in this module, so
 * the built pattern carries nothing to escape.
 */
function nextNumberedTitle(prefix: string, titles: Iterable<string>): string {
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

/**
 * What an Edit calls the Card it creates.
 *
 * The scan reads **first lines** (ADR 0083). A Card whose Title opens `Card 3`
 * and continues onto further Title Lines is still the Card called `Card 3`, so
 * it occupies 3 and the next Edit mints 4 — otherwise adding a subtitle to a
 * minted Card would silently free its number for a duplicate.
 */
export const nextCardTitle = (snapshot: SpaceSnapshot): string =>
  nextNumberedTitle(
    'Card',
    snapshot.cards.map((card) => titleName(card.document.title)),
  );

/** What an Edit calls the next Diagram it creates. */
export const nextDiagramTitle = (snapshot: SpaceSnapshot): string =>
  nextNumberedTitle(
    'Diagram',
    (snapshot.document.diagrams ?? []).map((diagram) => diagram.title),
  );

/** What an Edit calls the next Graph in the supplied collection. */
export const nextGraphTitle = (graphs: readonly Graph[]): string =>
  nextNumberedTitle(
    'Graph',
    graphs.map((graph) => graph.title),
  );
