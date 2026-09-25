import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Popover, PopoverContent, PopoverTrigger } from '../src/index';

/**
 * Base UI positions through Floating UI, which measures, and jsdom ships
 * neither `ResizeObserver` nor pointer capture.
 */
beforeAll(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
});

afterAll(() => vi.unstubAllGlobals());

describe('PopoverContent', () => {
  /**
   * The shadow is the theme's, not a value written in numbers. An arbitrary
   * shadow chosen against a dark face makes a popover that lands on a light one
   * read as a smudge, with no way to reach it but a stylesheet outranking the
   * utility from outside.
   */
  it('spends a theme shadow rather than an arbitrary one', () => {
    render(
      <Popover open>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Panel</PopoverContent>
      </Popover>,
    );

    const { className } = screen.getByText('Panel');
    expect(className).toContain('shadow-lg');
    expect(className).not.toContain('shadow-[');
  });
});
