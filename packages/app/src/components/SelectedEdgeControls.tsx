import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { CardId } from '@project/core';
import {
  Button,
  CardSearchCombobox,
  Field,
  FieldError,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  cn,
  type CardChoice,
} from '@project/ui';
import {
  presentEdgeDeletionRefusal,
  presentEdgeEndpointRefusal,
  type EdgeEndpointRefusalErrors,
} from '../authoring-refusal';
import type { SelectedEdgeRefusal } from '../edge-authoring';
import type { EdgeEndpoint } from '../space-authoring';

/**
 * The two Field error ids, literals rather than a `useId`.
 *
 * One Edge is selected at a time and one editor opens for it, so there is no
 * second instance for these to collide with — and a literal is what lets the
 * `aria-describedby` and the `FieldError` beneath it be read as the same fact in
 * one glance, as the Card panes' own field ids already are. React's `useId`
 * would also mint `:r3:`, which is a legal DOM id and not a parseable CSS
 * selector, so every test reaching the sentence would have to work around it.
 */
const FROM_ERROR = 'edge-from-error';
const TO_ERROR = 'edge-to-error';

/** The raised card these controls and their refusal are both drawn on. */
const RAISED_SURFACE =
  'rounded-[6px] border border-border bg-card shadow-[0_6px_20px_rgb(0_0_0/45%)]';

/** Two commands in one group: square edges, and the group's border around them. */
const GROUPED_COMMAND = 'rounded-none border-0 text-[0.75rem] text-foreground';

/**
 * Escape closes the topmost layer: the open endpoint list first, this editor
 * after — and this handler is what makes the second half happen at all.
 *
 * **A `CardSearchCombobox` carrying a selected value blocks Base UI's own
 * Popover dismissal.** Measured against `@base-ui/react` 1.7.0 in Chromium: the
 * same Popover closes on Escape with a combobox whose `value` is `null`, and
 * stops closing the moment one is selected — `onOpenChange` is never called,
 * while an outside press still closes it, so the popup's dismissal is live and
 * only the Escape branch is suppressed. Both endpoint pickers always name the
 * Card they currently point at, so this editor is never in the case that works.
 * The reproduction is written up in
 * `.scratch/design-system-baseline/findings/base-ui-popover-escape-and-combobox-value.md`.
 *
 * **Capture phase, and the reason is that a bubble handler is never called at
 * all.** Measured by swapping this one prop to `onKeyDown` and running the Ladle
 * Escape spec: the editor then fails to close on *either* press, not merely the
 * first. Base UI's own `keydown` listener sits on `document` and stops the event
 * before it reaches the root container React delegates from, so the bubble half
 * of that delegation never fires for a press inside this popup. React's capture
 * listener runs on the way *down* — root container before document-level bubble
 * listeners — which is early enough to be asked, and early enough that the open
 * list still reads `aria-expanded="true"`, which is what makes the guard below
 * load-bearing rather than decorative.
 *
 * The connect picker in `edge-authoring-react.tsx` answers Escape on the bubble
 * phase and is right to: it is a plain div in the app's own tree rather than a
 * Base UI popup, so nothing intercepts the event on its way to React. The two
 * differ because their hosts do, not because one of them is stale.
 */
const dismissOnEscape =
  (close: () => void) =>
  (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Escape') return;
    // Any expanded thing inside the popup is an endpoint list: the two
    // comboboxes are the only controls in here that carry `aria-expanded`, and
    // the Edit button that carries it too is outside the popup.
    if (event.currentTarget.querySelector('[aria-expanded="true"]') !== null) return;
    close();
  };

export interface SelectedEdgeControlsProps {
  /** The Card each endpoint currently names, so its picker opens on it. */
  readonly from: CardId;
  readonly to: CardId;
  /**
   * Whether the endpoint editor stands.
   *
   * Controlled, and controlled by Edge Authoring rather than here: the draft is
   * the module's, a Space replacement or an activated Graph withdraws it, and a
   * second copy of "the editor is open" kept in this component would go on
   * standing after either.
   */
  readonly editorOpen: boolean;
  /**
   * Which Cards an endpoint may move to, and why each cannot.
   *
   * A function rather than two arrays, because **the answer is snapshotted when
   * the editor opens**: recomputing under an open list would move the rows under
   * a pointer already on its way to one, and would not make the pick safe either
   * — only the completion's re-validation does that.
   */
  readonly endpointChoices: (endpoint: EdgeEndpoint) => readonly CardChoice[];
  readonly refusal: SelectedEdgeRefusal | null;
  readonly onOpenEditor: () => void;
  readonly onCloseEditor: () => void;
  readonly onReconnect: (endpoint: EdgeEndpoint, cardId: CardId) => void;
  readonly onDelete: () => void;
}

/**
 * What a selected Edge offers its author: Edit, Delete, and the endpoint editor.
 *
 * Deliberately knows nothing about React Flow. It takes no `EdgeProps`, no label
 * coordinates and no Edge subject — the adapter's `AuthorableEdge` owns the
 * routed path, the portal and the placement, and hands this the domain facts
 * that are left. That is what lets the whole surface mount in a catalogue with
 * no canvas under it.
 *
 * **Delete is immediate.** There is no confirmation step: a refused Delete says
 * so on this surface, and an accepted one is undone by authoring the Edge again.
 *
 * **Selecting an Edge does not open the editor.** React Flow's own Enter and
 * Space keep their native selection meaning on the Edge itself; only Edit opens
 * anything.
 */
export function SelectedEdgeControls({
  from,
  to,
  editorOpen,
  endpointChoices,
  refusal,
  onOpenEditor,
  onCloseEditor,
  onReconnect,
  onDelete,
}: SelectedEdgeControlsProps) {
  const anchor = useRef<HTMLDivElement>(null);
  // A refused Delete stays here rather than falling through to the canvas
  // announcement: the Edge survives its own refusal, so the controls that asked
  // are still on screen and are where the author is looking.
  const deletion =
    refusal?.kind === 'deletion' ? presentEdgeDeletionRefusal(refusal.refusal) : null;

  return (
    <Popover open={editorOpen} onOpenChange={(next) => (next ? onOpenEditor() : onCloseEditor())}>
      <div className="flex flex-col items-center gap-1">
        <div ref={anchor} className={cn('flex items-stretch overflow-hidden', RAISED_SURFACE)}>
          {/*
            **Registered as the popup's trigger, not merely a button that opens
            it.** Base UI dismisses a popup on an outside press, and a button it
            does not know as the trigger *is* outside: the pointerdown closed the
            editor and the click that followed reopened it, so Edit could never
            be the close. Being the trigger is also what supplies `aria-expanded`
            and `aria-haspopup` — the controlled `open` above stays Edge
            Authoring's, and the toggle arrives through `onOpenChange`.
          */}
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="toolbar"
                className={GROUPED_COMMAND}
                data-testid="edge-edit"
                aria-label="Edit this Edge"
              >
                Edit
              </Button>
            }
          />
          <Separator orientation="vertical" />
          <Button
            variant="ghost"
            size="toolbar"
            className={GROUPED_COMMAND}
            data-testid="edge-delete"
            aria-label="Delete this Edge"
            onClick={onDelete}
          >
            Delete
          </Button>
        </div>
        {deletion !== null && (
          <FieldError
            data-testid="edge-delete-refusal"
            className={cn('max-w-[15rem] px-[0.5rem] py-[0.25rem] text-[0.75rem]', RAISED_SURFACE)}
          >
            {deletion.form}
          </FieldError>
        )}
      </div>
      <PopoverContent
        anchor={anchor}
        className="min-w-[16rem]"
        data-testid="edge-editor"
        aria-label="Edge endpoints"
        onKeyDownCapture={dismissOnEscape(onCloseEditor)}
      >
        <EdgeEndpointFields
          from={from}
          to={to}
          endpointChoices={endpointChoices}
          refusal={refusal?.kind === 'reconnection' ? refusal : null}
          onReconnect={onReconnect}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The Edge's two endpoints as pickers — the keyboard path to a reconnection.
 *
 * Both fields show the Card they currently name, so the existing endpoint is
 * unchanged until the author picks another; a result that would duplicate a
 * different Edge in this Graph arrives from eligibility already disabled, with
 * its reason on the row rather than the row missing.
 *
 * Its own component because the popup mounts it: Base UI unmounts a closed
 * popup, so the snapshot below is taken **per opening** rather than per render.
 * A Space that changes while the editor stands therefore leaves the list stale,
 * which is the design's own answer rather than an oversight — the completion
 * re-validates against the current Space and refuses if it has moved, and this
 * component shows that refusal on the Field the author attempted.
 */
function EdgeEndpointFields({
  from,
  to,
  endpointChoices,
  refusal,
  onReconnect,
}: {
  readonly from: CardId;
  readonly to: CardId;
  readonly endpointChoices: (endpoint: EdgeEndpoint) => readonly CardChoice[];
  readonly refusal: Extract<SelectedEdgeRefusal, { readonly kind: 'reconnection' }> | null;
  readonly onReconnect: (endpoint: EdgeEndpoint, cardId: CardId) => void;
}) {
  const errors: EdgeEndpointRefusalErrors =
    refusal === null
      ? { fields: {} }
      : presentEdgeEndpointRefusal(refusal.refusal, refusal.endpoint);
  const fromError = errors.fields.from ?? null;
  const toError = errors.fields.to ?? null;
  const [fromChoices] = useState(() => endpointChoices('from'));
  const [toChoices] = useState(() => endpointChoices('to'));

  return (
    <div className="flex flex-col gap-[0.4rem]">
      <Field data-invalid={fromError !== null}>
        <CardSearchCombobox
          label="From"
          testId="edge-from"
          choices={fromChoices}
          value={from}
          inputAttributes={{
            'aria-invalid': fromError !== null,
            'aria-describedby': fromError === null ? undefined : FROM_ERROR,
          }}
          onValueChange={(cardId) => onReconnect('from', cardId)}
        />
        <FieldError id={FROM_ERROR} data-testid="edge-from-refusal">
          {fromError}
        </FieldError>
      </Field>
      <Field data-invalid={toError !== null}>
        <CardSearchCombobox
          label="To"
          testId="edge-to"
          choices={toChoices}
          value={to}
          inputAttributes={{
            'aria-invalid': toError !== null,
            'aria-describedby': toError === null ? undefined : TO_ERROR,
          }}
          onValueChange={(cardId) => onReconnect('to', cardId)}
        />
        <FieldError id={TO_ERROR} data-testid="edge-to-refusal">
          {toError}
        </FieldError>
      </Field>
      {/* The form channel: a stale Layout, Graph or Edge that no endpoint in
          either list could correct, so neither Field is marked invalid. */}
      {errors.form !== undefined && (
        <FieldError data-testid="edge-endpoint-refusal">{errors.form}</FieldError>
      )}
    </div>
  );
}
