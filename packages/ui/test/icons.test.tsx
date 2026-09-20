import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ReferenceIcon,
  ParentIcon,
  SpaceIcon,
  SpaceResourceIcon,
  ResourceKindIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseResourceIcon,
  EditIcon,
  EnterSpaceIcon,
  OpenIndependentlyIcon,
  FitViewIcon,
  GraphIcon,
  MapIcon,
  MarkdownIcon,
  OpenResourceIcon,
  PlusIcon,
  PresentIcon,
  StopPresentingIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../src/index';

describe('the public icon facade', () => {
  it('draws Parent/Meta with the supplied OPEN artwork at 16px', () => {
    const { container } = render(<ParentIcon />);
    const glyph = container.querySelector('svg');
    expect(glyph).toHaveAttribute('viewBox', '0 0 16 16');
    expect(glyph).toHaveAttribute('width', '16');
    expect(glyph).toHaveAttribute('height', '16');
    expect(glyph).toHaveAttribute('fill', 'currentColor');
    expect(glyph).toHaveAttribute('fill-rule', 'evenodd');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(
      Array.from(container.querySelectorAll('path'), (path) => path.getAttribute('d')),
    ).toEqual([
      'M4.5 2.5 8 .5 11.5 2.5 10 3.5 8 2.25 6 3.5Z',
      'M1 5.382 4.106 3.829 12.106 9.829 13 9.382V6.618L12.106 6.171 10.5 7.375 8.833 6.125 11.894 3.829 15 5.382V10.618L11.894 12.171 3.894 6.171 3 6.618V9.382L3.894 9.829 5.5 8.625 7.167 9.875 4.106 12.171 1 10.618Z',
      'M4.5 13.5 6 12.5 8 13.75 10 12.5 11.5 13.5 8 15.5Z',
    ]);
  });

  it('uses the same cube for Spaces, Space Resources and their kind glyphs', () => {
    render(
      <>
        <span data-testid="space">
          <SpaceIcon size={16} />
        </span>
        <span data-testid="space-resource">
          <SpaceResourceIcon size={16} />
        </span>
        <ResourceKindIcon kind="space" size={16} />
      </>,
    );
    for (const glyph of [
      screen.getByTestId('space'),
      screen.getByTestId('space-resource'),
      screen.getByRole('img', { name: 'Space Resource' }),
    ]) {
      expect(glyph.querySelector('.lucide-box')).toBeInTheDocument();
      expect(glyph.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(glyph.querySelector('svg')).toHaveAttribute('width', '16');
    }
  });

  it('uses Lucide for every general-purpose interface glyph', () => {
    render(
      <div>
        <span data-testid="map">
          <MapIcon />
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
        <span data-testid="reference">
          <ReferenceIcon />
        </span>
        <span data-testid="open-resource">
          <OpenResourceIcon />
        </span>
        <span data-testid="close-resource">
          <CloseResourceIcon />
        </span>
        <span data-testid="enter-space">
          <EnterSpaceIcon />
        </span>
        <span data-testid="open-independently">
          <OpenIndependentlyIcon />
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

    // `reference` is absent on purpose and has its own test below: it is the one
    // glyph the facade composes rather than forwards, so its outer element is
    // ours and only the base inside it is Lucide's.
    const expectedLucideName = {
      map: 'layout-grid',
      graph: 'route',
      present: 'play',
      'stop-presenting': 'square',
      edit: 'pencil',
      chevron: 'chevron-down',
      plus: 'plus',
      'open-resource': 'maximize-2',
      'close-resource': 'minimize-2',
      'enter-space': 'log-in',
      'open-independently': 'external-link',
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

  it('draws a Reference Resource as the base glyph it points at, badged rather than replaced', () => {
    render(
      <>
        <span data-testid="reference-default">
          <ReferenceIcon />
        </span>
        <span data-testid="reference-of-space">
          <ReferenceIcon base="space" />
        </span>
      </>,
    );

    // The base carries the kind and Lucide still draws it; the outer SVG is the
    // composition, which is why it is ours and why the badge can sit over it.
    for (const [testId, lucideName] of [
      ['reference-default', 'sticky-note'],
      ['reference-of-space', 'box'],
    ] as const) {
      const composed = screen.getByTestId(testId).querySelector('svg');
      expect(composed).toHaveAttribute('aria-hidden', 'true');
      expect(composed).not.toHaveClass('lucide');
      expect(composed?.querySelector('.lucide')).toHaveClass('lucide', `lucide-${lucideName}`);
    }

    // The hole is cut rather than painted, so the badge is legible on any
    // surface; a mask that did not resolve would leave the base whole.
    const masked = screen.getByTestId('reference-default').querySelector('g[mask]');
    const maskId = screen.getByTestId('reference-default').querySelector('mask')?.id;
    expect(maskId).toBeTruthy();
    expect(masked).toHaveAttribute('mask', `url(#${maskId ?? ''})`);

    // Two of them in one tree must not share a mask id.
    const first = screen.getByTestId('reference-default').querySelector('mask')?.id;
    const second = screen.getByTestId('reference-of-space').querySelector('mask')?.id;
    expect(first).not.toEqual(second);
  });

  it('keeps the facade props that consumers use for size and colour', () => {
    const { container } = render(
      <>
        <GraphIcon color="#123456" size={13} />
        <PresentIcon color="#654321" />
        <StopPresentingIcon color="#abcdef" />
        <ReferenceIcon size={11} />
        <MarkdownIcon size={14} />
      </>,
    );

    // `querySelectorAll` is document order, and the Reference Resource contributes two —
    // its own composed SVG and the Lucide base nested inside it — so the
    // indices after it are not the argument order.
    const glyphs = container.querySelectorAll('svg');
    expect(glyphs[0]).toHaveAttribute('width', '13');
    expect(glyphs[0]).toHaveAttribute('height', '13');
    expect(glyphs[0]).toHaveAttribute('stroke', '#123456');
    expect(glyphs[1]).toHaveAttribute('stroke', '#654321');
    expect(glyphs[1]).toHaveAttribute('width', '16');
    expect(glyphs[1]).toHaveClass('origin-center', 'scale-75');
    expect(glyphs[2]).toHaveAttribute('width', '16');
    expect(glyphs[2]).toHaveClass('origin-center', 'scale-75');
    expect(glyphs[2]).toHaveAttribute('stroke', '#abcdef');
    // The Reference Resource sizes its own box; the base inside it always fills the 24-unit
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

  it('keeps Resource-kind glyphs decorative while their wrapper names the kind', () => {
    render(
      <>
        <ResourceKindIcon kind="markdown" />
        <ResourceKindIcon kind="reference" />
        <ResourceKindIcon kind="space" />
      </>,
    );

    const markdown = screen.getByRole('img', { name: 'Markdown Resource' });
    const reference = screen.getByRole('img', { name: 'Reference Resource' });
    const space = screen.getByRole('img', { name: 'Space Resource' });
    expect(markdown).toHaveAttribute('title', 'Markdown Resource');
    expect(reference).toHaveAttribute('title', 'Reference Resource');
    expect(space).toHaveAttribute('title', 'Space Resource');
    expect(markdown.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(reference.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(space.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  /**
   * A decorative glyph sits inside a control that has already named the command
   * it performs — `Create Reference`, not `Reference Resource`. A `title` here is a second
   * tooltip on the same pixels, and the inner node is the one the pointer lands
   * on, so the button's own tooltip never appears: hovering Create Reference would
   * read `Reference Resource`, which names the noun the button does not perform.
   */
  it('gives a decorative glyph no tooltip of its own', () => {
    const { container } = render(
      <>
        <ResourceKindIcon kind="markdown" decorative />
        <ResourceKindIcon kind="reference" decorative />
        <ResourceKindIcon kind="space" decorative />
      </>,
    );

    const glyphs = container.querySelectorAll('[data-resource-kind]');

    expect(glyphs).toHaveLength(3);
    for (const glyph of glyphs) {
      expect(glyph).toHaveAttribute('aria-hidden', 'true');
      expect(glyph).not.toHaveAttribute('title');
    }
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('tells a Reference to a Space Resource from a Reference to a Markdown Resource', () => {
    render(
      <>
        <ResourceKindIcon kind="reference" referenceOf="markdown" />
        <ResourceKindIcon kind="reference" referenceOf="space" />
      </>,
    );

    // The glyph carries the distinction, so the accessible name has to as well —
    // otherwise the two draw differently and announce identically, which is
    // worse than the single Reference Resource glyph this replaced.
    const ofMarkdown = screen.getByRole('img', { name: 'Reference to a Markdown Resource' });
    const ofSpace = screen.getByRole('img', { name: 'Reference to a Space Resource' });
    expect(ofMarkdown).toHaveAttribute('data-resource-kind', 'reference');
    expect(ofMarkdown).toHaveAttribute('data-reference-of', 'markdown');
    expect(ofSpace).toHaveAttribute('data-reference-of', 'space');
    expect(ofMarkdown.querySelector('svg svg')).toHaveClass('lucide-sticky-note');
    expect(ofSpace.querySelector('.lucide')).toHaveClass('lucide-box');
  });
});
