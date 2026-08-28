import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AliasIcon,
  CardKindIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseCardIcon,
  EditIcon,
  FitViewIcon,
  FlowIcon,
  GraphIcon,
  GridIcon,
  LayoutIcon,
  MarkdownIcon,
  OpenCardIcon,
  PlusIcon,
  PresentIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../src/index';

describe('the public icon facade', () => {
  it('uses Lucide for every general-purpose interface glyph', () => {
    render(
      <div>
        <span data-testid="flow">
          <FlowIcon />
        </span>
        <span data-testid="grid">
          <GridIcon />
        </span>
        <span data-testid="layout">
          <LayoutIcon />
        </span>
        <span data-testid="graph">
          <GraphIcon color="#123456" />
        </span>
        <span data-testid="present">
          <PresentIcon color="#123456" />
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
        <span data-testid="open-card">
          <OpenCardIcon />
        </span>
        <span data-testid="close-card">
          <CloseCardIcon />
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

    const expectedLucideName = {
      flow: 'workflow',
      grid: 'grid-2x2',
      layout: 'panels-top-left',
      graph: 'network',
      present: 'play',
      edit: 'pencil',
      chevron: 'chevron-down',
      plus: 'plus',
      alias: 'corner-down-right',
      'open-card': 'maximize-2',
      'close-card': 'minimize-2',
      markdown: 'file-text',
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

  it('keeps the facade props that consumers use for size and colour', () => {
    const { container } = render(
      <>
        <GraphIcon color="#123456" size={13} />
        <PresentIcon color="#654321" />
        <AliasIcon size={11} />
        <MarkdownIcon size={14} />
      </>,
    );

    const glyphs = container.querySelectorAll('svg');
    expect(glyphs[0]).toHaveAttribute('width', '13');
    expect(glyphs[0]).toHaveAttribute('height', '13');
    expect(glyphs[0]).toHaveAttribute('stroke', '#123456');
    expect(glyphs[1]).toHaveAttribute('stroke', '#654321');
    expect(glyphs[2]).toHaveAttribute('width', '11');
    expect(glyphs[3]).toHaveAttribute('width', '14');
  });

  it('keeps Card-kind glyphs decorative while their wrapper names the kind', () => {
    render(
      <>
        <CardKindIcon kind="markdown" />
        <CardKindIcon kind="alias" />
        <CardKindIcon kind="space" />
      </>,
    );

    const markdown = screen.getByRole('img', { name: 'Markdown Card' });
    const alias = screen.getByRole('img', { name: 'Alias' });
    const space = screen.getByRole('img', { name: 'Space Card' });
    expect(markdown).toHaveAttribute('title', 'Markdown Card');
    expect(alias).toHaveAttribute('title', 'Alias');
    expect(space).toHaveAttribute('title', 'Space Card');
    expect(markdown.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(alias.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(space.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
