import { expect, expectTypeOf, it, vi } from 'vitest';
import { uuidSchema, type Card } from '@project/core';
import type { ResolvedContentCard } from '@project/graph';
import { OpenCard, type OpenCardProps } from '../src/components/OpenCard';

/**
 * The pane's props carry their own invariant, and only a typecheck can say so.
 *
 * These assertions are a runtime no-op: `expectTypeOf` compiles to nothing and
 * `pnpm test` will pass this file whatever the props type says. The root
 * `pnpm typecheck` is what enforces it — the same arrangement, and the same
 * caveat, as `packages/http/test/space-http-app-types.test.ts`.
 */

const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');

const markdown: ResolvedContentCard = { id: CARD_ID, title: 'A', kind: 'markdown', body: 'source' };
const other: ResolvedContentCard = { id: ALIAS_ID, title: 'B', kind: 'markdown', body: 'other' };
const noop = vi.fn();

/** The half of the props that never varies, kept out of every assertion below. */
type Handlers = {
  onComplete: (card: ResolvedContentCard) => string | null;
  onCancel: () => void;
};

it('takes an open in exactly one of its two forms', () => {
  // Directly opened: one Card, which owns the content it is about to author.
  expectTypeOf<Handlers & { card: ResolvedContentCard }>().toExtend<OpenCardProps>();
  // Delegated: the occurrence that was opened, and the Card whose content it
  // reaches. Two Cards, and the props say which is which.
  expectTypeOf<
    Handlers & { through: Card; content: ResolvedContentCard }
  >().toExtend<OpenCardProps>();
});

/**
 * The pair `opened: Card` and `content: ResolvedContentCard` used to be two
 * independent props, and nothing related them: any two Cards typechecked, and a
 * pair that did not satisfy `content === resolveContentCard(space, opened.id)`
 * authored a Card the author never opened. A direct open now names one Card, so
 * the mismatched pair cannot be written down at all.
 */
it('cannot be handed two Cards without being told which was opened', () => {
  expectTypeOf<
    Handlers & { card: ResolvedContentCard; content: ResolvedContentCard }
  >().not.toExtend<OpenCardProps>();
});

/**
 * Delegation is the discriminant, not something read back off `Card.kind`.
 * `opened.kind === 'alias'` answered the same question by proxy, and would
 * answer it wrong for any later kind that resolves its content elsewhere: the
 * pane would draw a Title field renaming the *content* owner while the graph
 * behind it draws the *opened* Card's title. That is the negative ADR 0039
 * exists to prevent, and it is now unrepresentable rather than merely avoided.
 */
it('will not take a delegated open apart', () => {
  // An occurrence with nothing to delegate to is half a pair.
  expectTypeOf<Handlers & { through: Card }>().not.toExtend<OpenCardProps>();
  // Content with nothing it was opened through is the other half.
  expectTypeOf<Handlers & { content: ResolvedContentCard }>().not.toExtend<OpenCardProps>();
  // Neither half, which is what a caller that forgot the Card entirely writes.
  expectTypeOf<Handlers>().not.toExtend<OpenCardProps>();
});

/**
 * A directly opened Card is its own content, so the direct form takes only a
 * Card that owns some — an Alias reaching this variant is exactly the state
 * that would draw a Title field over a Card whose title is not the one on
 * screen behind the pane.
 */
it('refuses a direct open of a Card that owns no content', () => {
  expectTypeOf<Handlers & { card: Card }>().not.toExtend<OpenCardProps>();
});

/**
 * The same refusal reached the way a caller actually writes it. JSX checks its
 * attributes against the props type, so this adds no rule — what it pins is
 * that the rule is one a caller meets in the form they write, rather than one
 * that only holds for a props object assembled by hand.
 */
it('refuses the mismatched pair where a caller would write it', () => {
  const rendered = (
    <>
      {/* @ts-expect-error A direct open names one Card; a second cannot ride along. */}
      <OpenCard card={markdown} content={other} onComplete={noop} onCancel={noop} />
    </>
  );

  expect(rendered).toBeDefined();
});
