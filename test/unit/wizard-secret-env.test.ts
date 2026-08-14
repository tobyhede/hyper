import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `write_secret_env` in the vendored wizard template is a security guard: it
 * refuses to put a secret in a dotenv file Git would carry. The guard asked
 * `git check-ignore --no-index`, and `--no-index` is precisely the flag that
 * makes it answer the wrong question — it tells Git to decide from the ignore
 * rules **alone**, so a file that is already tracked *and* matches an ignore
 * rule reports as ignored, the guard passes, and the secret is written into a
 * file the next `git add -u` stages. A tracked-and-ignored dotenv is not an
 * exotic shape: `git add -f .env` once, months ago, is enough, and it is
 * invisible afterwards because the file keeps matching `.gitignore`.
 *
 * Nothing else in the repo can catch this. ESLint and Prettier both exclude
 * `.agents/**`, there is no shellcheck and no bats, and `skills-lock.json`
 * records a hash for `SKILL.md` only — `template.sh` is not covered by it — so
 * `pnpm verify` never opens this file. The guard is also a local patch rather
 * than upstream content, which means no upstream test covers it either.
 *
 * The template is executed rather than read: a regex over the source would pin
 * the flag, not the behaviour, and would pass the day someone rewrote the check
 * into a different wrong question. Only the library half above the `# STAGES`
 * marker is sourced, since the stages below it are an example that prompts for
 * input and opens a browser.
 */

const templatePath = fileURLToPath(
  new URL('../../.agents/skills/wizard/template.sh', import.meta.url),
);

/**
 * The wizard library, sliced at the marker its own header calls the boundary
 * between library and authored stages. Asserting the marker is present keeps a
 * renamed section from silently reducing this to sourcing the whole script.
 */
const wizardLibrary = async (): Promise<string> => {
  const template = await readFile(templatePath, 'utf8');
  const lines = template.split('\n');
  const marker = lines.findIndex((line) => line.startsWith('# STAGES'));
  expect(marker, 'the wizard template carries no STAGES marker').toBeGreaterThan(-1);
  return lines.slice(0, marker).join('\n');
};

const temporaryDirectories = new Set<string>();

const makeTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'hyper-wizard-secret-'));
  temporaryDirectories.add(directory);
  return directory;
};

afterEach(async () => {
  for (const directory of temporaryDirectories) {
    await rm(directory, { recursive: true, force: true });
  }
  temporaryDirectories.clear();
});

interface SecretAttempt {
  readonly status: number;
  readonly output: string;
  readonly envFile: string;
  readonly mode: number;
}

/**
 * Runs `write_secret_env` over a throwaway repository in the state `arrange`
 * leaves it in, and reports everything the guard could have affected: whether
 * it succeeded, what it said, and what the dotenv file holds afterwards.
 *
 * The file is staged rather than committed to make it tracked — the index is
 * what `check-ignore` consults, and committing would drag this test through
 * whatever `commit.gpgsign` the machine has configured.
 */
const attemptSecret = async (arrange: {
  readonly gitignore: string;
  readonly track: boolean;
}): Promise<SecretAttempt> => {
  const directory = await makeTemporaryDirectory();
  const envFile = join(directory, '.env');
  const git = (...args: readonly string[]): void => {
    execFileSync('git', ['-C', directory, ...args], { stdio: 'pipe' });
  };

  git('init', '-q');
  await writeFile(join(directory, '.gitignore'), arrange.gitignore, 'utf8');
  await writeFile(envFile, 'EXISTING=kept\n', 'utf8');
  if (arrange.track) git('add', '-f', '.env');

  const library = await wizardLibrary();
  const script = `${library}\nwrite_secret_env API_TOKEN "s3cret-value"\n`;
  let status = 0;
  let output: string;
  try {
    output = execFileSync('bash', ['-c', script], {
      cwd: directory,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, ENV_FILE: '.env' },
    });
  } catch (failure) {
    const spawned = failure as { status?: number; stdout?: string; stderr?: string };
    status = spawned.status ?? 1;
    output = `${spawned.stdout ?? ''}${spawned.stderr ?? ''}`;
  }

  return {
    status,
    output,
    envFile: await readFile(envFile, 'utf8'),
    mode: (await stat(envFile)).mode & 0o777,
  };
};

describe('the wizard template’s write_secret_env', () => {
  it('refuses a dotenv file Git already tracks, however the ignore rules read', async () => {
    const attempt = await attemptSecret({ gitignore: '.env\n', track: true });

    expect(attempt.status).not.toBe(0);
    expect(attempt.output).toContain('refused secret API_TOKEN');
    expect(attempt.envFile).not.toContain('s3cret-value');
    expect(attempt.envFile).toBe('EXISTING=kept\n');
  });

  it('refuses a dotenv file no ignore rule covers', async () => {
    const attempt = await attemptSecret({ gitignore: 'node_modules\n', track: false });

    expect(attempt.status).not.toBe(0);
    expect(attempt.output).toContain('refused secret API_TOKEN');
    expect(attempt.envFile).not.toContain('s3cret-value');
  });

  /**
   * The case the guard exists to allow. Without it the fix would be
   * indistinguishable from refusing everything, which is the cheapest way to
   * pass the two assertions above and would leave the wizard unable to store a
   * secret at all.
   */
  it('writes a secret to an ignored, untracked dotenv file and locks its mode down', async () => {
    const attempt = await attemptSecret({ gitignore: '.env\n', track: false });

    expect(attempt.status).toBe(0);
    expect(attempt.envFile).toContain('API_TOKEN=s3cret-value');
    expect(attempt.envFile).toContain('EXISTING=kept');
    expect(attempt.mode).toBe(0o600);
  });
});
