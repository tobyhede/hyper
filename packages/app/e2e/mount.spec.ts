import { encodeCompactUuid, uuidSchema } from '@project/core';
import {
  expect,
  test as base,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { COMMIT, fakeGitHub, OWNER, REPO } from '../test/fake-github';
import { fixtureFiles } from '../test/fixture-files';
import { expectPictureLoaded } from './image';
import {
  createResource,
  dock,
  nodeByTitle,
  openResource,
  presentControl,
  presentedName,
  resourceControls,
  selectCanvas,
  settled,
  stage,
} from './graph';

/**
 * The static build for Mounting (ADR 0130), served as Cloudflare serves it,
 * with every request to GitHub answered from the tracked fixture. Run by
 * `pnpm e2e:mount` (`playwright.mount.config.ts`), whose build names
 * `MOUNT_DEFAULT_SOURCE`, a branch of this fake repository, as its default.
 */

const META_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000040');
const LINKED_SPACES_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000053');
const PINNED = `github:${OWNER}/${REPO}@${COMMIT}`;
const META_PATH = `/spaces/${encodeCompactUuid(META_SPACE_ID)}`;

/** GitHub's CORS answer, which exposes its rate-limit headers to a page. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers':
    'ETag, Link, Location, Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Used, X-RateLimit-Resource, X-RateLimit-Reset',
};

/**
 * Answer every request to GitHub from the fixture, for every page of the
 * context, a Notes window included, so nothing reaches the network.
 */
const serveGitHub = async (
  context: BrowserContext,
  github = fakeGitHub({ files: fixtureFiles() }),
): Promise<void> => {
  await context.route(
    /^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//,
    async (route) => {
      const answer = await github.fetch(route.request().url());
      await route.fulfill({
        status: answer.status,
        headers: { ...Object.fromEntries(answer.headers), ...CORS },
        body: Buffer.from(await answer.arrayBuffer()),
      });
    },
  );
};

/**
 * Every test fails if the browser refused anything under the build's Content
 * Security Policy, in any page of its context, so a policy that blocks part of
 * the application is caught although nothing on screen says so.
 */
const test = base.extend<{ policyViolations: string[] }>({
  policyViolations: [
    async ({ context }, run) => {
      const violations: string[] = [];
      const watch = (page: Page): void => {
        page.on('console', (message) => {
          if (message.text().includes('Content Security Policy')) violations.push(message.text());
        });
      };
      context.pages().forEach(watch);
      context.on('page', watch);
      await run(violations);
      expect(violations).toEqual([]);
    },
    { auto: true },
  ],
});

const openMeta = async (page: Page): Promise<void> => {
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await settled(page);
};

test.beforeEach(async ({ context }) => {
  await serveGitHub(context);
});

test('/ opens the Meta Space, pinning the build’s default branch to its commit', async ({
  page,
}) => {
  await openMeta(page);

  await expect(page.getByTestId('space-title')).toContainText('Map fixture');
  await expect(page).toHaveURL(`${META_PATH}?source=${PINNED}`);
});

test('a deep product URL is answered with the application under the build’s policy', async ({
  page,
}) => {
  const response = await page.goto(
    `${META_PATH}/maps/${encodeCompactUuid(LINKED_SPACES_MAP_ID)}?source=${PINNED}`,
  );

  expect(response?.status()).toBe(200);
  const policy = response?.headers()['content-security-policy'] ?? '';
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain(
    "connect-src 'self' https://api.github.com https://raw.githubusercontent.com",
  );
  expect(policy).toContain("img-src 'self' blob: data: https:");
  await expect(page.getByTestId('selected-canvas')).toHaveText('Linked Spaces');
});

test('a missing hashed asset is answered with the page, and nothing keeps it', async ({
  request,
}) => {
  const response = await request.get('/assets/index-missing.js');

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/html');
  expect(response.headers()['cache-control']).toBeUndefined();
});

/** A 3×2 PNG no fixture image is, so storing it is a new image in the page. */
const UPLOADED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEElEQVR4nGP4z8AAQQxwFgBB0gX7h/C5SAAAAABJRU5ErkJggg==';

const MOUNTED_EDITS = 'Edits kept in this page only';

/** The shell's notice that a mounted session's Edits are kept in this page only. */
const mountedEditsNotice = (page: Page): Locator =>
  page.getByRole('status').filter({ hasText: MOUNTED_EDITS });

/** Rename a drawn Resource through its title, as a reader does. */
async function renameResource(page: Page, from: string, to: string): Promise<void> {
  const resource = nodeByTitle(page, from).first();
  await resourceControls(page, resource);
  await resource.getByRole('button', { name: `Edit Title ${from}` }).click();
  const title = page.getByRole('textbox', { name: 'Resource title' });
  await title.fill(to);
  await title.press('Enter');
  await expect(nodeByTitle(page, to).first()).toBeVisible();
}

test(
  'offers every Edit, reports where an Edit is kept, and loses it on reload',
  { tag: '@parity:command-dock-offers-a-mounted-session-every-edit' },
  async ({ page }) => {
    await openMeta(page);

    await expect(dock(page).getByText(/reload|page only/i)).toHaveCount(0);
    await expect(mountedEditsNotice(page)).toHaveCount(0);
    for (const create of await dock(page)
      .getByRole('button', { name: /^Create / })
      .all()) {
      await expect(create).not.toHaveAttribute('aria-disabled', 'true');
    }
    await expect(presentControl(page)).not.toHaveAttribute('aria-disabled', 'true');

    const status = page.getByTestId('persistence-status');
    const revision = (await status.getAttribute('data-revision')) ?? '';
    const resource = nodeByTitle(page, 'A').first();
    await resourceControls(page, resource);
    await expect(page.getByRole('button', { name: 'Open Resource A' })).toBeVisible();
    await resource.getByRole('button', { name: 'Edit Title A' }).click();
    const title = page.getByRole('textbox', { name: 'Resource title' });
    await title.fill('Renamed A');
    await title.press('Enter');

    await expect(nodeByTitle(page, 'Renamed A').first()).toBeVisible();
    await expect(status).not.toHaveAttribute('data-revision', revision);
    await expect(status).toHaveText('Persisted');
    await expect(mountedEditsNotice(page)).toContainText('Nothing is written to GitHub');
    await expect(dock(page).getByText(/page only/i)).toHaveCount(0);

    await page.reload();
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
    await settled(page);
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await expect(nodeByTitle(page, 'Renamed A')).toHaveCount(0);
    await expect(mountedEditsNotice(page)).toHaveCount(0);
  },
);

test(
  'reports once where Edits are kept, and stays dismissed for the page',
  { tag: '@parity:mounted-edits-notice-reports-where-edits-are-kept' },
  async ({ page }) => {
    await openMeta(page);
    const status = page.getByTestId('persistence-status');

    await renameResource(page, 'A', 'Renamed A');
    await expect(mountedEditsNotice(page)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.getByRole('button', { name: `Dismiss: ${MOUNTED_EDITS}` }).click();
    await expect(mountedEditsNotice(page)).toHaveCount(0);

    const revision = (await status.getAttribute('data-revision')) ?? '';
    await renameResource(page, 'Renamed A', 'A again');
    await expect(status).not.toHaveAttribute('data-revision', revision);
    await expect(mountedEditsNotice(page)).toHaveCount(0);
  },
);

test('an image uploaded in the page is drawn from an object URL over its bytes', async ({
  page,
}) => {
  await openMeta(page);

  const chooser = page.waitForEvent('filechooser');
  await createResource(page, 'Image Resource');
  await (
    await chooser
  ).setFiles({
    name: 'diagram.png',
    mimeType: 'image/png',
    buffer: Buffer.from(UPLOADED_PNG, 'base64'),
  });
  const title = page.getByRole('textbox', { name: 'Resource title' });
  await expect(title).toBeFocused();
  const created = await title.inputValue();
  await title.press('Escape');

  const resource = nodeByTitle(page, created).first();
  await openResource(resource, created);
  const picture = resource.locator('img');
  await expect(picture).toHaveAttribute('src', /^blob:/u);
  await expectPictureLoaded(picture, 3);
});

test('a Presenting URL loads directly and survives a reload', async ({ page }) => {
  await openMeta(page);
  await presentControl(page).click();
  await expect(stage(page)).toBeVisible();
  await page.keyboard.press('ArrowRight');
  const presented = await presentedName(page).innerText();
  const presenting = page.url();
  expect(presenting).toContain('/present/');
  expect(presenting).toContain(`?source=${PINNED}`);

  const direct = await page.context().newPage();
  await direct.goto(presenting);
  await expect(presentedName(direct)).toHaveText(presented);

  await direct.reload();
  await expect(presentedName(direct)).toHaveText(presented);
  expect(direct.url()).toBe(presenting);
});

test('Enters a Space Resource and Exits it again', async ({ page }) => {
  await openMeta(page);
  await selectCanvas(page, 'Linked Spaces');
  await settled(page);
  await expect(page).toHaveURL(
    `${META_PATH}/maps/${encodeCompactUuid(LINKED_SPACES_MAP_ID)}?source=${PINNED}`,
  );

  const actions = (await resourceControls(page, nodeByTitle(page, 'Presentation'))).getByRole(
    'button',
    { name: 'Actions for Resource Presentation' },
  );
  await actions.focus();
  await actions.press('Enter');
  await page.getByRole('menuitem', { name: 'Enter', exact: true }).click();
  const showing = page.locator('[data-testid="space-title"]:visible');
  await expect(showing).not.toContainText('Map fixture');
  await expect(page).toHaveURL(new RegExp(`\\?source=${PINNED}$`));

  await page.getByRole('button', { name: /^Space: / }).click({ delay: 120 });
  await page.getByRole('menuitem', { name: 'Exit Space' }).click();
  await expect(showing).toContainText('Map fixture');
});

test('the Notes window mounts the same commit and follows the presentation', async ({ page }) => {
  await openMeta(page);
  await presentControl(page).click();
  await expect(stage(page)).toBeVisible();

  const opened = page.context().waitForEvent('page');
  await page.keyboard.press('s');
  const notes = await opened;
  await expect(notes).toHaveURL(new RegExp(`/notes\\?source=${PINNED}$`));
  const notesWindow = notes.getByRole('main', { name: 'Notes window' });
  const first = await presentedName(page).innerText();
  await expect(notesWindow.getByText(`Presenting ${first}`, { exact: true })).toBeVisible();

  await page.keyboard.press('ArrowRight');
  const next = await presentedName(page).innerText();
  expect(next).not.toBe(first);
  await expect(notesWindow.getByText(`Presenting ${next}`, { exact: true })).toBeVisible();
});

test('an unknown product URL shows the "not found" destination', async ({ page }) => {
  const missing = encodeCompactUuid(uuidSchema.parse('00000000-0000-4000-8000-0000000000ff'));
  const unknown = `${META_PATH}/maps/${missing}?source=${PINNED}`;
  await page.goto(unknown);

  await expect(page.getByRole('alert')).toContainText('Destination not found');
  await expect(page.getByTestId('space-title')).toContainText('Map fixture');
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(unknown);

  await page.goto('/talk');
  await expect(page.getByRole('alert')).toContainText('Destination not found');
});

test('a rate-limited GitHub answer is shown as the startup failure', async ({ page, context }) => {
  await context.unrouteAll();
  await serveGitHub(context, fakeGitHub({ files: fixtureFiles(), rateLimitStatus: 403 }));

  await page.goto('/');

  await expect(page.getByText('Application could not start')).toBeVisible();
  await expect(
    page.getByText(/GitHub’s limit on requests without a token is used up/),
  ).toBeVisible();
});

test('a mount missing blobs shows every file it could not read', async ({ page, context }) => {
  const unreadable = [
    '00000000-0000-4000-8000-000000000060/space.json',
    '00000000-0000-4000-8000-000000000070/space.json',
  ];
  await context.unrouteAll();
  await serveGitHub(
    context,
    fakeGitHub({
      files: fixtureFiles(),
      blobFailures: new Map(unreadable.map((path) => [path, [{ status: 404 }]])),
    }),
  );

  await page.goto('/');

  await expect(page.getByText('Application could not start')).toBeVisible();
  for (const path of unreadable) {
    await expect(
      page.getByText(
        `${PINNED}/${path}: could not be fetched from GitHub: the request failed with HTTP 404`,
      ),
    ).toBeVisible();
  }
});

test(
  'asks for a location that reads, and opens it once one does',
  { tag: '@parity:github-location-form-refuses-a-location-that-does-not-read' },
  async ({ page }) => {
    await page.goto(`/?source=${OWNER}/${REPO}`);

    const location = page.getByRole('textbox', { name: 'GitHub location' });
    await expect(location).toHaveValue(`${OWNER}/${REPO}`);
    await expect(page.getByText('a GitHub location begins with github:')).toBeVisible();
    await expect(location).toHaveAttribute('aria-invalid', 'true');

    await location.fill(`github:${OWNER}/${REPO}`);
    await page.getByRole('button', { name: 'Open' }).click();

    await expect(page.getByTestId('space-title')).toContainText('Map fixture');
    await expect(page).toHaveURL(`${META_PATH}?source=${PINNED}`);
  },
);
