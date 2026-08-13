import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import { OpenCard } from '../src/components/OpenCard';

const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const SECOND_ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

const markdown = (over: { description?: string; body?: string } = {}) => ({
  id: CARD_ID,
  title: 'A',
  ...(over.description === undefined ? {} : { description: over.description }),
  kind: 'markdown' as const,
  body: over.body ?? '**A** source',
});

/**
 * cmdk's list measures itself, and jsdom ships no `ResizeObserver`.
 *
 * The occurrence tests below pass no Target, which used to mean no list was
 * rendered and nothing measured anything. The picker now draws its list
 * whatever it holds — an expanded combobox has to point at one — so this file
 * needs the stub every other cmdk-mounting test already carries.
 */
beforeAll(() => {
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

describe('the opened Card', () => {
  it('edits resolved Markdown through an Alias while keeping the delegation visible', () => {
    const onComplete = vi.fn();
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        content={markdown({ description: 'Shared caption' })}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Opened through A again')).toBeVisible();
    expect(screen.getByText('Editing content on A')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Description of A' })).toHaveValue('Shared caption');
    expect(screen.getByRole('textbox', { name: 'Markdown source of A' })).toHaveValue(
      '**A** source',
    );
    expect(screen.queryByLabelText(/target/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/kind/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source of A' }), {
      target: { value: 'Shared source rewritten' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'A',
      description: 'Shared caption',
      kind: 'markdown',
      body: 'Shared source rewritten',
    });
  });

  /**
   * An Alias carries a description of its own and the graph draws it, so `A′`
   * can show one caption while this pane edits another Card's. Labelled plainly
   * "Description", the field said nothing about which of the two an author was
   * about to overwrite. Directly opened there is only one Card and the plain
   * labels are the right ones — the qualifier answers a question that only the
   * delegated case asks.
   */
  it('says whose description and source a delegated open authors', () => {
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        content={markdown({ description: 'Shared caption' })}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Description of A' })).toHaveValue('Shared caption');
    expect(screen.getByRole('textbox', { name: 'Markdown source of A' })).toHaveValue(
      '**A** source',
    );
    expect(screen.queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Markdown source' })).not.toBeInTheDocument();
  });

  /**
   * A delegated open draws neither the title field nor the node that reports a
   * refused title, so this pane can neither author a title nor say anything
   * about one. `min(1)` counts characters and a space is one, so a stored title
   * of spaces passes the schema at rest and arrives here intact — and trimming
   * what the author cannot see turned `Done` into a no-op that reported nothing,
   * because the refusal was written into a node this pane does not render. The
   * target's title was validated when it was stored, so it cannot fail now.
   */
  it('completes a delegated edit whose target title is only whitespace', () => {
    const onComplete = vi.fn();
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        content={{ ...markdown(), title: '   ' }}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    // Matched loosely because the qualifier names a Card whose title is the
    // whitespace this test is about, and an accessible name is whitespace-
    // normalised: the label reads "Markdown source of" and nothing follows it.
    fireEvent.change(screen.getByRole('textbox', { name: /^Markdown source/ }), {
      target: { value: 'Rewritten through the Alias' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: '   ',
      kind: 'markdown',
      body: 'Rewritten through the Alias',
    });
  });

  /**
   * A refusal has to land somewhere the author can see it, and a delegated open
   * draws no title field and no node to report a refused title. Reporting one
   * there reported it nowhere: `Done` did nothing and said nothing — the same
   * silent no-op the trimming rule above was written to remove, reached from
   * the other side.
   *
   * Nothing can reach it today, and this test has to manufacture the state to
   * assert on it: a stored Card's title has already passed this exact rule,
   * because `markdownCardDocumentSchema` *is* `markdownCardSchema` less its id,
   * and the delegated path passes the stored title straight through. That is an
   * equality between two schemas which nothing enforces, and the day it stops
   * holding the symptom is a button that does nothing. So the refusal falls
   * through to the generic message wherever it cannot be reported in place.
   */
  it('says something when a delegated edit is refused for its target’s title', () => {
    const onComplete = vi.fn();
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        content={{ ...markdown(), title: '' }}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByRole('alert')).toHaveTextContent('The Card could not be completed.');
    expect(onComplete).not.toHaveBeenCalled();
  });

  /**
   * The occurrence's own title, which the pane could not reach at all.
   *
   * `titleEditable` was `!delegated`, so opening an Alias drew no Title field —
   * and the storyboard's Frame 4 draws one, holding the Alias's own title beside
   * its Target. It bites hardest straight after creation, where an Alias that
   * took its Target's title lands the author in the one pane that cannot tell
   * the two Cards apart by name.
   *
   * Plain `Title`, like the `Target` beside it: unqualified names the Card this
   * pane is about, and the qualified `Description of A` names the other one.
   */
  it('renames the occurrence it was opened through', () => {
    const onEdit = vi.fn(() => null);
    const onComplete = vi.fn();
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        content={markdown()}
        occurrence={{ targets: [], onEdit }}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    const title = screen.getByRole('textbox', { name: 'Title' });
    expect(title).toHaveValue('A again');

    fireEvent.change(title, { target: { value: 'Recap' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onEdit).toHaveBeenCalledWith({ title: 'Recap', target: CARD_ID });
    // A different edit subject from the fields under it, so the Alias's Edit
    // names the Alias and the content's names the Card that owns the content.
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: CARD_ID, title: 'A' }));
  });

  /**
   * Nothing on this pane commits before `Done` (ADR 0048), and the occurrence's
   * Title is where that used to be untrue: it settled on blur and on Enter, so
   * an author who tabbed past it had authored a Card.
   */
  it('pends the occurrence’s title until Done', () => {
    const onEdit = vi.fn(() => null);
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        content={markdown()}
        occurrence={{ targets: [], onEdit }}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const title = screen.getByRole('textbox', { name: 'Title' });

    fireEvent.change(title, { target: { value: 'Recap' } });
    fireEvent.blur(title);

    expect(onEdit).not.toHaveBeenCalled();
    expect(title).toHaveValue('Recap');
  });

  /**
   * The sentence belongs to Authoring, which is the only thing that knows which
   * rule was hit (ADR 0042), so the pane's job is to put it where the author is
   * looking. It is drawn once for the pair of fields rather than tied to either:
   * `Done` submits the Title and the Target as one Edit, and naming one of them
   * would send an author to the wrong field half the time.
   */
  it('shows the Space’s refusal of the occurrence’s Edit, and withdraws it on the next attempt', () => {
    const onEdit = vi.fn(() => 'A Card title is required.');
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        content={markdown()}
        occurrence={{ targets: [], onEdit }}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const title = screen.getByRole('textbox', { name: 'Title' });

    fireEvent.change(title, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByRole('alert')).toHaveTextContent('A Card title is required.');

    // The message describes the attempt that produced it, and editing either
    // field begins a different one.
    fireEvent.change(title, { target: { value: 'Recap' } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  /**
   * A refused occurrence leaves the content Card unauthored, which is the whole
   * reason both fields are validated before either Edit is made: one press must
   * not half-apply.
   */
  it('completes nothing on the content Card when the occurrence is refused', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        content={markdown()}
        occurrence={{ targets: [], onEdit: () => 'This Card is no longer part of the Space.' }}
        onComplete={onComplete}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onComplete).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  /**
   * There was a reading state in front of this, and it drew the same bytes in
   * the same order — a `<pre>` of source against a `<textarea>` of source. The
   * action that crossed between them was the only thing the boundary had.
   */
  it('is editable on arrival, with no action to begin editing', () => {
    render(
      <OpenCard
        card={markdown({ description: 'Where every graph begins' })}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('A');
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(
      'Where every graph begins',
    );
    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toHaveValue('**A** source');
    expect(screen.queryByRole('button', { name: /^Edit Card/ })).not.toBeInTheDocument();
  });

  it('opens with the title focused, which is what an author names first', () => {
    render(<OpenCard card={markdown()} onComplete={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus();
  });

  /**
   * Retargeting asks for no focus change (ADR 0009's Frame 4), so the pane's
   * ordinary rule holds and the first field is where an open lands.
   *
   * The picker used to declare itself the pane's initial focus wherever it was
   * drawn, which is right for the Alias creation state — that surface opens *on*
   * its Target — and wrong here, where the Target is one field among several.
   * Every open of an existing Alias arrived with the caret in a search box the
   * author had not asked for.
   */
  it('opens an Alias on its own title rather than on the Target picker', () => {
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        content={markdown()}
        occurrence={{ targets: [], onEdit: vi.fn() }}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus();
    expect(screen.getByRole('combobox', { name: 'Target' })).not.toHaveFocus();
  });

  /**
   * Issue `17`, with its assertion the other way up.
   *
   * Choosing a Target used to commit an `edited-card` Edit on the spot: the
   * Space changed, the pane's content owner became the new Target, and the
   * content editor — keyed so that no draft is ever shown under another Card's
   * identity — remounted and reseeded over whatever had been typed into it. The
   * Target now pends to `Done` like every other field (ADR 0048), so the two
   * ids the key is built from cannot move while the pane is open.
   *
   * The fields keep naming the Card they are still authoring, too: a pending
   * Target does not preview.
   */
  it('keeps the content draft when a different Target is chosen', () => {
    const onEdit = vi.fn(() => null);
    const onComplete = vi.fn();
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        content={markdown()}
        occurrence={{
          targets: [
            { id: CARD_ID, title: 'A', kind: 'markdown', body: '**A** source' },
            { id: OTHER_CARD_ID, title: 'B', kind: 'markdown', body: '**B** source' },
          ],
          onEdit,
        }}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source of A' }), {
      target: { value: 'A paragraph nobody asked to lose' },
    });

    fireEvent.click(screen.getByRole('option', { name: 'Markdown Card B' }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Markdown source of A' })).toHaveValue(
      'A paragraph nobody asked to lose',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onEdit).toHaveBeenCalledWith({ title: 'A again', target: OTHER_CARD_ID });
    // Written to the Card the pane was authoring all along, not to the Target
    // the Alias is about to point at.
    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'A',
      kind: 'markdown',
      body: 'A paragraph nobody asked to lose',
    });
  });

  /** Four fields, one press, and one Edit each for the two Cards they author. */
  it('completes the occurrence and the content from one Done', () => {
    const onEdit = vi.fn(() => null);
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        content={markdown()}
        occurrence={{
          targets: [
            { id: CARD_ID, title: 'A', kind: 'markdown', body: '**A** source' },
            { id: OTHER_CARD_ID, title: 'B', kind: 'markdown', body: '**B** source' },
          ],
          onEdit,
        }}
        onComplete={onComplete}
        onCancel={onCancel}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Recap' },
    });
    fireEvent.click(screen.getByRole('option', { name: 'Markdown Card B' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Description of A' }), {
      target: { value: 'A caption' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source of A' }), {
      target: { value: 'New body' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onEdit).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledWith({ title: 'Recap', target: OTHER_CARD_ID });
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'A',
      description: 'A caption',
      kind: 'markdown',
      body: 'New body',
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  /** And Cancel before Done authors neither of them. */
  it('authors neither Card when the pane is cancelled', () => {
    const onEdit = vi.fn(() => null);
    const onComplete = vi.fn();
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        content={markdown()}
        occurrence={{
          targets: [
            { id: CARD_ID, title: 'A', kind: 'markdown', body: '**A** source' },
            { id: OTHER_CARD_ID, title: 'B', kind: 'markdown', body: '**B** source' },
          ],
          onEdit,
        }}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Recap' },
    });
    fireEvent.click(screen.getByRole('option', { name: 'Markdown Card B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  /**
   * The draft is seeded from `content` once and then owned by the editor, so the
   * two must not come apart: handed a different Card, the editor has to be a
   * different editor. Reusing one carried the first Card's text onto the second
   * under the second's id, and completing wrote it there.
   *
   * `App` also declines to open a second Card while one is open, which is the
   * only way this was reachable. Pinned here anyway — the rule is the editor's,
   * and a component that only holds while its caller guards it is one refactor
   * from silently corrupting a Card.
   */
  it('never shows one Card’s draft under another Card’s identity', () => {
    const other = {
      id: uuidSchema.parse('00000000-0000-4000-8000-000000000003'),
      title: 'B',
      kind: 'markdown' as const,
      body: '**B** source',
    };
    const view = render(<OpenCard card={markdown()} onComplete={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), {
      target: { value: 'A rewritten' },
    });

    view.rerender(<OpenCard card={other} onComplete={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('B');
    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toHaveValue('**B** source');
  });

  /**
   * The case the editor is keyed by *both* ids for. Two Aliases of one Card
   * resolve to the same content, so the content's id cannot tell one open from
   * the other, and keying on it alone reuses the first Alias's editor — draft
   * and all — under the second Alias's name. It is the same defect as the test
   * above, arrived at from the other side: there the identity changed and the
   * draft did not, here the content is genuinely shared and only the occurrence
   * differs.
   */
  it('never carries a draft between two Aliases of the same Card', () => {
    const first = { id: ALIAS_ID, title: 'A again', kind: 'alias' as const, target: CARD_ID };
    const second = {
      id: SECOND_ALIAS_ID,
      title: 'A once more',
      kind: 'alias' as const,
      target: CARD_ID,
    };
    const view = render(
      <OpenCard through={first} content={markdown()} onComplete={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source of A' }), {
      target: { value: 'Typed through the first Alias' },
    });

    view.rerender(
      <OpenCard through={second} content={markdown()} onComplete={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByText('Opened through A once more')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Markdown source of A' })).toHaveValue(
      '**A** source',
    );
  });

  it('completes one whole Card from all three fields', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    render(<OpenCard card={markdown()} onComplete={onComplete} onCancel={onCancel} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Renamed A' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: 'A caption' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), {
      target: { value: 'New body' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'Renamed A',
      description: 'A caption',
      kind: 'markdown',
      body: 'New body',
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  /**
   * `min(1)` counts characters and a space is one, so the schema alone accepts a
   * title that draws as nothing — the same reason the graph's inline editor
   * trims. The body is not trimmed: whitespace there is Markdown.
   */
  it('refuses a blank title and keeps it local', () => {
    const onComplete = vi.fn();
    render(<OpenCard card={markdown()} onComplete={onComplete} onCancel={vi.fn()} />);
    const title = screen.getByRole('textbox', { name: 'Title' });

    fireEvent.change(title, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByRole('alert')).toHaveTextContent('A Card title is required.');
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAccessibleDescription('A Card title is required.');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('stores a title and description without the whitespace around them', () => {
    const onComplete = vi.fn();
    render(
      <OpenCard
        card={markdown({ body: ' spaced body ' })}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: '  Renamed A  ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: '  A caption  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'Renamed A',
      description: 'A caption',
      kind: 'markdown',
      body: ' spaced body ',
    });
  });

  it('removes a description the author blanked', () => {
    const onComplete = vi.fn();
    render(
      <OpenCard
        card={markdown({ description: 'Original' })}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'A',
      kind: 'markdown',
      body: '**A** source',
    });
  });

  it('links a description error to its field and completes once it is valid', () => {
    const onComplete = vi.fn();
    render(<OpenCard card={markdown()} onComplete={onComplete} onCancel={vi.fn()} />);
    const description = screen.getByRole('textbox', { name: 'Description' });

    fireEvent.change(description, { target: { value: 'x'.repeat(121) } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(description).toHaveAttribute('aria-invalid', 'true');
    expect(description).toHaveAccessibleDescription(/at most 120/i);
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.change(description, { target: { value: 'Fits' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('cancels without completing', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    render(<OpenCard card={markdown()} onComplete={onComplete} onCancel={onCancel} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), {
      target: { value: 'abandoned' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });

  /**
   * Escape is an alias of Cancel and reaches it through the Dialog rather than
   * through a handler of this component's (ADR 0048). The field it was pressed
   * in is not offered a first press of its own — that gesture exists on the
   * pane, with a label on it.
   */
  it('cancels on Escape from a field holding a draft', () => {
    const onCancel = vi.fn();
    const onComplete = vi.fn();
    render(<OpenCard card={markdown()} onComplete={onComplete} onCancel={onCancel} />);
    const source = screen.getByRole('textbox', { name: 'Markdown source' });

    fireEvent.change(source, { target: { value: 'abandoned' } });
    fireEvent.keyDown(source, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

/**
 * The pane covers the graph and is the one surface for a Card's content (ADR
 * 0037), so it has to say so. It was a bare `<div>`: no role, no name, and
 * nothing stopping `Tab` walking out of it into the Card nodes still behind it —
 * which announce "Press enter or space to open a Card" and, until `App` declined
 * it, did exactly that to the Card being typed into.
 *
 * All of it is `@radix-ui/react-dialog`'s now (ADR 0047), so what is asserted
 * here is the composition rather than the mechanism: the name this pane gives
 * the primitive, and that the defaults it depends on really are switched on.
 */
describe('the opened Card as a dialog', () => {
  /**
   * `aria-modal` is deliberately absent, and this is the assertion that used to
   * insist on it.
   *
   * Radix does not write it. Its modality is `hideOthers` — `aria-hidden` on
   * everything outside the content, asserted below — which is the remedy for
   * `aria-modal`'s own history of being ignored or of hiding content that should
   * still be reachable. Carrying both would be a hand-rolled attribute beside a
   * primitive that has already answered the question (ADR 0047), so the pane
   * takes the primitive's answer and this names the trade rather than reversing
   * it.
   */
  it('is a dialog named for the Card it authors', () => {
    render(<OpenCard card={markdown()} onComplete={vi.fn()} onCancel={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(dialog).toHaveAccessibleName('A');
  });

  /**
   * Named for the Card it authors *and* the occurrence it was opened through,
   * because when those differ neither one alone is the answer to "which dialog
   * is this?". Named only for the content owner, opening `A′` announced a dialog
   * called `A` — a Card the author never asked for and cannot see the name of,
   * on a surface whose one other signal of the delegation is a banner that
   * names nothing to a screen reader.
   */
  it('names the occurrence it was opened through and the Card it authors', () => {
    render(
      <OpenCard
        through={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        content={markdown()}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveAccessibleName('A again — editing content on A');
  });

  /**
   * The wrap `FocusScope`'s `loop` gives it. jsdom implements no sequential
   * navigation, so pressing `Tab` here runs the primitive's handler and moves
   * nothing by itself — a break that left the wraps intact would pass this. The
   * containment proper is `editing.spec`, in a browser that moves focus.
   */
  it('keeps Tab inside itself, wrapping from the last control to the first', () => {
    render(<OpenCard card={markdown()} onComplete={vi.fn()} onCancel={vi.fn()} />);
    const title = screen.getByRole('textbox', { name: 'Title' });
    const done = screen.getByRole('button', { name: 'Done' });

    done.focus();
    fireEvent.keyDown(done, { key: 'Tab' });
    expect(title).toHaveFocus();

    fireEvent.keyDown(title, { key: 'Tab', shiftKey: true });
    expect(done).toHaveFocus();
  });

  /**
   * The graph behind a modal surface is not there, as far as a screen reader is
   * concerned. `hideOthers` is the primitive's, and it is a default this
   * composition depends on rather than an incidental: the hand-rolled pane could
   * not have it, because React Flow measures its nodes and `inert` would have
   * taken them out of the layout.
   */
  it('hides everything behind it from assistive technology', () => {
    const behind = document.createElement('div');
    behind.setAttribute('data-testid', 'behind-the-pane');
    document.body.append(behind);

    render(<OpenCard card={markdown()} onComplete={vi.fn()} onCancel={vi.fn()} />);

    expect(behind).toHaveAttribute('aria-hidden', 'true');
    behind.remove();
  });

  /**
   * Taking focus is the pane's own job; giving it back is not, and this asserts
   * only the half that belongs here.
   *
   * An earlier version restored focus on unmount to whatever was active when it
   * mounted, and a test like this one passed — with a synthetic opener that
   * stays in the document. The real opener does not: opening a Card withdraws
   * every Card affordance, so the control is detached long before the pane
   * closes. `App` returns focus to the Card instead, proven in `editing.spec`
   * against a browser that actually moves it.
   */
  it('takes focus onto its first field when it opens', () => {
    render(<OpenCard card={markdown()} onComplete={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus();
  });
});
