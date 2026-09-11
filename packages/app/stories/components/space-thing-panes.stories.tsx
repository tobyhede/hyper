import { useState, type ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { uuidSchema } from '@project/core';
import { NewSpaceThing } from '#components/NewSpaceThing';
import { presentNewSpaceThingRefusal } from '#src/authoring-refusal';
import type { SpaceThingTargetListing } from '#src/thing-creation';
import { CatalogueSection } from '../support/Catalogue';
import '../support/inventory.css';

/**
 * The catalogue ground this pane is shown on, matching the Alias panes beside
 * it: the same `inv-sheet` panel, and a section that says what the state is.
 *
 * It fills the frame rather than stopping at its content, because a pane is
 * modal — the sheet is what shows through the backdrop, so anything it does not
 * cover would leave the editor half over the catalogue's own white. The panel is
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

export default { title: 'Components/Space Thing Panes' };

/**
 * A target list that has been read, which is the state both panes below are
 * shown in.
 *
 * The pane distinguishes a read list from one still arriving or one that could
 * not be read, and withholds Create for the latter two — so a story that handed
 * it a bare array would be showing a surface whose completion never enables.
 */
const EXISTING_SPACES = {
  kind: 'read',
  spaces: [
    { id: uuidSchema.parse('00000000-0000-4000-8000-000000000201'), title: 'Architecture' },
    { id: uuidSchema.parse('00000000-0000-4000-8000-000000000202'), title: 'Release' },
  ],
} as const satisfies SpaceThingTargetListing;

/**
 * The same editor opened on a Space Thing that does not exist yet.
 *
 * The pair with the Alias pane above is the point: both create a Thing whose
 * kind is fixed from the outset, and they differ in where the completion sits.
 * An Alias has no valid form until a Target is chosen, so the list *is* the
 * completion; a Space Thing always has a valid target available — a new Space —
 * so what is missing is the title, and Create is a labelled action beside
 * Cancel.
 */
export const NewSpaceThingPane: Story = () => {
  const [created, setCreated] = useState<string | null>(null);

  return (
    <PaneSheet
      title="New Space Thing"
      note="One typed title seeds this Thing, the Space it references and that Space’s first Markdown Thing; from then on all three are renamed independently. The target is chosen once here and never again — a Space Thing is not retargeted."
    >
      {created === null ? (
        <NewSpaceThing
          targets={EXISTING_SPACES}
          refusal={null}
          busy={false}
          onCreate={(target, title) =>
            setCreated(
              target === null
                ? `Created ${title} on a new Space.`
                : `Created ${title} referencing ${target}.`,
            )
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
NewSpaceThingPane.meta = { iframed: true };

/**
 * The refused attempt, kept on screen with its reason beside the field that
 * answers it.
 *
 * A cycle is the one refusal an author can act on here — choosing a different
 * Space fixes it — so it belongs on the Target field rather than in the pane's
 * form channel, and the pane stays up because closing would take away the
 * control that answers it (ADR 0057).
 */
export const NewSpaceThingPaneRefused: Story = () => (
  <PaneSheet
    title="New Space Thing, refused"
    note="A refused attempt keeps the surface open and puts the reason on the field that answers it."
  >
    <NewSpaceThing
      targets={EXISTING_SPACES}
      refusal={presentNewSpaceThingRefusal({
        code: 'aggregate-refused',
        errors: [
          {
            kind: 'space-thing-reference-cycle',
            spaceId: uuidSchema.parse('00000000-0000-4000-8000-000000000201'),
            thingId: uuidSchema.parse('00000000-0000-4000-8000-000000000203'),
            targetSpaceId: uuidSchema.parse('00000000-0000-4000-8000-000000000202'),
          },
        ],
      })}
      busy={false}
      onCreate={() => undefined}
      onCancel={() => undefined}
      onRefusalStale={() => undefined}
    />
  </PaneSheet>
);
NewSpaceThingPaneRefused.meta = { iframed: true };
