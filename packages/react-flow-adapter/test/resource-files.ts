import type { ResourceFile } from '@project/graph';

/** A resource as it is authored: one file, frontmatter then body (ADR 0020). */
export function resourceFile(id: string, title = defaultTitle(id), body = ''): ResourceFile {
  return { path: `resources/${id}.md`, text: `---\nid: ${id}\ntitle: ${title}\n---\n\n${body}` };
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

export function referenceFile(id: string, title: string, target: string): ResourceFile {
  return {
    path: `resources/${id}.md`,
    text: `---\nid: ${id}\ntitle: ${title}\nkind: reference\ntarget: ${target}\n---\n`,
  };
}
