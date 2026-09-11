import type { ThingFile } from '@project/graph';

/**
 * A thing as it is authored: one file, frontmatter then body (ADR 0020).
 *
 * The title is written as a **quoted** scalar. JSON's own quoting is YAML's
 * double-quoted form, so it escapes what YAML would otherwise read as
 * structure — and a Title written on more than one line (ADR 0083) is exactly
 * that: interpolated bare, its second line parses as a second key and the whole
 * frontmatter stops being valid YAML.
 */
export function thingFile(id: string, title = defaultTitle(id), body = ''): ThingFile {
  return {
    path: `things/${id}.md`,
    text: `---\nid: ${id}\ntitle: ${JSON.stringify(title)}\n---\n\n${body}`,
  };
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
