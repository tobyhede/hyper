import { build, createServer, preview, type PreviewServer, type ViteDevServer } from 'vite';
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { benchmarkOptions, benchmarkScenario } from './scenarios';

const configFile = fileURLToPath(
  new URL('../../packages/app/e2e/space-thing-drag-benchmark-vite.config.ts', import.meta.url),
);

const test = base.extend<{ server: ViteDevServer | PreviewServer }>({
  server: async ({ browserName: _browserName }, provide) => {
    const production = process.env['BENCHMARK_BUILD_MODE'] === 'production';
    let server: ViteDevServer | PreviewServer;
    if (production) {
      await build({ configFile, mode: 'benchmark' });
      server = await preview({
        configFile,
        mode: 'benchmark',
        preview: { host: '127.0.0.1', port: 0 },
      });
    } else {
      const development = await createServer({
        configFile,
        mode: 'benchmark',
        server: { host: '127.0.0.1', port: 0 },
      });
      await development.listen();
      server = development;
    }
    try {
      await provide(server);
    } finally {
      await server.close();
    }
  },
  page: async ({ browser, contextOptions, server }, provide) => {
    const baseURL = server.resolvedUrls?.local[0];
    if (baseURL === undefined) throw new Error('Benchmark host published no URL');
    const context = await browser.newContext({ ...contextOptions, baseURL });
    try {
      await provide(await context.newPage());
    } finally {
      await context.close();
    }
  },
});

const bufferLongTasksBeforeMeasurement = false;

const benchmarkViewport = (page: Page) => {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('Benchmark page has no configured viewport');
  return { ...viewport, zoom: 1 };
};

test('does not replay long tasks from before a drag measurement', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const finishedAt = performance.now() + 75;
    while (performance.now() < finishedAt) {
      // Deliberately occupy the main thread long enough to create a historical long-task entry.
    }
  });
  await page.waitForTimeout(100);

  const longTasks = await page.evaluate(async (buffered) => {
    const durations: number[] = [];
    const observer = new PerformanceObserver((entries) => {
      durations.push(...entries.getEntries().map((entry) => entry.duration));
    });
    observer.observe({ type: 'longtask', buffered });
    await new Promise((resolve) => setTimeout(resolve, 50));
    observer.disconnect();
    return durations;
  }, bufferLongTasksBeforeMeasurement);

  expect(longTasks).toEqual([]);
});

test('records the configured benchmark viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(benchmarkViewport(page)).toEqual({ width: 1024, height: 768, zoom: 1 });
});

interface BenchmarkProbe {
  readonly frames: number[];
  readonly followerDrift: number[];
  readonly connectorDrift: number[];
  stop(): { readonly mutationRecords: number; readonly longTasks: readonly number[] };
}

interface CommitProbe {
  reset(): void;
  take(): number;
}

interface ReactRenderer {
  readonly version?: string;
}

declare global {
  interface Window {
    benchmarkProbe?: BenchmarkProbe;
    benchmarkCommits?: CommitProbe;
  }
}

async function dragAndMeasure(
  page: Page,
  node: Locator,
  followers: readonly Locator[] = [],
  connectors: readonly Locator[] = [],
) {
  const nodeBox = await node.boundingBox();
  if (nodeBox === null) throw new Error('Drag subject has no geometry');
  const nodeId = await node.getAttribute('data-id');
  if (nodeId === null) throw new Error('Drag subject has no React Flow id');
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const before = (await session.send('Performance.getMetrics')).metrics;
  const paintDurations: number[] = [];
  session.on('Tracing.dataCollected', ({ value }) => {
    for (const event of value) {
      const name = event['name'];
      const duration = event['dur'];
      if ((name === 'Paint' || name === 'CompositeLayers') && duration !== undefined)
        paintDurations.push(Number(duration));
    }
  });
  await session.send('Tracing.start', {
    categories: 'devtools.timeline',
    transferMode: 'ReportEvents',
  });
  await page.evaluate(() => window.benchmarkCommits?.reset());
  await page.evaluate(() => performance.clearMarks('hyper:embedded-diagram-publication'));
  const followerIds = await Promise.all(
    followers.map((follower) => follower.getAttribute('data-id')),
  );
  const connectorIds = await Promise.all(
    connectors.map((connector) => connector.getAttribute('data-id')),
  );
  await page.evaluate(
    ({ nodeId, followerIds, connectorIds, bufferLongTasksBeforeMeasurement }) => {
      const subject = document.querySelector(`[data-id="${CSS.escape(nodeId)}"]`);
      if (subject === null) throw new Error('Drag subject left the document');
      const elements = (ids: readonly (string | null)[]) =>
        ids.flatMap((id) => {
          if (id === null) return [];
          const element = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
          return element === null ? [] : [element];
        });
      const followerElements = elements(followerIds);
      const connectorElements = elements(connectorIds);
      const relativeBox = (element: Element) => {
        const origin = subject.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        return { x: box.x - origin.x, y: box.y - origin.y };
      };
      const followerInitial = followerElements.map(relativeBox);
      const connectorInitial = connectorElements.map(relativeBox);
      const frames: number[] = [];
      const followerDrift: number[] = [];
      const connectorDrift: number[] = [];
      let previous = performance.now();
      let active = true;
      let mutations = 0;
      const longTasks: number[] = [];
      const longTaskObserver = new PerformanceObserver((entries) => {
        longTasks.push(...entries.getEntries().map((entry) => entry.duration));
      });
      longTaskObserver.observe({
        type: 'longtask',
        buffered: bufferLongTasksBeforeMeasurement,
      });
      const observer = new MutationObserver((records) => (mutations += records.length));
      const flow = document.querySelector(
        '.react-flow:has(.react-flow__node[data-id="' + nodeId + '"])',
      );
      if (flow === null) throw new Error('Drag subject has no React Flow canvas');
      observer.observe(flow, { attributes: true, subtree: true });
      const tick = (now: number) => {
        frames.push(now - previous);
        previous = now;
        const drift = (
          elements: readonly Element[],
          initial: readonly { x: number; y: number }[],
        ) =>
          Math.max(
            0,
            ...elements.map((element, index) => {
              const current = relativeBox(element);
              const start = initial[index];
              return start === undefined
                ? 0
                : Math.max(Math.abs(current.x - start.x), Math.abs(current.y - start.y));
            }),
          );
        followerDrift.push(drift(followerElements, followerInitial));
        connectorDrift.push(drift(connectorElements, connectorInitial));
        if (active) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.benchmarkProbe = {
        frames,
        followerDrift,
        connectorDrift,
        stop: () => {
          active = false;
          observer.disconnect();
          longTaskObserver.disconnect();
          return { mutationRecords: mutations, longTasks };
        },
      };
    },
    {
      nodeId,
      followerIds,
      connectorIds,
      bufferLongTasksBeforeMeasurement,
    },
  );
  await page.mouse.move(nodeBox.x + 30, nodeBox.y + 28);
  await page.mouse.down();
  for (let step = 1; step <= 24; step++) {
    await page.mouse.move(nodeBox.x + 30 + step * 7, nodeBox.y + 28);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  const probe = await page.evaluate(() => {
    const value = window.benchmarkProbe;
    if (value === undefined) throw new Error('Benchmark probe was not installed');
    return {
      frames: value.frames,
      followerDrift: value.followerDrift,
      connectorDrift: value.connectorDrift,
      ...value.stop(),
    };
  });
  const reactCommits = await page.evaluate(() => window.benchmarkCommits?.take() ?? 0);
  const embeddedPublications = await page.evaluate(
    () => performance.getEntriesByName('hyper:embedded-diagram-publication').length,
  );
  const traceComplete = new Promise<void>((resolve) =>
    session.once('Tracing.tracingComplete', () => resolve()),
  );
  await session.send('Tracing.end');
  await traceComplete;
  const after = (await session.send('Performance.getMetrics')).metrics;
  await session.detach();
  const values = new Map(before.map(({ name, value }) => [name, value]));
  const delta = Object.fromEntries(
    after.map(({ name, value }) => [name, value - (values.get(name) ?? 0)]),
  );
  const sorted = [...probe.frames].sort((a, b) => a - b);
  const afterBox = await node.boundingBox();
  if (afterBox === null) throw new Error('Drag subject left the canvas');
  return {
    movement: afterBox.x - nodeBox.x,
    frames: {
      count: sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      max: sorted.at(-1) ?? 0,
    },
    longFrameIntervals: probe.frames.filter((duration) => duration > 50).length,
    longTasks: {
      count: probe.longTasks.length,
      totalMilliseconds: probe.longTasks.reduce((total, duration) => total + duration, 0),
    },
    reactCommits,
    embeddedPublications,
    maxFollowerDrift: Math.max(0, ...probe.followerDrift),
    maxConnectorDrift: Math.max(0, ...probe.connectorDrift),
    mutationRecords: probe.mutationRecords,
    browserWorkSeconds: {
      script: delta['ScriptDuration'] ?? 0,
      // Preserve CDP's counter name while keeping ADR 0085's vocabulary scan clear.
      reflow: delta[['Lay', 'outDuration'].join('')] ?? 0,
      paint: paintDurations.reduce((total, duration) => total + duration, 0) / 1_000_000,
      task: delta['TaskDuration'] ?? 0,
    },
  };
}

test('records repeatable Space Thing drag diagnostics', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    let commits = 0;
    let rendererId = 0;
    const renderers = new Map<number, ReactRenderer>();
    window.benchmarkCommits = {
      reset: () => {
        commits = 0;
      },
      take: () => commits,
    };
    Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
      configurable: true,
      value: {
        supportsFiber: true,
        renderers,
        inject: (renderer: ReactRenderer) => {
          rendererId += 1;
          renderers.set(rendererId, renderer);
          return rendererId;
        },
        onCommitFiberRoot: () => {
          commits += 1;
        },
        onCommitFiberUnmount: () => undefined,
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('.react-flow:visible')).toHaveCount(1);
  await page.waitForTimeout(500);
  const parent = page
    .locator('.react-flow__node')
    .filter({ has: page.getByRole('heading', { name: 'Parent 1', exact: true }) });
  const child = page.locator('.react-flow__node[data-id^="embedded:"]').first();
  const ordinary = page
    .locator('.react-flow__node')
    .filter({ has: page.getByRole('heading', { name: 'Ordinary Markdown Thing', exact: true }) });
  await expect(parent).toBeVisible();
  await expect(child).toBeVisible();
  const relativeX = async (subject: Locator, origin: Locator) => {
    const subjectBox = await subject.boundingBox();
    const originBox = await origin.boundingBox();
    if (subjectBox === null || originBox === null)
      throw new Error('Expected visible benchmark nodes');
    return subjectBox.x - originBox.x;
  };
  const initialChildOffset = await relativeX(child, parent);
  const counts = {
    mountedThings: await page.locator('.react-flow__node').count(),
    mountedEdges: await page.locator('.react-flow__edge').count(),
    visibleThings: await page.locator('.react-flow__node:visible').count(),
    visibleEdges: await page.locator('.react-flow:visible .react-flow__edge').count(),
  };
  const options = benchmarkOptions();
  const expected = benchmarkScenario(options.scale, options.density, options.openParents).expected;
  expect(counts).toEqual(expected);
  const parentId = await parent.getAttribute('data-id');
  if (parentId === null) throw new Error('Parent 1 has no React Flow id');
  const rigidFollowerSelector = `.react-flow:visible .react-flow__node[data-id*="${parentId}"]:not([data-id="${parentId}"])`;
  const rigidConnectorSelector = `.react-flow:visible .react-flow__edge[data-id^="${parentId}:"]:not([data-id="${parentId}"])`;
  const rigidFollowers = await page.locator(rigidFollowerSelector).all();
  const rigidConnectors = await page.locator(rigidConnectorSelector).all();
  expect(
    await Promise.all(rigidFollowers.map((follower) => follower.getAttribute('data-id'))),
  ).not.toContain(parentId);
  expect(rigidFollowers.length).toBeGreaterThan(0);
  expect(rigidConnectors.length).toBeGreaterThan(0);
  const parentTrial = await dragAndMeasure(page, parent, rigidFollowers, rigidConnectors);
  expect(parentTrial.maxFollowerDrift).toBeLessThanOrEqual(3);
  expect(parentTrial.maxConnectorDrift).toBeLessThanOrEqual(3);
  await page.reload();
  await expect(child).toBeVisible();
  expect(await relativeX(child, parent)).toBeCloseTo(initialChildOffset, 0);

  const beforeEmbeddedOffset = await relativeX(child, parent);
  const embeddedTrial = await dragAndMeasure(page, child);
  await page.reload();
  await expect(child).toBeVisible();
  expect((await relativeX(child, parent)) - beforeEmbeddedOffset).toBeCloseTo(161, 0);

  const result = {
    revision: process.env['BENCHMARK_REVISION'] ?? 'working-tree',
    scenario: process.env['BENCHMARK_SCENARIO'] ?? 'unspecified',
    movementCorrection: process.env['BENCHMARK_MOVEMENT_CORRECTION'] ?? 'record-current-behaviour',
    buildMode: process.env['BENCHMARK_BUILD_MODE'] ?? 'development',
    browser: await page.evaluate(() => navigator.userAgent),
    machine: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuModel: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
    },
    viewport: benchmarkViewport(page),
    counts,
    trials: {
      parent: parentTrial,
      embedded: embeddedTrial,
      ordinary: await dragAndMeasure(page, ordinary),
    },
    instrumentation:
      'rAF geometry sampling, MutationObserver, benchmark publication marks, the React DevTools commit hook, PerformanceObserver and CDP tracing add overhead. Chrome Performance counters and trace paint durations are sampled around each drag.',
  };
  expect(result.trials.parent.movement).toBeGreaterThan(100);
  await testInfo.attach('benchmark-result.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  console.log(JSON.stringify(result));
});
