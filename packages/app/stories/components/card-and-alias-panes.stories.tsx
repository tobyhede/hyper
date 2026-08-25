import { useState, type ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { uuidSchema, type Card } from '@project/core';
import { NewAlias } from '#components/NewAlias';
import { OpenCard } from '#components/OpenCard';
import { CatalogueSection } from '../support/Catalogue';
import '../support/inventory.css';

/**
 * The catalogue ground these panes are shown on, matching the canvas Card's own
 * stories: the same `inv-sheet` panel, and a section that says what the state is.
 *
 * It fills the frame rather than stopping at its content, because a pane is modal
 * — the sheet is what shows through the backdrop, so anything it does not cover
 * would leave the editor half over the catalogue's own white. The panel is
 * furniture, never the design: the pane portals to the story document's body, so
 * it sits outside this element and inherits none of its tokens.
 */
function PaneSheet({
  title,
  note,
  children,
}: {
  readonly title: string;
  readonly note: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="inv inv-sheet inv-sheet--viewport">
      <CatalogueSection title={title} note={note}>
        {children}
      </CatalogueSection>
    </div>
  );
}

export default { title: 'Components/Alias Panes' };

const MARKDOWN_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000101');
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000103');

const markdown: Extract<Card, { kind: 'markdown' }> = {
  id: MARKDOWN_ID,
  title: 'Architecture notes',
  kind: 'markdown',
  body: `## Placement

Placement is authored, not computed. A Layout owns an explicitly positioned subset of Cards.

## Strategies

No strategy is privileged. Grid, sorts, trees, clusters, and ELK are choices over the same contract.

## Presentation

Opening authors one Card in place. Presenting traverses the Active Graph.`,
};

const alias: Extract<Card, { kind: 'alias' }> = {
  id: ALIAS_ID,
  title: 'Placement recap',
  kind: 'alias',
  target: MARKDOWN_ID,
};

/** The production Alias metadata editor with its current Target available. */
export const Alias: Story = () => {
  const [open, setOpen] = useState(true);
  const [message, setMessage] = useState('No edit completed.');

  return (
    <PaneSheet
      title="Alias editor"
      note="The same expanded Card, opened on an Alias: it authors the Alias's own Title and Target and never its Target's content (ADR 0049)."
    >
      {open ? (
        <OpenCard
          through={alias}
          occurrence={{
            targets: [markdown],
            onEdit: ({ title }) => {
              setMessage(`Completed ${title}.`);
              return null;
            },
          }}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <p>{message}</p>
      )}
    </PaneSheet>
  );
};
Alias.meta = { iframed: true };

/**
 * The same editor opened on an Alias that does not exist yet.
 *
 * The Target list is the completion, not a step before one, so there is no
 * Create beside Cancel — which is the state worth showing, because every other
 * pane in this catalogue finishes on a labelled action.
 */
export const NewAliasPane: Story = () => {
  const [created, setCreated] = useState<string | null>(null);

  return (
    <PaneSheet
      title="New Alias"
      note="The Target list is the completion, not a step before one, so there is no Create beside Cancel — the state worth showing, because every other pane here finishes on a labelled action."
    >
      {created === null ? (
        <NewAlias
          targets={[markdown]}
          refusal={null}
          onCreate={(target, title) =>
            setCreated(`Created ${title === '' ? '(the Target’s title)' : title} on ${target}.`)
          }
          onCancel={() => setCreated('Cancelled, creating nothing.')}
          onRefusalStale={() => undefined}
        />
      ) : (
        <p>{created}</p>
      )}
    </PaneSheet>
  );
};
NewAliasPane.meta = { iframed: true };
