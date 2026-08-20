import { useState } from 'react';
import { uuidSchema, type Card, type CardId } from '@project/core';
import {
  Button,
  CardSearchCombobox,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  Input,
} from '@project/ui';
import { CardPane } from './CardPane';
import { paneInitialFocus } from './pane-focus';
import { presentNewAliasRefusal } from '../authoring-refusal';
import type { AuthoringRefusal } from '../space-authoring';

export interface NewAliasProps {
  /** Every Card an Alias may name: the non-Alias Cards of this Space (ADR 0009). */
  readonly targets: readonly Card[];
  /**
   * Why the Space refused the Alias this pane tried to create, or `null`.
   *
   * The whole refusal union rather than the four codes creation can actually
   * raise. The narrowed type read as documentation and worked as an obligation:
   * the caller had to prove a refusal was one of the four before it could be
   * handed over, which it did by comparing strings and throwing — a crash
   * inside a React event handler, taking the canvas down, the day a fifth
   * became reachable. Every code has a placement here instead, so the pane can
   * accept whatever it is given and the reachable set stays a fact about
   * Authoring rather than a list two modules keep in step by hand.
   */
  readonly refusal: AuthoringRefusal | null;
  /**
   * Create the Alias on the chosen Target, with the title exactly as typed —
   * the empty string included, because an empty title is what tells Authoring
   * to take the Target's own and `??` cannot express that.
   */
  readonly onCreate: (target: CardId, title: string) => void;
  readonly onCancel: () => void;
  /**
   * The refusal above describes an attempt, and editing either field begins a
   * different one — so the message stops describing anything on screen and is
   * withdrawn. Announced rather than cleared here because the refusal is the
   * caller's state: this pane knows *when* it went stale and never what it said.
   */
  readonly onRefusalStale: () => void;
}

/**
 * Adding an Alias: the Card editor, opened on a Card that does not exist yet.
 *
 * **Nothing is authored until a Target is chosen**, and that is the whole shape
 * of this surface. An Alias without a Target is not a valid Card, so there is no
 * partially created Alias to hold, nothing is added to the Space, no Algorithmic
 * View is converted and nothing is persisted while this pane is open. Closing it
 * creates nothing — there is no draft to discard, because there was never
 * anything but local state.
 *
 * Choosing the Target is therefore the completion rather than a step before one,
 * which is why there is no Create button beside Cancel: a second activation
 * would ask the author to confirm a choice they have already made, and the pane
 * would have to hold an unconfirmed Target across it.
 *
 * The kind is fixed from the outset. This is not a Markdown Card that will later
 * become an Alias — a Card keeps the kind it was created with — so the pane says
 * which kind it is creating rather than offering a control that changes it.
 *
 * Escape closes it, creating nothing, and no key handler here says so: the
 * Dialog dismisses on Escape and that *is* Cancel's meaning on this pane (ADR
 * 0048). Neither field takes a first Escape of its own any more — the title's
 * restore-to-empty was a second, unlabelled copy of the button beside it.
 */
export function NewAlias({ targets, refusal, onCreate, onCancel, onRefusalStale }: NewAliasProps) {
  const [title, setTitle] = useState('');
  const errors = refusal === null ? { fields: {} } : presentNewAliasRefusal(refusal);
  const titleError = errors.fields.title ?? null;
  const targetError = errors.fields.target ?? null;

  return (
    <CardPane ariaLabel="New Alias" testId="new-alias" onDismiss={onCancel}>
      {/* One `onChange` for both fields rather than two handlers, because React
          bubbles change through its own tree. Editing either field is the same
          fact — the refused attempt is over. */}
      <div className="card-pane__editor" onChange={refusal === null ? undefined : onRefusalStale}>
        {/* The fields scroll and the actions below them do not, exactly as on the
            opened-Card pane. This one needs it most: it has no Markdown field to
            absorb the squeeze, so on a short window its heading, Title, list and
            hint together are taller than the frame. */}
        <FieldGroup className="card-pane__fields">
          {/* The kind is stated rather than offered, because a Card keeps the
              kind it was created with. */}
          <Field className="card-pane__heading">
            <FieldTitle>New Alias</FieldTitle>
            <FieldDescription>
              An Alias shows another Card’s content at a second position.
            </FieldDescription>
          </Field>
          <Field className="card-pane__field" data-invalid={titleError !== null}>
            <FieldLabel htmlFor="new-alias-title">Title</FieldLabel>
            <Input
              id="new-alias-title"
              data-testid="new-alias-title"
              value={title}
              aria-invalid={titleError !== null}
              aria-describedby={titleError === null ? undefined : 'new-alias-title-error'}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
            <FieldError id="new-alias-title-error">{titleError}</FieldError>
          </Field>
          <Field className="card-pane__field" data-invalid={targetError !== null}>
            <CardSearchCombobox
              label="Target"
              choices={targets.map((card) => ({
                id: card.id,
                title: card.title,
                kind: card.kind,
              }))}
              value={null}
              inputAttributes={{
                ...paneInitialFocus(true),
                'aria-invalid': targetError !== null,
                'aria-describedby': targetError === null ? undefined : 'new-alias-target-error',
              }}
              testId="card-picker-search"
              resultsTestId="card-picker-results"
              onValueChange={(target) => {
                const parsed = uuidSchema.safeParse(target);
                if (parsed.success) onCreate(parsed.data, title);
              }}
              emptyMessage="An Alias needs a Card that owns its content, and this Space has none yet."
            />
            <FieldError id="new-alias-target-error">{targetError}</FieldError>
          </Field>
          {/* The hint stays among the fields, under the list it is about: it is
              advice on how to finish, so it belongs beside the control that
              finishes. It is withdrawn while a refusal stands, leaving the
              field-local corrective message to describe the next action. */}
          {refusal === null && (
            <FieldDescription className="card-pane__hint">
              Choosing a Target creates the Alias. Leave the title empty to take the Target’s.
            </FieldDescription>
          )}
        </FieldGroup>
        {errors.form !== undefined && (
          <FieldError className="card-pane__field-error">{errors.form}</FieldError>
        )}
        <div className="card-pane__actions">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </CardPane>
  );
}
