import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
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
 */
export function NewAlias({ targets, refusal, onCreate, onCancel }: NewAliasProps) {
  const [title, setTitle] = useState('');

  /**
   * Escape closes the creation state, creating nothing.
   *
   * The picker takes the first Escape while it holds search text and stops it
   * there, so this only ever answers the one that is left — the surface's own,
   * which is the ordering the keyboard contract asks for.
   */
  const close = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  };

  return (
    <CardPane ariaLabel="New Alias" testId="new-alias">
      <div className="card-pane__editor" onKeyDown={close}>
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
          onCancel={onCancel}
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
        <div className="card-pane__actions">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </CardPane>
  );
}
