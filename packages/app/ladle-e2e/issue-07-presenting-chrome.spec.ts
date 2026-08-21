import { expect, test, type Page } from '@playwright/test';

/**
 * The presenting chrome, rendered through real Navigation over purpose-built
 * Spaces (ADR 0052).
 *
 * These prove the chrome's own contract: what each control does and says, what
 * is announced, where focus lands after a command destroys the control that ran
 * it, and how the surface composes when the region is too narrow for a row. The
 * real camera, canvas and Edge Authoring composition is the application suite's
 * to prove; nothing here stands in for it.
 */

const story = (name: string) => `/?story=components--presenting-chrome--${name}&mode=preview`;

/** What the guidance currently claims is bound. */
const guidance = (page: Page) => page.getByTestId('presenting-keys').getByRole('listitem');

test(
  'a line offers one move, named as the destination it goes to',
  { tag: '@parity:presenting-line-offers-one-move' },
  async ({ page }) => {
    await page.goto(story('line'));

    const moves = page.getByTestId('presenting-moves').getByRole('button');
    await expect(moves).toHaveCount(1);
    // The degenerate fork, not a second mode (ADR 0024): one member, and the
    // same control the fork below draws.
    await expect(moves).toHaveAccessibleName('Go to How it works');
    await expect(moves).toHaveText('How it works');

    // Only the commands available from here. Nothing to choose between and
    // nowhere to go back to, so neither is claimed.
    await expect(guidance(page)).toHaveText(['→go', 'Escoverview']);
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
    await expect(page.getByTestId('exit-presenting')).toBeVisible();
  },
);

/**
 * The global Traversal keys and a focused control on one press.
 *
 * A button activates itself on Space, and the global `keydown` sees the press
 * first. Advancing there as well moved two Cards for one press; preventing the
 * default instead stopped the button firing at all. Landing on `Wrap up` is the
 * first defect and landing nowhere is the second, so the assertion is the Card
 * one move on.
 */
test(
  'Space on a focused move activates that control exactly once',
  { tag: '@parity:presenting-space-activates-one-control-once' },
  async ({ page }) => {
    await page.goto(story('line'));

    const move = page.getByRole('button', { name: 'Go to How it works' });
    await move.focus();
    await page.keyboard.press('Space');

    await expect(page.getByRole('button', { name: 'Go to Wrap up' })).toBeVisible();
    await expect(page.getByTestId('presenting-end')).toHaveCount(0);
    // Focus is owed by the command that destroyed the control which ran it.
    await expect(page.getByRole('button', { name: 'Go to Wrap up' })).toBeFocused();

    // Arrow keys are nobody's native activation and stay global, so the same
    // focused control still traverses with them.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('presenting-end')).toBeVisible();
  },
);

/**
 * Choosing is not going. An unselected move selects, the selected one commits,
 * and neither is a radio, a toggle or a destination that disables itself.
 */
test(
  'a fork selects a branch and then commits down the one chosen',
  { tag: '@parity:presenting-fork-selects-then-commits' },
  async ({ page }) => {
    await page.goto(story('fork'));

    const moves = page.getByTestId('presenting-moves').getByRole('button');
    const named = () => moves.evaluateAll((items) => items.map((item) => item.ariaLabel));
    await expect(moves).toHaveCount(4);
    expect(await named()).toEqual([
      'Go to Read path',
      'Choose Write path',
      'Choose Failure modes',
      'Choose Operating notes, rollback and the on-call runbook',
    ]);
    await expect(guidance(page)).toHaveText(['↑↓choose', '→go', 'Escoverview']);

    await page.getByRole('button', { name: 'Choose Failure modes' }).click();

    // Selecting is the whole of what that click did: the choice set is the same
    // four moves, with the verbs swapped.
    expect(await named()).toEqual([
      'Choose Read path',
      'Choose Write path',
      'Go to Failure modes',
      'Choose Operating notes, rollback and the on-call runbook',
    ]);

    await page.getByRole('button', { name: 'Go to Failure modes' }).click();

    // Committed down the branch chosen and no other. Each branch of this Graph
    // ends where it arrives, so the Card reached is a sink.
    await expect(page.getByTestId('presenting-end')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back' })).toBeFocused();
  },
);

test(
  'a sink announces the end of the Graph and Back recovers the Card before it',
  { tag: '@parity:presenting-sink-ends-the-graph-and-can-retreat' },
  async ({ page }) => {
    await page.goto(story('sink'));

    // The moves and the end state share one polite region, so a changed choice
    // set is announced where it changed rather than by focus being moved to it.
    const announced = page.getByTestId('presenting-choices');
    await expect(announced).toHaveAttribute('aria-live', 'polite');
    await expect(announced).toContainText('End of Graph');
    await expect(page.getByTestId('presenting-moves')).toHaveCount(0);
    await expect(guidance(page)).toHaveText(['←back', 'Escoverview']);

    await page.getByRole('button', { name: 'Back' }).click();

    const recovered = page.getByRole('button', { name: 'Go to Wrap up' });
    await expect(recovered).toBeVisible();
    await expect(recovered).toBeFocused();
  },
);

/**
 * The chrome reads its own width rather than the viewport's — the workspace
 * Sidebar takes 16rem of that width above the breakpoint and none below — so a
 * narrow *region* is the same question a narrow window asks.
 */
test(
  'a narrow chrome keeps the choices in their own row above the other controls',
  { tag: '@parity:presenting-narrow-keeps-choices-and-controls' },
  async ({ page }) => {
    await page.goto(story('narrow'));

    const choices = page.getByTestId('presenting-choices');
    const overview = page.getByTestId('exit-presenting');
    const choicesBox = (await choices.boundingBox())!;
    const overviewBox = (await overview.boundingBox())!;

    // Below the choices rather than beside them, and still carrying its label.
    expect(overviewBox.y).toBeGreaterThanOrEqual(choicesBox.y + choicesBox.height);
    await expect(overview).toHaveText('Overview');
    await expect(guidance(page)).toHaveText(['↑↓choose', '→go', 'Escoverview']);

    // The choices are not collapsed into a menu, and not wrapped into a block
    // over the presented Card either: one bounded row that scrolls.
    const moves = page.getByTestId('presenting-moves');
    await expect(moves.getByRole('button')).toHaveCount(4);

    // A Card's title has no length limit, so the longest choice is ellipsized
    // inside its own button rather than overflowing past both ends of it. The
    // full title stays in the accessible name.
    const longest = page.getByRole('button', {
      name: 'Choose Operating notes, rollback and the on-call runbook',
    });
    const label = await longest.evaluate((button) => {
      const span = button.querySelector('span');
      return {
        overflows: span !== null && span.scrollWidth > span.clientWidth,
        ellipsis: span === null ? '' : getComputedStyle(span).textOverflow,
        buttonOverflows: button.scrollWidth > button.clientWidth,
      };
    });
    expect(label.overflows).toBe(true);
    expect(label.ellipsis).toBe('ellipsis');
    expect(label.buttonOverflows).toBe(false);
    const row = await moves.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      rows: new Set(Array.from(element.children, (child) => child.getBoundingClientRect().top))
        .size,
    }));
    expect(row.rows).toBe(1);
    expect(row.scrollWidth).toBeGreaterThan(row.clientWidth);

    // And the selected choice is brought into that row's view rather than left
    // off the end of it.
    await page.keyboard.press('ArrowUp');
    await expect(
      page.getByRole('button', { name: 'Go to Operating notes, rollback and the on-call runbook' }),
    ).toBeInViewport();
  },
);
