import { useState } from 'react';
import type { Card, CardId } from '@project/core';
import { Button } from '@project/ui';
import { CardPane } from './CardPane';
import { CardPicker } from './CardPicker';

export interface NewAliasProps {
  /** Every Card an Alias may name: the non-Alias Cards of this Space (ADR 0009). */
  readonly targets: readonly Card[];
  /** Why the Space refused the Alias this pane tried to create, or `null`. */
  readonly refusal: string | null;
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

  return (
    <CardPane ariaLabel="New Alias" testId="new-alias" onDismiss={onCancel}>
      {/* One `onChange` for both fields rather than two handlers, because React
          bubbles change through its own tree and cmdk's input is not somewhere
          this pane can bind: `CardPicker` owns the search and exposes no change
          of its own. Editing either field is the same fact — the refused attempt
          is over. */}
      <div className="card-pane__editor" onChange={refusal === null ? undefined : onRefusalStale}>
        {/* The fields scroll and the actions below them do not, exactly as on the
            opened-Card pane. This one needs it most: it has no Markdown field to
            absorb the squeeze, so on a short window its heading, Title, list and
            hint together are taller than the frame. */}
        <div className="card-pane__fields">
          {/* Not the delegation banner: that one names two Cards, and here there
              is one Card and it does not exist yet. The kind is stated rather
              than offered, because a Card keeps the kind it was created with. */}
          <div className="card-pane__heading">
            <span>New Alias</span>
            <span>An Alias shows another Card’s content at a second position.</span>
          </div>
          <label className="card-pane__field">
            <span>Title</span>
            <input
              data-testid="new-alias-title"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>
          <CardPicker
            label="Target"
            cards={targets}
            selectedId={null}
            // "It opens the normal Card editor in an Alias creation state with
            // **Target** focused" (ADR 0009's Frame 1): the Target is what this
            // surface is for, and the title above it is optional.
            initialFocus
            onSelect={(target) => onCreate(target, title)}
            emptyMessage="An Alias needs a Card that owns its content, and this Space has none yet."
          />
          {refusal === null ? (
            <p className="card-pane__hint">
              Choosing a Target creates the Alias. Leave the title empty to take the Target’s.
            </p>
          ) : (
            <span role="alert" className="card-pane__field-error">
              {refusal}
            </span>
          )}
        </div>
        <div className="card-pane__actions">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </CardPane>
  );
}
