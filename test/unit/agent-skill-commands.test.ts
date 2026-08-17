import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const rootPackage = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as {
  readonly scripts?: Readonly<Record<string, string>>;
};

const shadcnFirstUi = readFileSync(
  new URL('../../.agents/skills/shadcn-first-ui/SKILL.md', import.meta.url),
  'utf8',
);

const PACKAGE_RUNNER_COMMANDS = new Set(['dlx', 'exec', 'install']);
const BACKTICKED_PNPM_COMMAND = /`pnpm ([a-z][a-z0-9:-]*)/g;
const SHADCN_SKILL_DIRECTORY = new URL('../../.agents/skills/shadcn/', import.meta.url);

const markdownFiles = (directory: URL): readonly URL[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    return entry.isDirectory() ? markdownFiles(child) : entry.name.endsWith('.md') ? [child] : [];
  });

describe('commands in the mandatory shadcn-first UI workflow', () => {
  it('names only root scripts the repository can run', () => {
    const namedScripts = [...shadcnFirstUi.matchAll(BACKTICKED_PNPM_COMMAND)]
      .map((match) => match[1] ?? '')
      .filter((command) => !PACKAGE_RUNNER_COMMANDS.has(command));

    const availableScripts = new Set(Object.keys(rootPackage.scripts ?? {}));
    const missingScripts = namedScripts.filter((script) => !availableScripts.has(script));

    expect(missingScripts).toEqual([]);
  });

  it('keeps every vendored shadcn CLI invocation on the audited version', () => {
    const mutableInvocations = markdownFiles(SHADCN_SKILL_DIRECTORY).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/shadcn@latest/g)].map(() => file.pathname),
    );

    expect(mutableInvocations).toEqual([]);
  });
});
