import type { CardFile } from '@project/graph';

/** A card as it is authored: one file, frontmatter then body (ADR 0020). */
export function cardFile(id: string, title = id.toUpperCase(), body = ''): CardFile {
  return { path: `cards/${id}.md`, text: `---\nid: ${id}\ntitle: ${title}\n---\n\n${body}` };
}
