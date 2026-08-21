import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import type { CardChoice } from '@project/ui';
import {
  SelectedEdgeControls,
  type SelectedEdgeControlsProps,
} from '../src/components/SelectedEdgeControls';

/**
 * The selected Edge's controls on their own, without a canvas under them.
 *
 * This is the production interface the tests moved to: the surface takes domain
 * facts and callbacks, so every state it can be in — including the refusals no
 * browser gesture can reach, which need the Space to have changed under an open
 * editor — is reachable here. The React Flow half is `AuthorableEdge`'s and is
 * pinned by `edge-authoring-react.test.tsx` and by the Playwright suite.
 */

const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_C = uuidSchema.parse('00000000-0000-4000-8000-000000000003');

const CHOICES: readonly CardChoice[] = [
  { id: CARD_A, title: 'A', kind: 'markdown' },
  { id: CARD_B, title: 'B', kind: 'markdown' },
  { id: CARD_C, title: 'C', kind: 'markdown', refusal: 'These Cards are already connected.' },
];

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
});

const mount = (props: Partial<SelectedEdgeControlsProps> = {}) => {
  const handlers = {
    onOpenEditor: vi.fn(),
    onCloseEditor: vi.fn(),
    onReconnect: vi.fn(),
    onDelete: vi.fn(),
  };
  const view = render(
    <SelectedEdgeControls
      from={CARD_A}
      to={CARD_B}
      editorOpen={false}
      endpointChoices={() => CHOICES}
      refusal={null}
      {...handlers}
      {...props}
    />,
  );
  return { ...handlers, ...view };
};

describe('the controls a selected Edge offers', () => {
  it('offers Edit and Delete, and opens nothing until Edit is pressed', () => {
    const { onOpenEditor } = mount();
    expect(screen.queryByTestId('edge-editor')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit this Edge' }));

    expect(onOpenEditor).toHaveBeenCalledTimes(1);
    // Controlled by Edge Authoring: pressing Edit asks, and the editor appears
    // only once the owner says the draft is open.
    expect(screen.queryByTestId('edge-editor')).not.toBeInTheDocument();
  });

  /** Immediate, with no confirmation step between the press and the Edit. */
  it('deletes on the press', () => {
    const { onDelete } = mount();

    fireEvent.click(screen.getByRole('button', { name: 'Delete this Edge' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('shows both endpoints on the Cards they name when the editor stands', () => {
    mount({ editorOpen: true });

    expect(screen.getByRole('combobox', { name: 'From' })).toHaveValue('A');
    expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('B');
    expect(screen.getByRole('button', { name: 'Edit this Edge' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  /**
   * The rows do not move under a pointer already on its way to one.
   *
   * Eligibility is asked once per opening, so a Space that changes while the
   * editor stands leaves the list as it was — and the completion's own
   * re-validation, not a live list, is what keeps the pick safe.
   */
  it('asks for endpoint choices once per opening, not once per render', () => {
    const endpointChoices = vi.fn(() => CHOICES);
    const { rerender } = render(
      <SelectedEdgeControls
        from={CARD_A}
        to={CARD_B}
        editorOpen
        endpointChoices={endpointChoices}
        refusal={null}
        onOpenEditor={() => undefined}
        onCloseEditor={() => undefined}
        onReconnect={() => undefined}
        onDelete={() => undefined}
      />,
    );
    expect(endpointChoices).toHaveBeenCalledTimes(2);

    rerender(
      <SelectedEdgeControls
        from={CARD_A}
        to={CARD_C}
        editorOpen
        endpointChoices={endpointChoices}
        refusal={null}
        onOpenEditor={() => undefined}
        onCloseEditor={() => undefined}
        onReconnect={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(endpointChoices).toHaveBeenCalledTimes(2);
  });

  /** A refused Card stays visible with its reason rather than dropping out of the list. */
  it('keeps an ineligible Card in the list, disabled, with the reason it cannot be chosen', () => {
    mount({ editorOpen: true });

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'To' }), { key: 'ArrowDown' });

    const refused = screen.getByRole('option', { name: /These Cards are already connected/ });
    expect(refused).toHaveAttribute('aria-disabled', 'true');
    expect(refused).toHaveTextContent('C');
  });
});

/*
 * Escape's two layers are deliberately **not** pinned here.
 *
 * The rule — the open endpoint list answers the first press, this editor the
 * second — is a browser one, and jsdom cannot isolate it: Base UI's Popover
 * answers Escape there whatever the list is doing, so a jsdom assertion passes
 * for the primitive's reasons rather than for this component's handler. In
 * Chromium the primitive's Escape branch is suppressed outright by a
 * combobox carrying a selected value, which is why the handler exists at all
 * (`.scratch/design-system-baseline/findings/base-ui-popover-escape-and-combobox-value.md`).
 * `packages/app/ladle-e2e/issue-06-graph-hud-and-edge-controls.spec.ts` presses
 * the two keys in a real browser and is where that claim lives.
 */

describe('where a refused Edge Edit is said', () => {
  it.each([['from', 'To'] as const, ['to', 'From'] as const])(
    'marks only the attempted %s Field invalid',
    (endpoint, untouched) => {
      mount({
        editorOpen: true,
        refusal: { kind: 'reconnection', endpoint, refusal: { code: 'edge-already-exists' } },
      });

      const attempted = screen.getByRole('combobox', { name: endpoint === 'from' ? 'From' : 'To' });
      expect(attempted).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('combobox', { name: untouched })).toHaveAttribute(
        'aria-invalid',
        'false',
      );
      // The description reaches the sentence, rather than the sentence merely
      // being on screen somewhere near it.
      const describedBy = attempted.getAttribute('aria-describedby');
      expect(describedBy).not.toBeNull();
      expect(document.getElementById(describedBy ?? '')).toHaveTextContent(
        'These Cards are already connected in this Graph.',
      );
      expect(screen.queryByTestId('edge-endpoint-refusal')).not.toBeInTheDocument();
    },
  );

  /** A Layout, Graph or Edge that has gone: no row in either list would answer it. */
  it('uses the form channel for a refusal no endpoint could correct', () => {
    mount({
      editorOpen: true,
      refusal: { kind: 'reconnection', endpoint: 'to', refusal: { code: 'edge-not-found' } },
    });

    expect(screen.getByTestId('edge-endpoint-refusal')).toHaveTextContent(
      'That Edge is no longer in this Graph.',
    );
    expect(screen.getByRole('combobox', { name: 'From' })).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('combobox', { name: 'To' })).toHaveAttribute('aria-invalid', 'false');
  });

  /**
   * A refused Delete stays on the surviving controls.
   *
   * The Edge is still there and still selected, so its controls are still on
   * screen — which makes them the surface the author is looking at. It is
   * neither an endpoint error nor a canvas announcement.
   */
  it('keeps a refused Delete on the controls that asked, with the editor closed', () => {
    mount({ refusal: { kind: 'deletion', refusal: { code: 'graph-not-owned' } } });

    expect(screen.getByTestId('edge-delete-refusal')).toHaveTextContent(
      'That Graph is not one this Layout owns.',
    );
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.queryByTestId('edge-editor')).not.toBeInTheDocument();
  });

  it('does not put a refused Delete on either endpoint Field', () => {
    mount({
      editorOpen: true,
      refusal: { kind: 'deletion', refusal: { code: 'graph-not-owned' } },
    });

    expect(screen.getByRole('combobox', { name: 'From' })).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('combobox', { name: 'To' })).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByTestId('edge-endpoint-refusal')).not.toBeInTheDocument();
  });
});
