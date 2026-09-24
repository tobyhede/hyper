import { useState } from 'react';
import type { Story } from '@ladle/react';
import { uuidSchema, type Map, type Resource } from '@project/core';
import { productDestinationPath, type ProductDestination } from '@project/http';
import { CanvasResource, type CanvasResourceFront, type CanvasResourceState } from '@project/ui';
import { spaceEntityActions } from '#src/entity-actions';
import { resourceSizeVars, snapResourceSizeToClose } from '#src/resource';
import { CanvasResourceSpecimen } from '../support/CanvasResourceSpecimen';
import { CatalogueSection, Specimen } from '../support/Catalogue';
import { CanvasResourceNodeSpecimen } from '../support/ReactFlowCanvas';
import { resourceIds, GRAPH_PALETTE } from '../support/fixture';
import { authoredSpace } from '../support/spaces';
import '../support/inventory.css';

export default { title: 'Components/Resource' };

export const States: Story = () => (
  <div className="inv inv-sheet" style={resourceSizeVars}>
    <CatalogueSection
      title="Resource states"
      note="The shared CanvasResource presentation contract, drawn statically for rest, selected and dragging. Hover and selection are proven live in Hover and selection, and title editing in Title editing."
    >
      <div className="inv-row">
        <Specimen label="resource · rest">
          <CanvasResourceSpecimen title="Strategies" />
        </Specimen>
        <Specimen label="resource · selected">
          <CanvasResourceSpecimen title="Strategies" state="selected" />
        </Specimen>
        <Specimen label="resource · dragging">
          <CanvasResourceSpecimen title="Strategies" state="dragging" />
        </Specimen>
        <Specimen label="reference · rest">
          <CanvasResourceSpecimen title="Opening, again" kind="reference" />
        </Specimen>
        <Specimen label="reference · selected">
          <CanvasResourceSpecimen title="Opening, again" kind="reference" state="selected" />
        </Specimen>
        <Specimen label="reference · dragging">
          <CanvasResourceSpecimen title="Opening, again" kind="reference" state="dragging" />
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);

/**
 * The one Title with no break in it: the ordinary case, and the Title Hyper has
 * always drawn.
 */
const ONE_LINE_TITLE = 'Strategies';

/**
 * Three Title Lines the author typed — `title`, `subtitle`, `caption` (ADR
 * 0083). Each is short enough to draw on one visual line, so what the ladder
 * does to type is legible without any line also wrapping.
 */
const THREE_LINE_TITLE = 'Strategies\nno strategy is privileged\ngrid is one member of a set';

/**
 * One Title Line, long enough that the box breaks it. A break the box chose is
 * not a rung: every visual line of this is still the `title` role.
 */
const WRAPPING_TITLE = 'Why authored placement beats a layout engine that reshuffles on every edit';

/**
 * Every front `CanvasResource` declares, with the label each specimen carries.
 *
 * The creation ghost is in the list and is not a Resource: it is what the canvas
 * draws while a new Resource is being placed, and it takes the Markdown treatment
 * without content or authored open state. Leaving it out would make this story
 * "every front but one", which is the shape this story exists to stop.
 */
const FRONTS = [
  { kind: 'markdown', label: 'markdown' },
  { kind: 'reference', label: 'reference' },
  { kind: 'space', label: 'space' },
  { kind: 'preview', label: 'creation ghost' },
] as const satisfies readonly { kind: CanvasResourceFront['kind']; label: string }[];

/**
 * The whole of a Resource front, at rest, for every front the component draws.
 *
 * This story exists because no other one showed a front entire: `States`,
 * `Kinds`, `Hover`, `Colours`, `Open and close`, `Open Reference Resource` and `Resize
 * control` are each a slice, and two undecided elements lived on the front for
 * months because the slice that drew them was not the slice anyone reviewed.
 *
 * What every specimen below draws, and all it draws: the Resource's border —
 * dotted for a Reference Resource, solid for every other front — and the
 * Resource's Title, as one `.canvas-resource__title-line` per Title Line. Nothing
 * is drawn beneath the Title: a closed Resource's whole content is the Title its
 * author wrote. No specimen is handed an authoring callback, so no toolbar is
 * drawn, and with it no kind glyph, which trails the commands in the toolbar
 * (ADR 0102); `Hover` and `Actions` are where those live.
 */
export const Front: Story = () => (
  <div className="inv inv-sheet" style={resourceSizeVars}>
    <CatalogueSection
      title="Resource front"
      note="Every front CanvasResource draws, at rest and at the one authored Closed Size, each with a one-line Title beside a three-line one. A front draws its border — dotted only for a Reference Resource — and its Title Lines, and beneath the Title it draws nothing. Its kind glyph trails its commands in its toolbar, so a front handed no command draws none."
    >
      <div className="inv-row">
        {FRONTS.map((front) => (
          <Specimen key={front.label} label={`${front.label} · one line`}>
            <CanvasResourceSpecimen kind={front.kind} title={ONE_LINE_TITLE} />
          </Specimen>
        ))}
      </div>
      <div className="inv-row">
        {FRONTS.map((front) => (
          <Specimen key={front.label} label={`${front.label} · three lines`}>
            <CanvasResourceSpecimen kind={front.kind} title={THREE_LINE_TITLE} />
          </Specimen>
        ))}
      </div>
    </CatalogueSection>
    <CatalogueSection
      title="An authored break is not a wrapped break"
      note="Left: one Title Line the box breaks over several visual lines — all of it the title role, at one size and one weight. Right: three Title Lines the author typed — title, then subtitle, then caption, descending in size and weight. Same component, same width; only the ladder tells them apart."
    >
      <div className="inv-row">
        <Specimen label="one Title Line, wrapped">
          <CanvasResourceSpecimen title={WRAPPING_TITLE} />
        </Specimen>
        <Specimen label="three Title Lines, authored">
          <CanvasResourceSpecimen title={THREE_LINE_TITLE} />
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);
Front.storyName = 'Front';

export const Kinds: Story = () => (
  <div className="inv inv-sheet" style={resourceSizeVars}>
    <CatalogueSection
      title="Resource kinds"
      note="Kind changes the icon and the border treatment (a Reference Resource's dotted border) without adding a textual kind label. This story exercises CanvasResource's presentation interface directly."
    >
      <div className="inv-row">
        <Specimen label="markdown">
          <CanvasResourceSpecimen title="Strategies" kind="markdown" />
        </Specimen>
        <Specimen label="markdown · long title">
          <CanvasResourceSpecimen title="Why authored placement beats a layout engine that reshuffles on every edit" />
        </Specimen>
        <Specimen label="reference">
          <CanvasResourceSpecimen title="Opening, again" kind="reference" />
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);

/**
 * **The rail no longer carries the Graph's colour, and this is where that is
 * shown** (`.scratch/command-dock/issues/12`).
 *
 * Each specimen is the real `ResourceNode` at one palette colour, drawn selected so
 * both halves of the answer are on screen at rest: the Resource's commands sit on
 * the shared neutral command surface — the same one the Command Dock wears, and
 * the same at every colour — while the authoring handles around the Resource are
 * painted the Active Graph's own. The colour still says *which Graph*; it says
 * it where a Graph is, on the connections and the points they leave from,
 * rather than as a wash behind a toolbar.
 */
export const Colours: Story = () => (
  <div className="inv inv-sheet" style={resourceSizeVars}>
    <CatalogueSection
      title="Resource colours"
      note="A Resource's revealed commands are the shared neutral command surface at every Active Graph colour. The colour identifies the Graph on the Resource's authoring handles and on its Edges instead. These are the complete catalogue palette examples."
    >
      <div className="inv-row">
        {GRAPH_PALETTE.map((color) => (
          <Specimen key={color} label={color}>
            <CanvasResourceNodeSpecimen selected graphColor={color} />
          </Specimen>
        ))}
      </div>
    </CatalogueSection>
  </div>
);
Colours.storyName = 'Colours';
Colours.meta = { iframed: true };

export const Hover: Story = () => (
  <div className="inv inv-sheet" style={resourceSizeVars}>
    <CatalogueSection
      title="Hover and selection"
      note="Move the pointer over the real React Flow node to reveal its Edge handles; hovering reveals none of its commands. Select it to draw its commands in React Flow's NodeToolbar, above its top-right corner."
    >
      <div className="inv-row">
        <Specimen label="hover to show Edge handles, select to show commands">
          <CanvasResourceNodeSpecimen />
        </Specimen>
        <Specimen label="selected · hover for combined state">
          <CanvasResourceNodeSpecimen selected />
        </Specimen>
        <Specimen label="read-only · no authoring affordances">
          <CanvasResourceNodeSpecimen readOnly selected />
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);
Hover.meta = { iframed: true };

/**
 * The same reveal, seen from the other side: a Resource being moved draws no
 * chrome, although a drag satisfies every condition the chrome is revealed by —
 * the pointer stays on the Resource it is carrying, and React Flow Selects it as
 * the gesture begins. So this is a live drag of the real production `ResourceNode`
 * rather than the static dragging treatment `States` draws, and what it shows is
 * the withdrawal and its return on release.
 */
export const Drag: Story = () => (
  <div className="inv inv-sheet" style={resourceSizeVars}>
    <CatalogueSection
      title="Drag"
      note="Press the Resource and move it: its toolbar and its Edge handles both return to rest for the gesture. On release the drag has Selected it, so its toolbar is drawn again, and hovering it reveals its handles."
    >
      <div className="inv-row">
        <Specimen label="drag to return the chrome to rest">
          <CanvasResourceNodeSpecimen draggable />
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);
Drag.meta = { iframed: true };

/** A specimen that keeps its own size in state, so a real drag on the real
 *  production control actually grows the real node — the round trip
 *  `SpaceCanvas` makes through Space Authoring, condensed to local state. */
function ResizableOpenSpecimen({ selected = false }: { readonly selected?: boolean }) {
  const [size, setSize] = useState({ width: 480, height: 360 });
  return (
    <CanvasResourceNodeSpecimen
      expanded
      selected={selected}
      nodeSize={size}
      onResize={(proposal) => setSize(snapResourceSizeToClose(proposal))}
      stageClassName="inv-resource-node-stage--large"
    />
  );
}

/**
 * Every Open Resource exposes one bottom-right resize control, revealed by hover,
 * Selection or focus; a Closed Resource exposes none (ADR 0066). Both specimens
 * mount the real production `ResourceNode` through the real `nodeTypes`, so what
 * is proved here is the shared Resource control rather than a facsimile of it.
 */
export const ResizeControl: Story = () => (
  <div className="inv inv-sheet" style={resourceSizeVars}>
    <CatalogueSection
      title="Resize control"
      note="Hover, select or focus the Open Resource to reveal its bottom-right control, then drag it. The Closed Resource beside it offers none."
    >
      <div className="inv-row">
        <Specimen label="Open · resizable">
          <section aria-label="Open Resource">
            <ResizableOpenSpecimen />
          </section>
        </Specimen>
        <Specimen label="Open · Selected">
          <section aria-label="Selected Resource">
            <ResizableOpenSpecimen selected />
          </section>
        </Specimen>
        <Specimen label="Closed · no control">
          <section aria-label="Closed Resource">
            <CanvasResourceNodeSpecimen />
          </section>
        </Specimen>
      </div>
    </CatalogueSection>
  </div>
);
ResizeControl.storyName = 'Resize control';
ResizeControl.meta = { iframed: true };

/**
 * One instance wired the way `ResourceNode` wires the production component: real
 * selection and dragging toggles standing in for React Flow's own, a real
 * Connect operation, and a visible record of when it fired — so the story
 * proves the same exposure the production graph does, not a facsimile of it.
 */
function Instance({
  initialTitle,
  kind = 'markdown',
}: {
  readonly initialTitle: string;
  readonly kind?: 'markdown' | 'reference';
}) {
  const [title] = useState(initialTitle);
  const [selected, setSelected] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(false);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    return 'completed' as const;
  };
  const front: CanvasResourceFront =
    kind === 'reference'
      ? // Every kind Opens and Closes through the one operation (ADR 0070), so the
        // Reference Resource carries it too — and with it the toolbar its kind
        // glyph trails (ADR 0102).
        {
          kind: 'reference',
          target: { kind: 'markdown', source: 'Markdown content' },
          open,
          onOpenChange: changeOpen,
        }
      : open
        ? { kind: 'markdown', source: 'Markdown content', open: true, onOpenChange: changeOpen }
        : { kind: 'markdown', source: 'Markdown content', open: false, onOpenChange: changeOpen };
  const state: Exclude<CanvasResourceState, 'editing'> = dragging
    ? 'dragging'
    : selected
      ? 'selected'
      : 'rest';
  return (
    <div className="flex flex-col items-start gap-2">
      <div
        role="group"
        aria-label={`${title} on the canvas`}
        tabIndex={-1}
        onClick={() => setSelected(true)}
      >
        <CanvasResource front={front} state={state} title={title} graphColor="#ffc53d" />
      </div>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={dragging}
          onChange={(event) => setDragging(event.target.checked)}
        />
        Dragging
      </label>
      {front.kind === 'markdown' && (
        <p className="text-xs text-muted-foreground" data-testid="open-report">
          {open ? `${title} is open.` : `${title} is closed.`}
        </p>
      )}
    </div>
  );
}

/**
 * The production component's keyboard, pointer and callback behaviour: real
 * hover, click-to-select, a dragging toggle standing in for React Flow's own,
 * and keyboard-focusable Resource actions. `States` above is the visual reference;
 * this is its behaviour proof.
 */
export const Actions: Story = () => (
  <div className="flex flex-wrap gap-8 p-8" style={resourceSizeVars}>
    <Instance initialTitle="Strategies" />
    <Instance initialTitle="Opening, again" kind="reference" />
  </div>
);

const closedFrame = { width: 240, height: 135 };
const openFrame = { width: 480, height: 360 };

const openMarkdown = `## Placement is authored

A **Map** owns explicit Resource rects. A strategy only computes placement.

- Open in place
- Edit the source
- Keep the canvas beneath it`;

/** The Resource's actual Open and Close operation, including its change in authored size. */
export const OpenAndClose: Story = () => {
  const [open, setOpen] = useState(false);
  const [longOpen, setLongOpen] = useState(true);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    return 'completed' as const;
  };
  const changeLongOpen = (next: boolean) => {
    setLongOpen(next);
    return 'completed' as const;
  };

  return (
    <div className="flex flex-wrap items-start gap-8 p-8">
      <section aria-label="Interactive Resource" className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{open ? 'Open' : 'Closed'}</p>
        <CanvasResourceNodeSpecimen
          expanded={open}
          onOpenChange={changeOpen}
          body={openMarkdown}
          nodeSize={open ? openFrame : closedFrame}
          stageClassName="inv-resource-node-stage--large"
        />
      </section>
      <section aria-label="Long Markdown Resource" className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          {longOpen ? 'Open' : 'Closed'} · long Markdown
        </p>
        <CanvasResourceNodeSpecimen
          expanded={longOpen}
          onOpenChange={changeLongOpen}
          title="Long Markdown"
          body={`${openMarkdown}\n\n### A deliberately long section\n\n${openMarkdown}\n\n${openMarkdown}`}
          nodeSize={longOpen ? openFrame : closedFrame}
          stageClassName="inv-resource-node-stage--large"
        />
      </section>
    </div>
  );
};
OpenAndClose.meta = { iframed: true };

export const OpenReference: Story = () => {
  const [open, setOpen] = useState(true);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    return 'completed' as const;
  };
  return (
    <div className="p-8">
      <CanvasResourceNodeSpecimen
        resourceId={resourceIds.openingReference}
        expanded={open}
        onOpenChange={changeOpen}
        body={'## Strategies\n\nNo strategy is privileged.'}
        nodeSize={open ? openFrame : closedFrame}
        stageClassName="inv-resource-node-stage--large"
      />
    </div>
  );
};
OpenReference.storyName = 'Open Reference Resource';
OpenReference.meta = { iframed: true };

/**
 * Enter is the Space Resource's kind command (ADR 0073, ADR 0068): it sits on the
 * rail whether the Resource is Open or Closed, and activating it is the crossing.
 *
 * The production `CanvasResource` is the component; the application proof is
 * `enter-space-resource.test.tsx` and `space-resource.spec.ts`.
 */
export const EnterSpace: Story = () => {
  const [entered, setEntered] = useState(false);
  const changeOpen = () => 'completed' as const;
  return (
    <div className="p-8">
      <CanvasResource
        front={{
          kind: 'space',
          open: false,
          onOpenChange: changeOpen,
        }}
        state="selected"
        entityActions={[
          [
            {
              id: 'enter',
              label: 'Enter',
              onSelect: () => {
                setEntered(true);
                return 'done';
              },
            },
          ],
        ]}
        title="Architecture"
        graphColor="#35d6c3"
      />
      <p className="mt-3 text-xs text-muted-foreground" data-testid="enter-report">
        {entered ? 'Entered Architecture.' : 'Not entered.'}
      </p>
    </div>
  );
};
EnterSpace.storyName = 'Enter Space';
EnterSpace.meta = { iframed: true };

const ARCHITECTURE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const ARCHITECTURE: Resource = {
  id: ARCHITECTURE_ID,
  title: 'Architecture',
  kind: 'space',
  spaceId: uuidSchema.parse('00000000-0000-4000-8000-000000000020'),
  map: uuidSchema.parse('00000000-0000-4000-8000-000000000021'),
  graph: uuidSchema.parse('00000000-0000-4000-8000-000000000022'),
};
const CONTAINING_MAP: Map = {
  id: uuidSchema.parse('00000000-0000-4000-8000-000000000003'),
  title: 'Collection 1',
  kind: 'positioned',
  positions: { [ARCHITECTURE_ID]: { x: 0, y: 0, open: false } },
  graphs: [
    { id: uuidSchema.parse('00000000-0000-4000-8000-000000000004'), title: 'Overview', edges: [] },
  ],
};

/**
 * Independently opening the Space a Space Resource shows is a link to that
 * Space's own address (ADR 0068). The production menu is `spaceEntityActions`;
 * the application proof is `resource-rail-actions.test.tsx` and `space-resource.spec.ts`.
 */
export const OpenIndependently: Story = () => {
  const [opened, setOpened] = useState<ProductDestination | null>(null);
  const changeOpen = () => 'completed' as const;
  const entityActions = spaceEntityActions({
    spaceId: uuidSchema.parse('00000000-0000-4000-8000-000000000001'),
    spaceTitle: 'Home',
    onCopy: () => true,
    onOpenIndependently: (destination) => {
      setOpened(destination);
      return true;
    },
    onRename: null,
  })({ kind: 'resource', resource: ARCHITECTURE, map: CONTAINING_MAP });
  return (
    <div className="p-8">
      <CanvasResource
        front={{
          kind: 'space',
          open: false,
          onOpenChange: changeOpen,
        }}
        state="selected"
        title="Architecture"
        graphColor="#35d6c3"
        entityActions={entityActions}
      />
      <p className="mt-3 text-xs text-muted-foreground" data-testid="independent-open-report">
        {opened?.kind === 'space' ? `Sent space ${opened.spaceId} to a new tab.` : 'Not sent.'}
      </p>
    </div>
  );
};
OpenIndependently.storyName = 'Open independently';
OpenIndependently.meta = { iframed: true };

/**
 * A Resource's actions menu, reached from its rail control or a right click on
 * the Resource itself. The commands are production's own `spaceEntityActions`
 * over the fixture Space's real ids; the copy is recorded rather than written to
 * the clipboard, and the pressed item confirms as it does over a clipboard that
 * accepted the link. The application proof is `editing.spec.ts`.
 */
export const RailActions: Story = () => {
  const [copied, setCopied] = useState<string | null>(null);
  const map = authoredSpace.maps[0];
  if (map === undefined) throw new Error('RailActions fixture requires an authored Map');
  const actions = spaceEntityActions({
    spaceId: authoredSpace.id,
    spaceTitle: authoredSpace.title,
    onCopy: (destination) => {
      setCopied(productDestinationPath(destination));
      return true;
    },
    onOpenIndependently: null,
    onRename: null,
  });
  return (
    <div className="p-8" style={resourceSizeVars}>
      <div className="flex flex-wrap items-start gap-6">
        {authoredSpace.resources.slice(0, 2).map((resource, index) => (
          <CanvasResource
            key={resource.id}
            front={{ kind: 'markdown', source: '', open: false, onOpenChange: () => 'retained' }}
            title={resource.title}
            state={index === 1 ? 'selected' : 'rest'}
            graphColor="#ffc53d"
            entityActions={actions({ kind: 'resource', resource, map })}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground" data-testid="copy-report">
        {copied === null ? 'Nothing copied.' : `Copied ${copied}`}
      </p>
    </div>
  );
};
RailActions.storyName = 'Rail actions';
RailActions.meta = { iframed: true };
