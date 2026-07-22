import { useEffect, useRef } from 'react';
import Reveal from 'reveal.js';
import type { Api as RevealApi } from 'reveal.js';
import { marked } from 'marked';

export interface DeckSlide {
  id: string;
  title: string;
  markdown: string;
}

export interface PresentationDeckProps {
  /** The route's steps, in order — one card per slide. */
  slides: readonly DeckSlide[];
  stepIndex: number;
  onStepChange: (index: number) => void;
  onExit: () => void;
}

const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/**
 * A route presented as a reveal.js deck (ADR 0008).
 *
 * reveal owns its DOM, so React must not diff inside it. The slides are written
 * imperatively here — built once from the route's steps, then handed to
 * `Reveal.sync()` whenever they change. React renders only the empty container.
 *
 * The step index is bound in both directions: our store drives `Reveal.slide()`,
 * and reveal's `slidechanged` drives the store. A guard stops the two chasing
 * each other.
 */
export function PresentationDeck({
  slides,
  stepIndex,
  onStepChange,
  onExit,
}: PresentationDeckProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<RevealApi | null>(null);
  /** Set while we are driving reveal, so its echo does not bounce back. */
  const drivingRef = useRef(false);
  const onStepChangeRef = useRef(onStepChange);
  useEffect(() => {
    onStepChangeRef.current = onStepChange;
  });

  // Build the slide DOM. Not React's to own — reveal rewrites it.
  useEffect(() => {
    const slidesEl = containerRef.current?.querySelector('.slides');
    if (!slidesEl) return;

    slidesEl.replaceChildren(
      ...slides.map((slide) => {
        const section = document.createElement('section');
        section.dataset['cardId'] = slide.id;
        // reveal owns this subtree, so the content is handed over as HTML rather
        // than diffed by React. `marked` is used here rather than the reading
        // surface's react-markdown because that renders to React nodes, not
        // markup — see `.scratch/reveal-presentation/` for the divergence risk.
        section.innerHTML = `<h2>${escapeHtml(slide.title)}</h2>${marked.parse(slide.markdown, { async: false })}`;
        return section;
      }),
    );
    deckRef.current?.sync();
  }, [slides]);

  // Initialise once, and tear down on exit so a second presentation starts clean.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const deck = new Reveal(container, {
      embedded: false,
      hash: false,
      // Our own keyboard handling owns Escape; reveal owns arrows and space.
      keyboard: true,
      controls: true,
      progress: true,
      slideNumber: 'c/t',
      transition: 'slide',
      // The fixed logical canvas — the thing hand-rolling would have had to
      // solve (card-display/05). 16:9, matching `card.ts`.
      width: 1280,
      height: 720,
      margin: 0.06,
    });

    deckRef.current = deck;
    void deck.initialize().then(() => {
      deck.on('slidechanged', (event) => {
        if (drivingRef.current) return;
        onStepChangeRef.current((event as unknown as { indexh: number }).indexh);
      });
    });

    return () => {
      deckRef.current = null;
      try {
        deck.destroy();
      } catch {
        // reveal throws if it was never fully initialised; nothing to clean up.
      }
    };
  }, []);

  // Our store drives reveal.
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck?.isReady?.()) return;
    if (deck.getIndices().h === stepIndex) return;
    drivingRef.current = true;
    deck.slide(stepIndex);
    drivingRef.current = false;
  }, [stepIndex]);

  // Escape leaves the presentation. reveal uses it for its own overview, so we
  // take it in the capture phase before reveal sees it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onExit();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onExit]);

  return (
    <div className="deck" data-testid="presentation-deck">
      <div className="reveal" ref={containerRef}>
        <div className="slides" />
      </div>
      <button type="button" className="deck__exit" data-testid="exit-presentation" onClick={onExit}>
        Exit
      </button>
    </div>
  );
}
