/** THROWAWAY UI PROTOTYPE — three dock structures, ?variant=A/B/C, using the supplied SVGs. */
import { useEffect, useState, type ReactNode } from 'react';
import type { Story } from '@ladle/react';
import {
  Button,
  ChoiceMenu,
  ChoiceMenuTrigger,
  DiagramIcon,
  GraphIcon,
  MarkdownIcon,
  SpaceIcon,
  PresentIcon,
  PlusIcon,
} from '@project/ui';
import './infinity-cube.css';

export default { title: 'Review/Infinity Cube' };

const MARKS = ['core', 'closed', 'open'] as const;
type MarkKind = (typeof MARKS)[number];
const VARIANTS = [
  { id: 'A', name: 'Inline', note: 'The mark anchors one continuous command bar.' },
  { id: 'B', name: 'Stacked', note: 'A branded Space header above a quieter row of tools.' },
  { id: 'C', name: 'Vertical', note: 'A compact side dock with the mark as its north star.' },
] as const;

function Mark({ kind }: { readonly kind: MarkKind }) {
  return <span className={`cube-dock__mark cube-dock__mark--${kind}`} aria-hidden="true" />;
}

function Choice({
  label,
  icon,
  names,
}: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly names: readonly string[];
}) {
  const [chosen, setChosen] = useState(names[0] ?? '');
  return (
    <ChoiceMenu
      label={label}
      choices={names.map((name) => ({ id: name, title: name }))}
      chosen={chosen}
      onChoose={setChosen}
      trigger={
        <ChoiceMenuTrigger
          className="cube-dock__choice"
          icon={icon}
          name={chosen}
          aria-label={label}
        />
      }
    />
  );
}

function SpaceChoice({ mark }: { readonly mark?: MarkKind }) {
  return (
    <Choice
      label="Spaces"
      icon={mark ? <Mark kind={mark} /> : <SpaceIcon />}
      names={['Field notes', 'Home', 'Systems thinking']}
    />
  );
}

function Tools() {
  return (
    <>
      <Choice label="Diagrams" icon={<DiagramIcon />} names={['Overview', 'Working board']} />
      <Choice
        label="Graphs"
        icon={<GraphIcon color="#829365" />}
        names={['The main thread', 'A different path']}
      />
    </>
  );
}

function CreateTools() {
  const [count, setCount] = useState(6);
  return (
    <div className="cube-dock__create">
      <span>
        Things <small>{count}</small>
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Create Markdown Thing"
        onClick={() => setCount(count + 1)}
      >
        <MarkdownIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Create Space Thing"
        onClick={() => setCount(count + 1)}
      >
        <SpaceIcon />
      </Button>
    </div>
  );
}

function Present() {
  const [active, setActive] = useState(false);
  return (
    <Button
      className="cube-dock__present"
      variant="secondary"
      size="compact"
      aria-pressed={active}
      onClick={() => setActive(!active)}
    >
      <PresentIcon color="currentColor" />
      {active ? 'Stop' : 'Present'}
    </Button>
  );
}

function VariantA({ mark }: { readonly mark: MarkKind }) {
  return (
    <div className="cube-dock__surface cube-dock__inline">
      <SpaceChoice mark={mark} />
      <span className="cube-dock__divider" />
      <Tools />
      <span className="cube-dock__divider" />
      <CreateTools />
      <Present />
    </div>
  );
}

function VariantB({ mark }: { readonly mark: MarkKind }) {
  return (
    <div className="cube-dock__surface cube-dock__stacked">
      <div className="cube-dock__header">
        <span className="cube-dock__brand">
          <Mark kind={mark} />
          <span>INFINITY CUBE</span>
        </span>
        <span className="cube-dock__divider" />
        <SpaceChoice />
        <span className="cube-dock__saved">Saved</span>
      </div>
      <div className="cube-dock__tools">
        <Tools />
        <span className="cube-dock__divider" />
        <CreateTools />
        <Present />
      </div>
    </div>
  );
}

function VariantC({ mark }: { readonly mark: MarkKind }) {
  return (
    <div className="cube-dock__surface cube-dock__vertical">
      <div className="cube-dock__brand">
        <Mark kind={mark} />
        <span>INFINITY CUBE</span>
      </div>
      <span className="cube-dock__eyebrow">SPACE</span>
      <SpaceChoice />
      <span className="cube-dock__eyebrow">DIAGRAM & GRAPH</span>
      <Tools />
      <span className="cube-dock__divider" />
      <CreateTools />
      <Present />
    </div>
  );
}

function Canvas() {
  return (
    <div className="cube-dock__canvas" aria-label="Example Diagram">
      <svg
        className="cube-dock__edges"
        viewBox="0 0 1000 600"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M260 210 C360 210 355 160 455 160 S580 270 680 270 S800 370 870 370" />
        <path d="M455 160 C455 350 450 390 565 390" />
      </svg>
      <div className="cube-dock__thing" style={{ left: '12%', top: '30%' }}>
        <small>01 / START HERE</small>
        <strong>A place for ideas</strong>
        <p>Give your thinking a little room.</p>
      </div>
      <div className="cube-dock__thing" style={{ left: '36%', top: '21%' }}>
        <small>02 / EXPLORE</small>
        <strong>Follow the connections</strong>
      </div>
      <div className="cube-dock__thing" style={{ left: '62%', top: '41%' }}>
        <small>03 / CONNECT</small>
        <strong>Find a different angle</strong>
      </div>
      <div className="cube-dock__thing cube-dock__thing--alias" style={{ left: '46%', top: '66%' }}>
        <small>04 / RETURN</small>
        <strong>Keep the thread</strong>
      </div>
      <span className="cube-dock__canvas-note">
        FIELD NOTES <span>6 Things · 2 Graphs</span>
      </span>
      <span className="cube-dock__zoom">
        <PlusIcon /> 100%
      </span>
    </div>
  );
}

export const Default: Story = () => {
  const [variant, setVariant] = useState(
    () =>
      VARIANTS.find(
        (item) => item.id === new URLSearchParams(window.location.search).get('variant'),
      ) ?? VARIANTS[0],
  );
  const [mark, setMark] = useState<MarkKind>(
    () =>
      MARKS.find((item) => item === new URLSearchParams(window.location.search).get('mark')) ??
      'core',
  );
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', variant.id);
    url.searchParams.set('mark', mark);
    window.history.replaceState(null, '', url);
  }, [variant, mark]);
  function cycle(direction: number) {
    const index = VARIANTS.indexOf(variant);
    setVariant(VARIANTS[(index + direction + VARIANTS.length) % VARIANTS.length] ?? VARIANTS[0]);
  }
  return (
    <main
      className="cube-dock"
      data-variant={variant.id}
      onKeyDown={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('input, textarea, [contenteditable], [role="menu"]')
        )
          return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          cycle(event.key === 'ArrowRight' ? 1 : -1);
        }
      }}
    >
      <header className="cube-dock__intro">
        <span className="cube-dock__eyebrow">DOCK STUDIES / 01—03</span>
        <h1>A small mark. A place to begin.</h1>
        <p>Three structures. Three supplied icons. All marks at 16px in the dock.</p>
      </header>
      <section className="cube-dock__stage">
        <Canvas />
        <div className="cube-dock__position" key={variant.id}>
          {variant.id === 'A' ? (
            <VariantA mark={mark} />
          ) : variant.id === 'B' ? (
            <VariantB mark={mark} />
          ) : (
            <VariantC mark={mark} />
          )}
        </div>
      </section>
      <footer className="cube-dock__caption">
        <strong>
          {variant.id} / {variant.name}
        </strong>
        <span>{variant.note}</span>
        <span className="cube-dock__prototype">PROTOTYPE</span>
      </footer>
      {import.meta.env.DEV && (
        <nav className="cube-dock__variants" aria-label="Prototype variants">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous variant"
            onClick={() => cycle(-1)}
          >
            ←
          </Button>
          {VARIANTS.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              size="compact"
              aria-pressed={variant.id === item.id}
              onClick={() => setVariant(item)}
            >
              {item.id} · {item.name}
            </Button>
          ))}
          <Button variant="ghost" size="icon" aria-label="Next variant" onClick={() => cycle(1)}>
            →
          </Button>
          <span className="cube-dock__divider" />
          {MARKS.map((item) => (
            <Button
              key={item}
              variant="ghost"
              size="compact"
              aria-pressed={mark === item}
              onClick={() => setMark(item)}
            >
              <Mark kind={item} />
              {item === 'closed' ? 'Closed-loop' : item === 'core' ? 'Core' : 'Open'}
            </Button>
          ))}
        </nav>
      )}
    </main>
  );
};
