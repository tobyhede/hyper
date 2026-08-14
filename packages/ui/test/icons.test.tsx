import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AliasIcon,
  CardKindIcon,
  CheckIcon,
  ChevronDownIcon,
  ConnectIcon,
  EditIcon,
  FlowIcon,
  GraphIcon,
  GridIcon,
  LayoutIcon,
  MarkdownIcon,
  PlusIcon,
  PresentIcon,
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
        <span data-testid="connect">
          <ConnectIcon />
        </span>
        <span data-testid="markdown">
          <MarkdownIcon />
        </span>
        <span data-testid="check">
          <CheckIcon />
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
      connect: 'arrow-right-from-line',
      markdown: 'file-text',
      check: 'check',
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
        <ConnectIcon size={12} />
        <MarkdownIcon size={14} />
      </>,
    );

    const glyphs = container.querySelectorAll('svg');
    expect(glyphs[0]).toHaveAttribute('width', '13');
    expect(glyphs[0]).toHaveAttribute('height', '13');
    expect(glyphs[0]).toHaveAttribute('stroke', '#123456');
    expect(glyphs[1]).toHaveAttribute('stroke', '#654321');
    expect(glyphs[2]).toHaveAttribute('width', '11');
    expect(glyphs[3]).toHaveAttribute('width', '12');
    expect(glyphs[4]).toHaveAttribute('width', '14');
  });

  it('keeps Card-kind glyphs decorative while their wrapper names the kind', () => {
    render(
      <>
        <CardKindIcon kind="markdown" />
        <CardKindIcon kind="alias" />
      </>,
    );

    const markdown = screen.getByRole('img', { name: 'Markdown Card' });
    const alias = screen.getByRole('img', { name: 'Alias' });
    expect(markdown).toHaveAttribute('title', 'Markdown Card');
    expect(alias).toHaveAttribute('title', 'Alias');
    expect(markdown.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(alias.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
