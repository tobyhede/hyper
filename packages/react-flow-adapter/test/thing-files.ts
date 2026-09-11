import type { ThingFile } from '@project/graph';

/** A thing as it is authored: one file, frontmatter then body (ADR 0020). */
export function thingFile(id: string, title = defaultTitle(id), body = ''): ThingFile {
  return { path: `things/${id}.md`, text: `---\nid: ${id}\ntitle: ${title}\n---\n\n${body}` };
}

const DEFAULT_TITLES = new Map([
  ['00000000-0000-4000-8000-000000000002', 'A'],
  ['00000000-0000-4000-8000-000000000003', 'B'],
  ['00000000-0000-4000-8000-000000000005', 'C'],
  ['00000000-0000-4000-8000-000000000006', 'D'],
]);

function defaultTitle(id: string): string {
  return DEFAULT_TITLES.get(id) ?? id.toUpperCase();
}

export function aliasFile(id: string, title: string, target: string): ThingFile {
  return {
    path: `things/${id}.md`,
    text: `---\nid: ${id}\ntitle: ${title}\nkind: alias\ntarget: ${target}\n---\n`,
  };
}
