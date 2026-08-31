import { describe, expect, it } from 'vitest';
import {
  launchChromeCdp,
  waitForCdpReady,
  type ChromeCdpLaunchDependencies,
} from '../../scripts/launch-chrome-cdp';

const endpoint = 'http://127.0.0.1:9222';

describe('Chrome CDP readiness', () => {
  it('retries transient failures until the version endpoint responds successfully', async () => {
    const requestTimeouts: number[] = [];
    const readings = [false, false, true];
    let now = 0;

    const ready = await waitForCdpReady(`${endpoint}/json/version`, {
      timeoutMs: 1_000,
      retryIntervalMs: 100,
      request: (_url, timeoutMs) => {
        requestTimeouts.push(timeoutMs);
        return Promise.resolve(readings.shift() ?? false);
      },
      now: () => now,
      delay: (milliseconds) => {
        now += milliseconds;
        return Promise.resolve();
      },
    });

    expect(ready).toBe(true);
    expect(requestTimeouts).toEqual([1_000, 900, 800]);
    expect(now).toBe(200);
  });

  it('stops retrying at the bounded monotonic deadline', async () => {
    let now = 0;
    let requests = 0;

    const ready = await waitForCdpReady(`${endpoint}/json/version`, {
      timeoutMs: 250,
      retryIntervalMs: 100,
      request: () => {
        requests += 1;
        return Promise.resolve(false);
      },
      now: () => now,
      delay: (milliseconds) => {
        now += milliseconds;
        return Promise.resolve();
      },
    });

    expect(ready).toBe(false);
    expect(now).toBe(250);
    expect(requests).toBe(3);
  });
});

describe('the Chrome CDP launcher', () => {
  const dependencies = (
    overrides: Partial<ChromeCdpLaunchDependencies> = {},
  ): ChromeCdpLaunchDependencies => ({
    launch: () => undefined,
    waitUntilReady: () => Promise.resolve(true),
    log: () => undefined,
    reportError: () => undefined,
    ...overrides,
  });

  it('prints the profile and endpoint only after readiness is confirmed', async () => {
    const events: string[] = [];

    const exitCode = await launchChromeCdp(
      { platform: 'darwin', destinations: [], userDataDirectory: '/tmp/chrome-cdp' },
      dependencies({
        launch: () => events.push('launch'),
        waitUntilReady: () => {
          events.push('ready');
          return Promise.resolve(true);
        },
        log: (message) => events.push(message),
      }),
    );

    expect(exitCode).toBe(0);
    expect(events).toEqual([
      'launch',
      'ready',
      'Chrome CDP profile: /tmp/chrome-cdp',
      `CDP endpoint: ${endpoint}`,
    ]);
  });

  it('reports a readiness timeout and returns a non-zero exit without success output', async () => {
    const messages: string[] = [];

    const exitCode = await launchChromeCdp(
      { platform: 'darwin', destinations: [], userDataDirectory: '/tmp/chrome-cdp' },
      dependencies({
        waitUntilReady: () => Promise.resolve(false),
        log: (message) => messages.push(`log: ${message}`),
        reportError: (message) => messages.push(`error: ${message}`),
      }),
    );

    expect(exitCode).toBe(1);
    expect(messages).toEqual([`error: Chrome CDP did not become ready at ${endpoint}.`]);
  });
});
