import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CDP_PORT = 9222;
const CDP_ENDPOINT = `http://127.0.0.1:${CDP_PORT}`;
const READINESS_TIMEOUT_MS = 10_000;
const RETRY_INTERVAL_MS = 100;

interface CdpReadinessDependencies {
  readonly timeoutMs: number;
  readonly retryIntervalMs: number;
  readonly request: (url: string, timeoutMs: number) => Promise<boolean>;
  readonly now: () => number;
  readonly delay: (milliseconds: number) => Promise<void>;
}

export const waitForCdpReady = async (
  versionEndpoint: string,
  dependencies: CdpReadinessDependencies,
): Promise<boolean> => {
  const deadline = dependencies.now() + dependencies.timeoutMs;

  while (dependencies.now() < deadline) {
    const remaining = deadline - dependencies.now();
    if (await dependencies.request(versionEndpoint, remaining)) return true;

    const delay = Math.min(dependencies.retryIntervalMs, deadline - dependencies.now());
    if (delay > 0) await dependencies.delay(delay);
  }

  return false;
};

interface ChromeCdpLaunchOptions {
  readonly platform: NodeJS.Platform;
  readonly destinations: readonly string[];
  readonly userDataDirectory: string;
}

export interface ChromeCdpLaunchDependencies {
  readonly launch: (destinations: readonly string[]) => void;
  readonly waitUntilReady: () => Promise<boolean>;
  readonly log: (message: string) => void;
  readonly reportError: (message: string) => void;
}

export const launchChromeCdp = async (
  options: ChromeCdpLaunchOptions,
  dependencies: ChromeCdpLaunchDependencies,
): Promise<number> => {
  if (options.platform !== 'darwin') {
    dependencies.reportError('chrome:cdp currently supports macOS only.');
    return 1;
  }

  dependencies.launch(options.destinations);
  if (!(await dependencies.waitUntilReady())) {
    dependencies.reportError(`Chrome CDP did not become ready at ${CDP_ENDPOINT}.`);
    return 1;
  }

  dependencies.log(`Chrome CDP profile: ${options.userDataDirectory}`);
  dependencies.log(`CDP endpoint: ${CDP_ENDPOINT}`);
  return 0;
};

const userDataDirectory = join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome-CDP');

const requestVersion = async (url: string, timeoutMs: number): Promise<boolean> => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(Math.ceil(timeoutMs)) });
    return response.ok;
  } catch {
    return false;
  }
};

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(realpathSync(entryPoint)).href) {
  const destinations = process.argv.slice(2).filter((argument) => argument !== '--');
  const exitCode = await launchChromeCdp(
    { platform: process.platform, destinations, userDataDirectory },
    {
      launch: (launchDestinations) =>
        execFileSync(
          'open',
          [
            '-na',
            'Google Chrome',
            '--args',
            `--remote-debugging-port=${CDP_PORT}`,
            '--remote-debugging-address=127.0.0.1',
            `--user-data-dir=${userDataDirectory}`,
            '--profile-directory=Default',
            '--no-first-run',
            ...launchDestinations,
          ],
          { stdio: 'inherit' },
        ),
      waitUntilReady: () =>
        waitForCdpReady(`${CDP_ENDPOINT}/json/version`, {
          timeoutMs: READINESS_TIMEOUT_MS,
          retryIntervalMs: RETRY_INTERVAL_MS,
          request: requestVersion,
          now: () => performance.now(),
          delay: (milliseconds) =>
            new Promise((resolve) => {
              setTimeout(resolve, milliseconds);
            }),
        }),
      log: (message) => console.log(message),
      reportError: (message) => console.error(message),
    },
  );
  if (exitCode !== 0) process.exitCode = exitCode;
}
