// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// gate that fails a test if React Flow logged a warning while it ran.
import { encodeCompactUuid, uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { expect, test, type Locator, type Page } from './fixtures';
import { presentControl, presentedName, stage } from './graph';
import { SEEDED_GRAPH_ID, SEEDED_MAP_ID, seedPositionedMap } from './seed';

// The Notes window (ADR 0129) is a second window of the same browser, joined
// to the presenting window over `BroadcastChannel`. Each test opens both as
// pages of one browser context, which is what two windows of one browser are.
//
// The tracked fixture has no notes, so each test seeds a talk and its
// Presentation Notes Graph through the HTTP boundary the browser uses. Every
// test owns a fresh memory repository, so the seed reaches no other test.

const id = (n: number): UUID =>
  uuidSchema.parse(`00000000-0000-4000-8000-0000000a${n.toString(16).padStart(4, '0')}`);

const ids = {
  notes: id(2),
  welcome: id(0x10),
  demo: id(0x11),
  architecture: id(0x12),
  questions: id(0x13),
  outage: id(0x20),
  thanks: id(0x21),
  backup: id(0x22),
} as const;

const markdown = (resource: UUID, title: string, source: string) =>
  ({ id: resource, document: { title, kind: 'markdown', content: { source } } }) as const;

/**
 * Give the opened Space a Map with a talk that forks after its welcome, and a
 * Presentation Notes Graph naming it: two notes for the welcome, placed one
 * above the other, one for the demo and none for the rest. Answers the
 * Space's id.
 *
 * `seedPositionedMap` writes the Map and its one Graph, the talk. The second
 * commit names that Graph and adds the notes Graph beside it.
 */
async function seedTalk(page: Page): Promise<UUID> {
  const seeded = await seedPositionedMap(
    page,
    'Launch',
    () => ({
      [ids.welcome]: { x: 0, y: 0, open: false },
      [ids.demo]: { x: 420, y: -200, open: false },
      [ids.architecture]: { x: 420, y: 200, open: false },
      [ids.questions]: { x: 840, y: 0, open: false },
      [ids.outage]: { x: 0, y: 400, open: false },
      [ids.thanks]: { x: 0, y: 700, open: false },
      [ids.backup]: { x: 420, y: 400, open: false },
    }),
    [
      markdown(ids.welcome, 'Welcome', 'Launching the new store.'),
      markdown(ids.demo, 'Demo', 'A live walk through checkout.'),
      markdown(ids.architecture, 'Architecture', 'How a write reaches every replica.'),
      markdown(ids.questions, 'Questions', 'Ask anything.'),
      markdown(ids.outage, 'Open with the outage', 'Tell the March outage story first.'),
      markdown(ids.thanks, 'Thank the team', 'Name the on-call rota.'),
      markdown(ids.backup, 'Backup video', 'If the demo fails, play the recording.'),
    ],
    [
      { from: ids.welcome, to: ids.demo },
      { from: ids.welcome, to: ids.architecture },
      { from: ids.demo, to: ids.questions },
      { from: ids.architecture, to: ids.questions },
    ],
  );
  const spaceId = seeded.snapshot.id;
  const snapshot: SpaceSnapshot = {
    ...seeded.snapshot,
    document: {
      ...seeded.snapshot.document,
      maps: (seeded.snapshot.document.maps ?? []).map((placed) => ({
        ...placed,
        graphs: [
          ...placed.graphs.map((graph) => ({ ...graph, title: 'Launch talk' })),
          {
            id: ids.notes,
            title: 'Launch talk Presentation Notes',
            edges: [
              { from: ids.welcome, to: ids.thanks },
              { from: ids.welcome, to: ids.outage },
              { from: ids.demo, to: ids.backup },
            ],
          },
        ],
      })),
    },
  };
  const commit = await page.request.post('/api/spaces', {
    data: {
      changes: [{ kind: 'update', spaceId, snapshot, expectedRevision: seeded.revision }],
    },
  });
  expect(commit.ok()).toBe(true);
  return spaceId;
}

const presentPath = (spaceId: UUID, resource: UUID) =>
  `/spaces/${encodeCompactUuid(spaceId)}/maps/${encodeCompactUuid(SEEDED_MAP_ID)}/graphs/${encodeCompactUuid(SEEDED_GRAPH_ID)}/present/${encodeCompactUuid(resource)}`;

const notesPath = (spaceId: UUID) => `/spaces/${encodeCompactUuid(spaceId)}/notes`;

/** Open the Notes window as a second window of the same browser. */
async function openNotesWindow(page: Page, spaceId: UUID): Promise<Page> {
  const notes = await page.context().newPage();
  await notes.goto(notesPath(spaceId));
  await expect(notesWindow(notes)).toBeVisible();
  return notes;
}

const notesWindow = (page: Page) => page.getByRole('main', { name: 'Notes window' });
const notesOf = (page: Page) => notesWindow(page).getByRole('region', { name: 'Notes' });
const movesOf = (page: Page) => notesWindow(page).getByRole('region', { name: 'Moves' });
const noteNames = (page: Page): Locator =>
  notesOf(page).getByTestId('resource-content').locator('.resource__title');
const presenting = (page: Page, title: string) =>
  notesWindow(page).getByText(`Presenting ${title}`, { exact: true });

test(
  'S opens a Notes window that draws the notes in Map order and a preview of every move',
  { tag: '@parity:notes-window-draws-notes-in-map-order-and-every-move' },
  async ({ page }) => {
    const spaceId = await seedTalk(page);
    await page.goto(presentPath(spaceId, ids.welcome));
    await expect(presentedName(page)).toHaveText('Welcome');

    const opened = page.context().waitForEvent('page');
    await page.keyboard.press('s');
    const notes = await opened;
    await expect(notes).toHaveURL(new RegExp(`${notesPath(spaceId)}$`));

    await expect(presenting(notes, 'Welcome')).toBeVisible();
    await expect(notesOf(notes).getByText('From Launch talk Presentation Notes')).toBeVisible();
    await expect(noteNames(notes)).toHaveText(['Open with the outage', 'Thank the team']);
    await expect(movesOf(notes).getByRole('button', { name: 'Go to Demo' })).toBeVisible();
    await expect(movesOf(notes).getByRole('button', { name: 'Choose Architecture' })).toBeVisible();
    await expect(movesOf(notes).getByRole('figure', { name: 'Preview of Demo' })).toContainText(
      'A live walk through checkout.',
    );
    await expect(
      movesOf(notes).getByRole('figure', { name: 'Preview of Architecture' }),
    ).toContainText('How a write reaches every replica.');
    await expect(notesWindow(notes).getByRole('status', { name: 'Elapsed time' })).toBeVisible();

    // The presenting window keeps presenting, and nothing of the notes reaches its Stage.
    await expect(presentedName(page)).toHaveText('Welcome');
    await expect(stage(page)).not.toContainText('Tell the March outage story first.');
    await expect(stage(page)).not.toContainText('Name the on-call rota.');
  },
);

test(
  'a move pressed in the Notes window, or an arrow key, moves the presentation',
  { tag: '@parity:notes-window-drives-the-presentation' },
  async ({ page }) => {
    const spaceId = await seedTalk(page);
    await page.goto(presentPath(spaceId, ids.welcome));
    await expect(presentedName(page)).toHaveText('Welcome');
    const notes = await openNotesWindow(page, spaceId);
    await expect(presenting(notes, 'Welcome')).toBeVisible();

    await movesOf(notes).getByRole('button', { name: 'Choose Architecture' }).click();
    await expect(movesOf(notes).getByRole('button', { name: 'Go to Architecture' })).toBeVisible();
    await movesOf(notes).getByRole('button', { name: 'Choose Demo' }).click();
    await movesOf(notes).getByRole('button', { name: 'Go to Demo' }).click();
    await expect(presentedName(page)).toHaveText('Demo');
    await expect(noteNames(notes)).toHaveText(['Backup video']);

    await notes.keyboard.press('ArrowRight');
    await expect(presentedName(page)).toHaveText('Questions');
    await expect(presenting(notes, 'Questions')).toBeVisible();

    await notes.keyboard.press('ArrowLeft');
    await expect(presentedName(page)).toHaveText('Demo');

    // A reloaded Notes window finds the presentation again.
    await notes.reload();
    await expect(presenting(notes, 'Demo')).toBeVisible();
    await expect(noteNames(notes)).toHaveText(['Backup video']);
  },
);

test(
  'the Notes window says when a Resource has no notes and the talk ends',
  { tag: '@parity:notes-window-marks-the-end-and-a-resource-without-notes' },
  async ({ page }) => {
    const spaceId = await seedTalk(page);
    await page.goto(presentPath(spaceId, ids.welcome));
    await expect(presentedName(page)).toHaveText('Welcome');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(presentedName(page)).toHaveText('Questions');

    const notes = await openNotesWindow(page, spaceId);

    await expect(presenting(notes, 'Questions')).toBeVisible();
    await expect(notesOf(notes).getByText('No notes for this Resource.')).toBeVisible();
    await expect(movesOf(notes).getByText('This is the end of the talk.')).toBeVisible();
    await movesOf(notes).getByRole('button', { name: 'Back' }).click();
    await expect(presentedName(page)).toHaveText('Demo');
  },
);

test(
  'the Notes window waits while nothing presents, and follows a presentation that starts',
  { tag: '@parity:notes-window-waits-while-nothing-presents' },
  async ({ page }) => {
    const spaceId = await seedTalk(page);
    const notes = await openNotesWindow(page, spaceId);
    await expect(notesWindow(notes).getByText('Not presenting')).toBeVisible();
    await expect(notesWindow(notes).getByRole('button')).toHaveCount(0);

    await page.goto(presentPath(spaceId, ids.welcome));
    await expect(presentedName(page)).toHaveText('Welcome');
    await expect(presenting(notes, 'Welcome')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(stage(page)).toHaveCount(0);
    await expect(notesWindow(notes).getByText('Not presenting')).toBeVisible();
  },
);

test('the Notes window shows "not presenting" when the presenting window crashes', async ({
  page,
}) => {
  const spaceId = await seedTalk(page);
  const notes = await openNotesWindow(page, spaceId);
  await page.goto(presentPath(spaceId, ids.welcome));
  await expect(presentedName(page)).toHaveText('Welcome');
  await expect(presenting(notes, 'Welcome')).toBeVisible();

  // A crashed renderer runs no `pagehide` and posts nothing; only the browser
  // letting go of its Web Lock can tell the Notes window. The crash takes the
  // target down before it can answer, so the command's reply never comes.
  const crashed = page.waitForEvent('crash');
  const devtools = await page.context().newCDPSession(page);
  void devtools.send('Page.crash').catch(() => undefined);
  await crashed;

  await expect(notesWindow(notes).getByText('Not presenting')).toBeVisible();
});

test(
  'N shows the notes under the Stage to rehearse on one screen, and they start hidden every time',
  { tag: '@parity:stage-shows-rehearsal-notes-under-the-chrome' },
  async ({ page }) => {
    const spaceId = await seedTalk(page);
    await page.goto(presentPath(spaceId, ids.welcome));
    await expect(presentedName(page)).toHaveText('Welcome');
    const rehearsal = stage(page).getByRole('region', { name: 'Rehearsal notes' });
    const toggle = stage(page).getByRole('button', { name: 'Rehearsal notes' });
    const rehearsalNames = rehearsal.getByTestId('resource-content').locator('.resource__title');
    await expect(rehearsal).toHaveCount(0);

    await page.keyboard.press('n');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(rehearsalNames).toHaveText(['Open with the outage', 'Thank the team']);
    await page.keyboard.press('ArrowRight');
    await expect(presentedName(page)).toHaveText('Demo');
    await expect(rehearsalNames).toHaveText(['Backup video']);
    await page.keyboard.press('n');
    await expect(rehearsal).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('n');
    await expect(rehearsalNames).toHaveText(['Backup video']);

    // Leaving and presenting again starts with them hidden.
    await page.keyboard.press('Escape');
    await expect(stage(page)).toHaveCount(0);
    await presentControl(page).click();
    await expect(stage(page)).toBeVisible();
    await expect(rehearsal).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    await expect(rehearsalNames).toHaveText(['Open with the outage', 'Thank the team']);
    await toggle.click();
    await expect(rehearsal).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  },
);

test('browser Back mid-talk keeps the rehearsal notes shown and the Notes window following', async ({
  page,
}) => {
  const spaceId = await seedTalk(page);
  await page.goto(presentPath(spaceId, ids.welcome));
  await expect(presentedName(page)).toHaveText('Welcome');
  const notes = await openNotesWindow(page, spaceId);
  await expect(presenting(notes, 'Welcome')).toBeVisible();
  const rehearsal = stage(page).getByRole('region', { name: 'Rehearsal notes' });
  const rehearsalNames = rehearsal.getByTestId('resource-content').locator('.resource__title');

  await page.keyboard.press('n');
  await page.keyboard.press('ArrowRight');
  await expect(presentedName(page)).toHaveText('Demo');
  await expect(rehearsalNames).toHaveText(['Backup video']);
  await expect(presenting(notes, 'Demo')).toBeVisible();

  // Back reopens the talk at the Resource before, which is the same presentation.
  await page.goBack();
  await expect(presentedName(page)).toHaveText('Welcome');
  await expect(rehearsalNames).toHaveText(['Open with the outage', 'Thank the team']);
  await expect(presenting(notes, 'Welcome')).toBeVisible();

  // And the Notes window still drives it.
  await movesOf(notes).getByRole('button', { name: 'Go to Demo' }).click();
  await expect(presentedName(page)).toHaveText('Demo');
});
