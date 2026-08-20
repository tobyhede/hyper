import type { CardFile } from '@project/graph';

/** A card as it is authored: one file, frontmatter then body (ADR 0020). */
export function cardFile(id: string, title = defaultTitle(id), body = ''): CardFile {
  return { path: `cards/${id}.md`, text: `---\nid: ${id}\ntitle: ${title}\n---\n\n${body}` };
}

const KNOWN_TITLES = new Map([
  ['00000000-0000-4000-8000-000000000002', 'A'],
  ['00000000-0000-4000-8000-000000000003', 'B'],
  ['00000000-0000-4000-8000-000000000005', 'C'],
  ['00000000-0000-4000-8000-000000000006', 'D'],
]);

function defaultTitle(id: string): string {
  return KNOWN_TITLES.get(id) ?? id.toUpperCase();
}
