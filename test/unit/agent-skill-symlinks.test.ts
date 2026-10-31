import { lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const agentsSkillsDirectory = new URL('../../.agents/skills/', import.meta.url);
const claudeSkillsDirectory = new URL('../../.claude/skills/', import.meta.url);
const pluginSkillsDirectory = new URL('../../plugins/infinity-cube/skills/', import.meta.url);

// An entry of `.agents/skills/` is a skill directory or a symlink to one in the plugin.
const skillNames = readdirSync(agentsSkillsDirectory)
  .filter((name) => statSync(new URL(name, agentsSkillsDirectory)).isDirectory())
  .sort();

const pluginSkillNames = readdirSync(pluginSkillsDirectory, { withFileTypes: true })
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

// The plugin holds the files an install carries; this repository reads them through a symlink.
describe('.agents/skills links each infinity-cube plugin skill by real symlink', () => {
  it('names every plugin skill', () => {
    expect(pluginSkillNames).toEqual(['infinity-cube-authoring', 'infinity-cube-getting-started']);
    expect(skillNames).toEqual(expect.arrayContaining(pluginSkillNames));
  });

  it.each(pluginSkillNames)('%s is a symlink into the plugin', (name) => {
    const agentsEntry = new URL(name, agentsSkillsDirectory);

    expect(lstatSync(agentsEntry).isSymbolicLink()).toBe(true);
    expect(realpathSync(agentsEntry)).toBe(realpathSync(new URL(name, pluginSkillsDirectory)));
  });
});
