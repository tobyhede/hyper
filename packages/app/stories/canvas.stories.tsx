import type { ReactNode } from 'react';
import type { Story } from '@ladle/react';
import { GraphLegend, type CanvasCardState } from '@project/ui';
import { CanvasCardSpecimen } from './CanvasCardSpecimen';
import { StaticCanvas } from './StaticCanvas';
import { EDGE_COLOR, GRAPH_PALETTE, cardIds, colorByGraphId, graphIds, graphs } from './fixture';

export default { title: 'Canvas' };

const Section = ({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) => (
  <section className="inv-section">
    <h2 className="inv-section__title inv-mono">{title}</h2>
    {note !== undefined && <p className="inv-section__note">{note}</p>}
    {children}
  </section>
);

const Specimen = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="inv-specimen">
    <div className="inv-specimen__stage">{children}</div>
    <span className="inv-specimen__label inv-mono">{label}</span>
  </div>
);

/**
 * The Layout overview: every Graph the Layout owns, the Active Graph
 * emphasised and the other dimmed rather than hidden.
 */
export const Overview: Story = () => (
  <div style={{ overflow: 'auto', height: 620 }}>
    <StaticCanvas activeGraphId={graphIds.long} />
  </div>
);

export const OverviewWithInteraction: Story = () => (
  <div style={{ overflow: 'auto', height: 620 }}>
    <StaticCanvas
      activeGraphId={graphIds.short}
      cardStates={{
        [cardIds.strategies]: 'hover',
        [cardIds.opening]: 'selected',
        [cardIds.problem]: 'dragging',
      }}
    />
  </div>
);
OverviewWithInteraction.storyName = 'Overview · hover, selected, dragging';

/**
 * The rail is the whole affordance model, and this row is the argument for it.
 *
 * Read across: the rail keeps its 34px height in every state and the glyph never
 * moves. Only the fill, the glyph's contrast and what sits on the right change.
 * Nothing reflows, so the eye can hold one place while the meaning changes
 * under it.
 */
export const CardStates: Story = () => {
  const states: readonly CanvasCardState[] = [
    'rest',
    'hover',
    'selected',
    'selected-hover',
    'dragging',
    'editing',
  ];
  return (
    <div className="inv-sheet">
      <Section
        title="Card · states"
        note="Every state is shown for both a Card and an Alias. Only the resting Alias has a dotted frame; hover, selection, editing and dragging use the base Card treatment."
      >
        <div className="inv-row">
          {states.map((state) => (
            <Specimen key={`card-${state}`} label={`card · ${state}`}>
              <CanvasCardSpecimen title="Strategies" state={state} />
            </Specimen>
          ))}
          {states.map((state) => (
            <Specimen key={`alias-${state}`} label={`alias · ${state}`}>
              <CanvasCardSpecimen title="Opening" kind="alias" state={state} />
            </Specimen>
          ))}
        </div>
      </Section>
    </div>
  );
};
CardStates.storyName = 'Card · states';

/**
 * A kind changes the frame and never adds a label. There is no text in the rail
 * in any state — no "MD", no "ALIAS", no "SELECTED".
 */
export const CardKinds: Story = () => (
  <div className="inv-sheet">
    <Section
      title="Card · kinds"
      note="An alias is distinguished only by its icon and dotted resting border. Every non-rest behavior is inherited from the base Card."
    >
      <div className="inv-row">
        <Specimen label="markdown">
          <CanvasCardSpecimen title="Strategies" kind="markdown" />
        </Specimen>
        <Specimen label="markdown · long title">
          <CanvasCardSpecimen title="Why authored placement beats a layout engine that reshuffles on every edit" />
        </Specimen>
        <Specimen label="alias">
          <CanvasCardSpecimen title="Opening" kind="alias" />
        </Specimen>
      </div>
    </Section>
  </div>
);
CardKinds.storyName = 'Card · kinds';

/**
 * The handle geometry, and the one open disagreement about when they appear.
 */
export const Handles: Story = () => (
  <div className="inv-sheet">
    <Section
      title="Handles · geometry"
      note="Handles are intentionally absent from static specimens. They are React Flow controls supplied by CardNode, never visual spans owned by the Card or Ladle. Hover a Card in the live canvas to inspect the four real handles."
    >
      <div className="inv-row">
        <Specimen label="shared primitive · no imitation handles">
          <CanvasCardSpecimen title="Strategies" state="hover" />
        </Specimen>
      </div>
    </Section>
  </div>
);
Handles.storyName = 'Card · handles';

/**
 * In-place title editing: no input box, no bordered field.
 */
export const TitleEditing: Story = () => (
  <div className="inv-sheet">
    <Section
      title="Title editing · in place"
      note="The title text stays exactly where it is. A 3px graph-colour underline appears beneath it and a 3px ink caret blinks at the end; the rail's glyph swaps to a pencil and ⏎ · esc takes the place the action buttons had. This replaces upstream's `.card__title-input`, which is a bordered field that moves the text."
    >
      <div className="inv-row">
        <Specimen label="editing">
          <CanvasCardSpecimen title="Strategies" state="editing" />
        </Specimen>
        <Specimen label="editing · long title">
          <CanvasCardSpecimen
            title="Why authored placement beats a layout engine that reshuffles"
            state="editing"
          />
        </Specimen>
      </div>
    </Section>
    <Section title="Open — Escape means two things">
      <p className="inv-open">
        ADR 0048 already decides this and the design agrees by accident rather than by citation: on
        the <strong>Card Front</strong>, in place on the canvas, the field commits on blur and
        Escape reverts and dismisses. The design&apos;s <code>⏎ · esc</code> hint says exactly that.
        It is worth writing the citation into the design so the pane&apos;s opposite rule — where
        Escape is an alias of Cancel and nothing commits until Done — is not read as an
        inconsistency later.
      </p>
    </Section>
  </div>
);
TitleEditing.storyName = 'Card · title editing';

/**
 * The rail's three actions, and the Button-variant question the manifest asks.
 */
export const RailActions: Story = () => (
  <div className="inv-sheet">
    <Section
      title="Rail · actions"
      note="22×22, square, no radius, 2px ink border on the resting face. Hover inverts: the face goes to ink and the icon takes the graph colour out of the filled rail behind it. Hover one to see it."
    >
      <div className="inv-row">
        <Specimen label="hover — three actions">
          <CanvasCardSpecimen title="Strategies" state="hover" />
        </Specimen>
        <Specimen label="selected — actions hidden">
          <CanvasCardSpecimen title="Strategies" state="selected" />
        </Specimen>
      </div>
    </Section>
    <Section title="Decide — RailButton or a Button variant">
      <p className="inv-open">
        This treatment is not a stock shadcn variant: square with no radius, a 2px border, and a
        hover that inverts to ink while the icon takes a colour from context. `@project/ui`&apos;s
        `Button` is `rounded-[6px]` with a one-pixel border and three colour variants, none of which
        is this. It is also the only place in the app where a control&apos;s hover colour comes from
        the Active Graph. Recommendation: a separate `RailButton`, because a variant that overrides
        radius, border width and both hover colours is a different component wearing the same name —
        but this is the manifest&apos;s open question and it belongs to whoever owns `@project/ui`.
      </p>
    </Section>
  </div>
);
RailActions.storyName = 'Card · rail actions';

/**
 * The palette, and the derived edge colours flagged as unapproved.
 */
export const GraphColours: Story = () => (
  <div className="inv-sheet">
    <Section
      title="Graph colours"
      note="Six per Layout, spent per Layout rather than per Space so every Layout gets a full run of them. The card takes the colour flat; the edge takes it darkened, because a 3px amber stroke on #efe9dc paper reads as a highlighter."
    >
      <div className="inv-row">
        {GRAPH_PALETTE.map((color) => (
          <Specimen key={color} label={`${color} · edge ${EDGE_COLOR[color] ?? '—'}`}>
            <CanvasCardSpecimen title="Strategies" state="hover" graphColor={color} />
            <svg width={260} height={18} style={{ marginTop: 12 }} aria-hidden="true">
              <path
                d="M 8 9 L 252 9"
                stroke={EDGE_COLOR[color] ?? color}
                strokeWidth={3}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </Specimen>
        ))}
      </div>
    </Section>
    <Section title="Open — three of the five edge colours are guesses">
      <p className="inv-open">
        The handoff supplies two darkened pairs: amber <code>#ffc53d → #c1861a</code> and teal{' '}
        <code>#35d6c3 → #14887b</code>. Blue, violet and coral are derived in `fixture.ts` to hold
        roughly the same lightness step and <strong>nobody has looked at them</strong>. The palette
        is also listed as five colours in the token table and six in the per-Layout rotation rule —
        one of those numbers is wrong.
      </p>
    </Section>
  </div>
);
GraphColours.storyName = 'Canvas · graph colours';

/**
 * The question the fixture was shaped to ask.
 */
export const MultiGraphMembership: Story = () => (
  <div className="inv-sheet">
    <Section
      title="Multi-graph membership"
      note="Opening and Strategies each sit on both Graphs. The card says nothing about that in any state — its rail carries the Active Graph's colour whichever Graphs it belongs to, so the two cards below are indistinguishable from the five that sit on one."
    >
      <div className="inv-row">
        <Specimen label="Strategies — on both Graphs">
          <CanvasCardSpecimen title="Strategies" state="hover" graphColor={GRAPH_PALETTE[0]} />
        </Specimen>
        <Specimen label="Traversal — on one">
          <CanvasCardSpecimen title="Traversal" state="hover" graphColor={GRAPH_PALETTE[0]} />
        </Specimen>
        <div style={{ background: 'var(--canvas-card-face-rest)', border: '1px solid #d9d2c2' }}>
          <GraphLegend
            graphs={graphs}
            colorByGraphId={colorByGraphId}
            activeGraphId={graphIds.long}
          />
        </div>
      </div>
    </Section>
    <Section title="Unresolved — do not invent a treatment">
      <p className="inv-open">
        A per-graph colour bar on the card was tried and rejected as incoherent. The handoff lists
        the remaining options — on the rail when open, in the opened-card pane only, in a tooltip,
        or not on the card at all — and says explicitly not to invent one silently. Nothing is drawn
        here for it. The legend beside the cards is what the app has today, and it answers
        &quot;which Graphs exist&quot; rather than &quot;which Graphs is this Card on&quot;.
      </p>
    </Section>
  </div>
);
MultiGraphMembership.storyName = 'Canvas · multi-graph membership';

/**
 * The live tweak the design prototype had, as a control.
 */
export const Tweak: Story<{ title: string; graphColor: string; state: CanvasCardState }> = ({
  title,
  graphColor,
  state,
}) => (
  <div className="inv-sheet">
    <div className="inv-specimen__stage">
      <CanvasCardSpecimen title={title} graphColor={graphColor} state={state} />
    </div>
  </div>
);
Tweak.args = {
  title: 'Why authored placement beats a layout engine that reshuffles on every edit',
  graphColor: '#ffc53d',
  state: 'hover',
};
Tweak.argTypes = {
  graphColor: { control: { type: 'color' } },
  state: {
    options: ['rest', 'hover', 'selected', 'selected-hover', 'dragging', 'editing'],
    control: { type: 'inline-radio' },
  },
};
Tweak.storyName = 'Card · tweak';
