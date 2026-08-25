import { expectTypeOf, it } from 'vitest';
import { uuidSchema, type Card } from '@project/core';
import type { OpenCardProps } from '../src/components/OpenCard';
import type { AuthoringRefusal } from '../src/space-authoring';

/**
 * The pane's props carry their own invariant, and only a typecheck can say so.
 *
 * These assertions are a runtime no-op: `expectTypeOf` compiles to nothing and
 * `pnpm test` will pass this file whatever the props type says. The root
 * `pnpm typecheck` is what enforces it — the same setup, and the same
 * caveat, as `packages/http/test/space-http-app-types.test.ts`.
 */

const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
/** The half of the props that never varies, kept out of every assertion below. */
type AliasHandlers = {
  through: Extract<Card, { kind: 'alias' }>;
  occurrence: {
    targets: readonly Card[];
    onEdit: (change: { title: string; target: typeof CARD_ID }) => AuthoringRefusal | null;
  };
  onCancel: () => void;
};

it('takes only the Alias metadata form', () => {
  expectTypeOf<AliasHandlers>().toExtend<OpenCardProps>();
});

/**
 * An Alias editor requires the Alias-authoring capability and accepts no Target
 * content completion.
 */
it('will not take a delegated open apart', () => {
  // An Alias with no authoring capability is incomplete.
  expectTypeOf<{ through: Card; onCancel: () => void }>().not.toExtend<OpenCardProps>();
});

/**
 * A directly opened Card is its own content, so the direct form takes only a
 * Card that owns some — an Alias reaching this variant is exactly the state
 * that would draw a Title field over a Card whose title is not the one on
 * screen behind the pane.
 */
it('refuses every direct content Card open', () => {
  expectTypeOf<{ card: Card; onCancel: () => void }>().not.toExtend<OpenCardProps>();
});
