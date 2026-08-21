import type { Story } from '@ladle/react';
import { DUPLICATE_TARGET, SelectedEdgeFixture } from '../support/SelectedEdgeFixture';

export default { title: 'Components/Selected Edge Controls' };

/**
 * The seven states a selected Edge's controls can be in, each mounted from the
 * unchanged production component.
 *
 * Four of them are refusals, and every one is handed in **structured**: the
 * sentence, the channel and the Field are derived by the same adapters the
 * canvas uses (ADR 0057). Three of the four are unreachable through any browser
 * gesture — the pickers only ever offer eligible Cards, so a refused completion
 * needs the Space to have moved under an open editor — which is exactly why the
 * catalogue is where they are exercised.
 */

/** Selection alone: Edit and Delete, and nothing opened. */
export const Closed: Story = () => <SelectedEdgeFixture />;

/** Edit pressed: both endpoints, each showing the Card it currently names. */
export const EndpointEditor: Story = () => <SelectedEdgeFixture editorOpen />;

/** A Card the Graph already reaches: still listed, disabled, with its reason. */
export const DisabledChoice: Story = () => (
  <SelectedEdgeFixture
    editorOpen
    ineligible={{ cardId: DUPLICATE_TARGET, refusal: 'edge-already-exists' }}
  />
);

/** A refused From: only that Field is invalid, and its description carries why. */
export const FromRefusal: Story = () => (
  <SelectedEdgeFixture
    editorOpen
    refusal={{ kind: 'reconnection', endpoint: 'from', refusal: { code: 'edge-already-exists' } }}
  />
);

/** The same refusal attempted on the other endpoint, marking only To. */
export const ToRefusal: Story = () => (
  <SelectedEdgeFixture
    editorOpen
    refusal={{ kind: 'reconnection', endpoint: 'to', refusal: { code: 'edge-already-exists' } }}
  />
);

/**
 * An Edge the Graph no longer holds: neither Field is marked, because no row in
 * either list would answer it.
 */
export const ReconnectionRefusal: Story = () => (
  <SelectedEdgeFixture
    editorOpen
    refusal={{ kind: 'reconnection', endpoint: 'to', refusal: { code: 'edge-not-found' } }}
  />
);

/**
 * A refused Delete, with the editor closed: the Edge survived, so its controls
 * are still on screen and are where the refusal stays.
 */
export const DeletionRefusal: Story = () => (
  <SelectedEdgeFixture
    refusal={{
      kind: 'deletion',
      refusal: { code: 'layout-required', operation: 'deleted-edge' },
    }}
  />
);
