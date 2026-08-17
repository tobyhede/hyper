import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const agentsSkillsDirectory = new URL('../../.agents/skills/', import.meta.url);
const claudeSkillsDirectory = new URL('../../.claude/skills/', import.meta.url);

const skillNames = readdirSync(agentsSkillsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe('.claude/skills mirrors .agents/skills by real symlink', () => {
  it.each(skillNames)('%s is a symlink into .agents/skills, not a plain file', (name) => {
    const claudeEntry = new URL(name, claudeSkillsDirectory);

    expect(lstatSync(claudeEntry).isSymbolicLink()).toBe(true);
    expect(realpathSync(claudeEntry)).toBe(realpathSync(new URL(name, agentsSkillsDirectory)));
  });

  it('tracks the same skill set on both sides, and nothing but a symlink', () => {
    const claudeEntries = readdirSync(claudeSkillsDirectory, { withFileTypes: true });

    // Unfiltered by type: a stray regular file or directory must still show up
    // here rather than being silently dropped before the name comparison.
    expect(claudeEntries.map((entry) => entry.name).sort()).toEqual(skillNames);
    expect(claudeEntries.every((entry) => entry.isSymbolicLink())).toBe(true);
  });
});
