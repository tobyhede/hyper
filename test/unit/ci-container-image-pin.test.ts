import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The Playwright image pin lives in more than one job now — `e2e` and `ladle`
 * both declare it — and nothing in the workflow makes the copies agree. The
 * `.node-version` guard cannot: it compares the Node major, and that is
 * identical across Playwright image versions. So a bump that moves one pin and
 * forgets the other leaves the second job silently running the old image, and
 * what finally surfaces is a browser/`@playwright/test` mismatch that reads as
 * a lockfile problem rather than as the pin nobody moved.
 *
 * The file is scanned rather than parsed: no YAML parser is a declared
 * dependency of this repo, and pulling one in for this would be a heavier
 * change than the invariant is worth. The shape being matched is fixed by the
 * workflow's own formatting, which `prettier` holds steady.
 */

const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

type ContainerJob = { readonly job: string; readonly image: string; readonly options: string };

const containerJobs = ((): readonly ContainerJob[] => {
  const found: ContainerJob[] = [];
  let job: string | undefined;
  let inContainer = false;
  let image: string | undefined;
  let options: string | undefined;

  const flush = () => {
    if (job !== undefined && image !== undefined) {
      found.push({ job, image, options: options ?? '' });
    }
    inContainer = false;
    image = undefined;
    options = undefined;
  };

  for (const line of workflow.split('\n')) {
    const jobHeader = /^ {2}([a-z][a-z0-9_-]*):$/.exec(line);
    if (jobHeader?.[1] !== undefined) {
      flush();
      job = jobHeader[1];
      continue;
    }
    if (/^ {4}container:$/.test(line)) {
      inContainer = true;
      continue;
    }
    if (!inContainer) continue;

    const imageLine = /^ {6}image: (.+)$/.exec(line);
    if (imageLine?.[1] !== undefined) {
      image = imageLine[1].trim();
      continue;
    }
    const optionsLine = /^ {6}options: (.+)$/.exec(line);
    if (optionsLine?.[1] !== undefined) options = optionsLine[1].trim();
  }
  flush();

  return found;
})();

describe('ci.yml container jobs', () => {
  // Not a count assertion on purpose. Consolidating the browser jobs behind a
  // `strategy.matrix` would leave exactly one container block and every
  // invariant below would still hold, so pinning the number here would fail a
  // refactor that is strictly an improvement. This guards only against the
  // scan silently matching nothing — a formatting change that broke it would
  // otherwise turn every test below green and prove nothing.
  it('are found by the scan', () => {
    expect(containerJobs.length).toBeGreaterThan(0);
    expect(containerJobs.map((entry) => entry.job)).toEqual(
      expect.arrayContaining(['e2e', 'ladle']),
    );
  });

  it('pin one image reference between them', () => {
    const distinct = [...new Set(containerJobs.map((entry) => entry.image))];

    expect(distinct).toHaveLength(1);
  });

  it('pin that reference by tag and by digest', () => {
    for (const { job, image } of containerJobs) {
      expect(image, `${job} must pin a tag`).toMatch(/^[^:]+:[^@]+@/);
      expect(image, `${job} must pin a digest`).toMatch(/@sha256:[0-9a-f]{64}$/);
    }
  });

  it('overlay the repository Node pin without replacing the Playwright image', () => {
    const nodeVersionConsumers = workflow.match(/node-version-file: \.node-version/g) ?? [];

    // verify, postgres, e2e and ladle each consume the one exact runtime pin.
    expect(nodeVersionConsumers).toHaveLength(4);
    expect(workflow).not.toContain("The image's Node must satisfy .node-version");
  });

  // `--ipc=host` because the default 64MB `/dev/shm` makes Chromium run out of
  // memory and crash, and `--init` because Actions holds the container open for
  // the whole job, so an orphaned browser helper reparents onto a PID 1 that
  // never waits on it.
  it('run Chromium with a usable /dev/shm and a process reaper', () => {
    for (const { job, options } of containerJobs) {
      expect(options, `${job} must set --ipc=host`).toContain('--ipc=host');
      expect(options, `${job} must set --init`).toContain('--init');
    }
  });
});
