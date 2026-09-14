/**
 * THROWAWAY — does a floating Thing dock replace the header cleanly?
 * Compare the current header, an 8px inset, and a 12px inset on the same live
 * memory-backed application. No production styles or behavior are changed.
 */
import { useMemo, useState } from 'react';
import type { Story } from '@ladle/react';
import { SPACE_THING_EMBED_INSET, spaceSnapshotSchema, uuidSchema } from '@project/core';
import { Button, CanvasThingRailPrototype } from '@project/ui';
import { EmbeddedInsetPrototype } from '../../src/embedded-inset-prototype';
import { Application } from '#components/Application';
import { FloatingSpaceRail } from './floating-space-rail-prototype';
import { storyOpening, storySpaces } from '../support/application';
import './floating-thing-dock.css';

export default { title: 'Review/Floating Thing Dock' };

const id = (n: number) =>
  uuidSchema.parse(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const variants = ['current', 'inset8', 'inset12'] as const;
type Variant = (typeof variants)[number];
type Scene = 'mixed' | 'narrow' | 'overlap';
const labels = { current: 'Current header', inset8: 'Floating · 8px', inset12: 'Floating · 12px' };
const initialVariant = (): Variant => {
  const value = new URLSearchParams(window.location.search).get('variant');
  return variants.find((variant) => variant === value) ?? 'inset12';
};

const body = `## An authored view

The card carries the content. Its commands sit above it, ready when you need them.

- Read in place.
- Select the card or hover to reveal its dock.
- Try Edit, Save and Cancel, then Close and Open.

**Compare the gap around the controls**, especially when the title is long.
`;

function fixtures(scene: Scene) {
  const narrow = scene === 'narrow';
  const overlap = scene === 'overlap';
  const home = spaceSnapshotSchema.parse({
    id: id(1),
    document: {
      version: 1,
      title: 'Floating Thing dock',
      defaultDiagram: id(2),
      diagrams: [
        {
          id: id(2),
          title: 'Review canvas',
          kind: 'positioned',
          positions: {
            [id(4)]: {
              x: 0,
              y: 0,
              open: true,
              openSize: { width: narrow ? 300 : 420, height: 350 },
            },
            [id(5)]: {
              x: overlap ? 250 : 470,
              y: overlap ? 100 : 0,
              open: true,
              openSize: { width: narrow ? 320 : 580, height: 350 },
            },
            [id(6)]: {
              x: 0,
              y: 405,
              open: true,
              openSize: { width: narrow ? 300 : 420, height: 290 },
            },
            [id(7)]: { x: 470, y: 435, open: false },
            [id(8)]: { x: overlap ? 610 : 790, y: overlap ? 285 : 435, open: false },
          },
          graphs: [{ id: id(3), title: 'Reading order', edges: [] }],
        },
      ],
    },
    things: [
      { id: id(4), document: { kind: 'markdown', title: 'A note in the canvas', body } },
      {
        id: id(5),
        document: {
          kind: 'space',
          title: 'The architecture',
          spaceId: id(10),
          diagram: id(11),
          graph: id(12),
        },
      },
      { id: id(6), document: { kind: 'alias', title: 'A second reading', target: id(4) } },
      {
        id: id(7),
        document: {
          kind: 'markdown',
          title: 'A closed note\nThe kind remains visible',
          body: 'Open me to compare the header transition.',
        },
      },
      {
        id: id(8),
        document: {
          kind: 'space',
          title: 'A closed Space',
          spaceId: id(10),
          diagram: id(11),
          graph: id(12),
        },
      },
    ],
  });
  const target = spaceSnapshotSchema.parse({
    id: id(10),
    document: {
      version: 1,
      title: 'Architecture',
      defaultDiagram: id(11),
      diagrams: [
        {
          id: id(11),
          title: 'Overview of the system',
          kind: 'positioned',
          positions: {
            [id(13)]: { x: 0, y: 0, open: false },
            [id(14)]: { x: 285, y: 0, open: false },
          },
          graphs: [
            { id: id(12), title: 'Request lifecycle', edges: [{ from: id(13), to: id(14) }] },
          ],
        },
      ],
    },
    things: [
      { id: id(13), document: { kind: 'markdown', title: 'Request', body: '' } },
      { id: id(14), document: { kind: 'markdown', title: 'Response', body: '' } },
    ],
  });
  return [home, target];
}

export const Compare: Story = () => {
  const [variant, setVariant] = useState<Variant>(initialVariant);
  const [scene, setScene] = useState<Scene>('mixed');
  const [showDocks, setShowDocks] = useState(true);
  const [revision, setRevision] = useState(0);
  const resolve = useMemo(
    () => async () => {
      const spaces = storySpaces(id(1), fixtures(scene));
      return storyOpening(spaces, await spaces.open(id(1)));
    },
    [scene],
  );
  const embeddedInset = useMemo(
    () =>
      variant === 'current' ? SPACE_THING_EMBED_INSET : { ...SPACE_THING_EMBED_INSET, top: 4 },
    [variant],
  );
  const choose = (next: Variant) => {
    setVariant(next);
    const url = new URL(window.location.href);
    url.searchParams.set('variant', next);
    window.history.replaceState(null, '', url);
  };
  const cycle = (step: number) =>
    choose(
      variants[(variants.indexOf(variant) + step + variants.length) % variants.length] ?? 'current',
    );
  return (
    <div className="floating-dock-prototype" data-variant={variant} data-show-docks={showDocks}>
      <div className="floating-dock-prototype__canvas">
        <EmbeddedInsetPrototype.Provider value={embeddedInset}>
          <CanvasThingRailPrototype.Provider
            value={(rail, openSpace) =>
              openSpace && variant !== 'current' ? (
                <FloatingSpaceRail inset={variant === 'inset8' ? 8 : 12} show={showDocks}>
                  {rail}
                </FloatingSpaceRail>
              ) : (
                rail
              )
            }
          >
            <Application key={`${scene}:${revision}`} resolve={resolve} />
          </CanvasThingRailPrototype.Provider>
        </EmbeddedInsetPrototype.Provider>
      </div>
      <aside className="floating-dock-prototype__switcher" aria-label="Prototype controls">
        <div
          className="floating-dock-prototype__variants"
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              cycle(event.key === 'ArrowLeft' ? -1 : 1);
            }
          }}
        >
          <span className="floating-dock-prototype__badge">PROTOTYPE</span>
          <Button
            size="compact"
            variant="ghost"
            aria-label="Previous variant"
            onClick={() => cycle(-1)}
          >
            ←
          </Button>
          {variants.map((option) => (
            <Button
              key={option}
              size="compact"
              variant={option === variant ? 'secondary' : 'ghost'}
              aria-pressed={option === variant}
              onClick={() => choose(option)}
            >
              {labels[option]}
            </Button>
          ))}
          <Button size="compact" variant="ghost" aria-label="Next variant" onClick={() => cycle(1)}>
            →
          </Button>
        </div>
        <div className="floating-dock-prototype__variants">
          {(['mixed', 'narrow', 'overlap'] as const).map((option) => (
            <Button
              key={option}
              size="compact"
              variant="ghost"
              aria-pressed={scene === option}
              onClick={() => setScene(option)}
            >
              {option === 'mixed'
                ? 'Mixed cards'
                : option === 'narrow'
                  ? 'Narrow cards'
                  : 'Overlap'}
            </Button>
          ))}
          <Button
            size="compact"
            variant="ghost"
            aria-pressed={showDocks}
            onClick={() => setShowDocks(!showDocks)}
          >
            {showDocks ? 'All docks shown' : 'Hover / selection'}
          </Button>
          <Button size="compact" variant="ghost" onClick={() => setRevision(revision + 1)}>
            Reset cards
          </Button>
          <span className="floating-dock-prototype__state">
            {variant === 'current'
              ? 'Header in flow · kind shown'
              : 'Dock floats inside card · open kind hidden'}{' '}
            · canvas zoom
          </span>
        </div>
      </aside>
    </div>
  );
};
Compare.meta = { iframed: true };
