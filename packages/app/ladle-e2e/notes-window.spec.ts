import { expect, test, type Page } from '@playwright/test';

/**
 * The Notes window, rendered through the production `NotesWindowApplication`
 * following real Navigation over a real presentation link (ADR 0052, ADR 0129).
 *
 * These prove what the Notes window draws and what it sends. That a second
 * browser window follows the first over `BroadcastChannel` is the application
 * suite's to prove.
 */

const story = (name: string) => `/?story=components--notes-window--${name}&mode=preview`;

const notesWindow = (page: Page) => page.getByRole('main', { name: 'Notes window' });
const notes = (page: Page) => notesWindow(page).getByRole('region', { name: 'Notes' });
const moves = (page: Page) => notesWindow(page).getByRole('region', { name: 'Moves' });
const noteNames = (page: Page) =>
  notes(page).getByTestId('resource-content').locator('.resource__title');

test(
  'draws the notes in Map order and a preview of every move',
  { tag: '@parity:notes-window-draws-notes-in-map-order-and-every-move' },
  async ({ page }) => {
    await page.goto(story('fork'));

    await expect(notesWindow(page).getByText('Presenting Welcome')).toBeVisible();
    await expect(notes(page).getByText('From Launch talk Presentation Notes')).toBeVisible();
    await expect(noteNames(page)).toHaveText(['Open with the outage', 'Thank the team']);
    await expect(moves(page).getByRole('button', { name: 'Go to Demo' })).toBeVisible();
    await expect(moves(page).getByRole('button', { name: 'Choose Architecture' })).toBeVisible();
    await expect(moves(page).getByRole('figure', { name: 'Preview of Demo' })).toContainText(
      'A live walk through checkout.',
    );
    await expect(
      moves(page).getByRole('figure', { name: 'Preview of Architecture' }),
    ).toContainText('How a write reaches every replica.');
    await expect(notesWindow(page).getByRole('status', { name: 'Elapsed time' })).toHaveText(
      '12:30',
    );
  },
);

test(
  'a move pressed here, or an arrow key, moves the presentation',
  { tag: '@parity:notes-window-drives-the-presentation' },
  async ({ page }) => {
    await page.goto(story('one-note'));
    await expect(noteNames(page)).toHaveText(['Backup video']);

    await moves(page).getByRole('button', { name: 'Go to Questions' }).click();
    await expect(notesWindow(page).getByText('Presenting Questions')).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(notesWindow(page).getByText('Presenting Demo')).toBeVisible();
    await expect(noteNames(page)).toHaveText(['Backup video']);
  },
);

test(
  'says when a Resource has no notes and the talk ends',
  { tag: '@parity:notes-window-marks-the-end-and-a-resource-without-notes' },
  async ({ page }) => {
    await page.goto(story('end'));

    await expect(notes(page).getByText('No notes for this Resource.')).toBeVisible();
    await expect(moves(page).getByText('This is the end of the talk.')).toBeVisible();
    await expect(moves(page).getByRole('button', { name: 'Back' })).toBeVisible();
  },
);

test(
  'says it is not presenting while nothing presents',
  { tag: '@parity:notes-window-waits-while-nothing-presents' },
  async ({ page }) => {
    await page.goto(story('not-presenting'));

    await expect(notesWindow(page).getByText('Not presenting')).toBeVisible();
    await expect(notesWindow(page).getByRole('status', { name: 'Elapsed time' })).toHaveCount(0);
    await expect(notesWindow(page).getByRole('button')).toHaveCount(0);
  },
);
