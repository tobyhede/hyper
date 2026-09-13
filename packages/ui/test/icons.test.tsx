import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AliasIcon,
  ThingKindIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseThingIcon,
  EditIcon,
  EnterSpaceIcon,
  FitViewIcon,
  GraphIcon,
  DiagramIcon,
  MarkdownIcon,
  OpenThingIcon,
  PlusIcon,
  PresentIcon,
  StopPresentingIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../src/index';

describe('the public icon facade', () => {
  it('uses Lucide for every general-purpose interface glyph', () => {
    render(
      <div>
        <span data-testid="diagram">
          <DiagramIcon />
        </span>
        <span data-testid="graph">
          <GraphIcon color="#123456" />
        </span>
        <span data-testid="present">
          <PresentIcon color="#123456" />
        </span>
        <span data-testid="stop-presenting">
          <StopPresentingIcon color="#123456" />
        </span>
        <span data-testid="edit">
          <EditIcon />
        </span>
        <span data-testid="chevron">
          <ChevronDownIcon />
        </span>
        <span data-testid="plus">
          <PlusIcon />
        </span>
        <span data-testid="alias">
          <AliasIcon />
        </span>
        <span data-testid="open-thing">
          <OpenThingIcon />
        </span>
        <span data-testid="close-thing">
          <CloseThingIcon />
        </span>
        <span data-testid="enter-space">
          <EnterSpaceIcon />
        </span>
        <span data-testid="markdown">
          <MarkdownIcon />
        </span>
        <span data-testid="check">
          <CheckIcon />
        </span>
        <span data-testid="zoom-in">
          <ZoomInIcon />
        </span>
        <span data-testid="zoom-out">
          <ZoomOutIcon />
        </span>
        <span data-testid="fit-view">
          <FitViewIcon />
        </span>
      </div>,
    );

    // `alias` is absent on purpose and has its own test below: it is the one
    // glyph the facade composes rather than forwards, so its outer element is
    // ours and only the base inside it is Lucide's.
    const expectedLucideName = {
      diagram: 'layout-grid',
      graph: 'route',
      present: 'play',
      'stop-presenting': 'square',
      edit: 'pencil',
      chevron: 'chevron-down',
      plus: 'plus',
      'open-thing': 'maximize-2',
      'close-thing': 'minimize-2',
      'enter-space': 'log-in',
      markdown: 'sticky-note',
      check: 'check',
      'zoom-in': 'plus',
      'zoom-out': 'minus',
      'fit-view': 'maximize',
    } as const;

    for (const [icon, lucideName] of Object.entries(expectedLucideName)) {
      const glyph = screen.getByTestId(icon).querySelector('svg');
      expect(glyph).toHaveClass('lucide', `lucide-${lucideName}`);
      expect(glyph).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('draws an Alias as the base glyph it points at, badged rather than replaced', () => {
    render(
      <>
        <span data-testid="alias-default">
          <AliasIcon />
        </span>
        <span data-testid="alias-of-space">
          <AliasIcon base="space" />
        </span>
      </>,
    );

    // The base carries the kind and Lucide still draws it; the outer SVG is the
    // composition, which is why it is ours and why the badge can sit over it.
    for (const [testId, lucideName] of [
      ['alias-default', 'sticky-note'],
      ['alias-of-space', 'frame'],
    ] as const) {
      const composed = screen.getByTestId(testId).querySelector('svg');
      expect(composed).toHaveAttribute('aria-hidden', 'true');
      expect(composed).not.toHaveClass('lucide');
      expect(composed?.querySelector('svg')).toHaveClass('lucide', `lucide-${lucideName}`);
    }

    // The hole is cut rather than painted, so the badge is legible on any
    // surface; a mask that did not resolve would leave the base whole.
    const masked = screen.getByTestId('alias-default').querySelector('g[mask]');
    const maskId = screen.getByTestId('alias-default').querySelector('mask')?.id;
    expect(maskId).toBeTruthy();
    expect(masked).toHaveAttribute('mask', `url(#${maskId ?? ''})`);

    // Two of them in one tree must not share a mask id.
    const first = screen.getByTestId('alias-default').querySelector('mask')?.id;
    const second = screen.getByTestId('alias-of-space').querySelector('mask')?.id;
    expect(first).not.toEqual(second);
  });

  it('keeps the facade props that consumers use for size and colour', () => {
    const { container } = render(
      <>
        <GraphIcon color="#123456" size={13} />
        <PresentIcon color="#654321" />
        <StopPresentingIcon color="#abcdef" />
        <AliasIcon size={11} />
        <MarkdownIcon size={14} />
      </>,
    );

    // `querySelectorAll` is document order, and the Alias contributes two —
    // its own composed SVG and the Lucide base nested inside it — so the
    // indices after it are not the argument order.
    const glyphs = container.querySelectorAll('svg');
    expect(glyphs[0]).toHaveAttribute('width', '13');
    expect(glyphs[0]).toHaveAttribute('height', '13');
    expect(glyphs[0]).toHaveAttribute('stroke', '#123456');
    expect(glyphs[1]).toHaveAttribute('stroke', '#654321');
    expect(glyphs[2]).toHaveAttribute('width', '12');
    expect(glyphs[2]).toHaveAttribute('stroke', '#abcdef');
    // The Alias sizes its own box; the base inside it always fills the 24-unit
    // viewBox, which is what keeps the badge in the same corner at every size.
    expect(glyphs[3]).toHaveAttribute('width', '11');
    expect(glyphs[4]).toHaveAttribute('width', '24');
    expect(glyphs[5]).toHaveAttribute('width', '14');
  });

  /**
   * Present is a transport control, so a surface may want the solid triangle
   * the convention draws. Lucide writes `fill="none"` as a presentation
   * attribute, so without a prop the only way in is a stylesheet reaching
   * through to the `svg` — a surface overriding a glyph's own drawing.
   */
  it('fills Present on request, in the colour the glyph was already given', () => {
    const { container } = render(
      <>
        <PresentIcon color="#654321" />
        <PresentIcon color="#654321" filled />
      </>,
    );

    const glyphs = container.querySelectorAll('svg');
    expect(glyphs[0]).toHaveAttribute('fill', 'none');
    expect(glyphs[1]).toHaveAttribute('fill', '#654321');
    expect(glyphs[1]).toHaveAttribute('stroke', '#654321');
  });

  it('keeps Thing-kind glyphs decorative while their wrapper names the kind', () => {
    render(
      <>
        <ThingKindIcon kind="markdown" />
        <ThingKindIcon kind="alias" />
        <ThingKindIcon kind="space" />
      </>,
    );

    const markdown = screen.getByRole('img', { name: 'Markdown Thing' });
    const alias = screen.getByRole('img', { name: 'Alias' });
    const space = screen.getByRole('img', { name: 'Space Thing' });
    expect(markdown).toHaveAttribute('title', 'Markdown Thing');
    expect(alias).toHaveAttribute('title', 'Alias');
    expect(space).toHaveAttribute('title', 'Space Thing');
    expect(markdown.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(alias.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(space.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  /**
   * A decorative glyph sits inside a control that has already named the command
   * it performs — `Create Alias`, not `Alias`. A `title` here is a second
   * tooltip on the same pixels, and the inner node is the one the pointer lands
   * on, so the button's own tooltip never appears: hovering Create Alias would
   * read `Alias`, which names the noun the button does not perform.
   */
  it('gives a decorative glyph no tooltip of its own', () => {
    const { container } = render(
      <>
        <ThingKindIcon kind="markdown" decorative />
        <ThingKindIcon kind="alias" decorative />
        <ThingKindIcon kind="space" decorative />
      </>,
    );

    const glyphs = container.querySelectorAll('[data-thing-kind]');

    expect(glyphs).toHaveLength(3);
    for (const glyph of glyphs) {
      expect(glyph).toHaveAttribute('aria-hidden', 'true');
      expect(glyph).not.toHaveAttribute('title');
    }
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('tells an Alias of a Space Thing from an Alias of a Markdown Thing', () => {
    render(
      <>
        <ThingKindIcon kind="alias" aliasOf="markdown" />
        <ThingKindIcon kind="alias" aliasOf="space" />
      </>,
    );

    // The glyph carries the distinction, so the accessible name has to as well —
    // otherwise the two draw differently and announce identically, which is
    // worse than the single Alias glyph this replaced.
    const ofMarkdown = screen.getByRole('img', { name: 'Alias of a Markdown Thing' });
    const ofSpace = screen.getByRole('img', { name: 'Alias of a Space Thing' });
    expect(ofMarkdown).toHaveAttribute('data-thing-kind', 'alias');
    expect(ofMarkdown).toHaveAttribute('data-alias-of', 'markdown');
    expect(ofSpace).toHaveAttribute('data-alias-of', 'space');
    expect(ofMarkdown.querySelector('svg svg')).toHaveClass('lucide-sticky-note');
    expect(ofSpace.querySelector('svg svg')).toHaveClass('lucide-frame');
  });
});
