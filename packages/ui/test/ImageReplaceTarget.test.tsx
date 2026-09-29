import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageReplaceTarget, type ImageReplaceEditor } from '../src';
import {
  ResourceContentEditProvider,
  type ResourceContentEdit,
} from '../src/resource-content-edit';

const editor = (overrides: Partial<ImageReplaceEditor> = {}): ImageReplaceEditor => ({
  accept: 'image/png',
  onReplace: vi.fn(() => Promise.resolve(null)),
  onEnd: vi.fn(),
  ...overrides,
});

describe('ImageReplaceTarget', () => {
  it('passes the whole drop to the application instead of choosing a file', async () => {
    const replace = editor({
      onReplace: vi.fn(() => Promise.resolve('Use one image at a time.')),
    });
    render(<ImageReplaceTarget name="Figure" editor={replace} />);
    const files = [
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.png', { type: 'image/png' }),
    ];
    fireEvent.drop(screen.getByRole('group', { name: 'Replace image of Figure' }), {
      dataTransfer: { files },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Use one image at a time.');
    expect(replace.onReplace).toHaveBeenCalledWith({ kind: 'files', files });
    expect(replace.onEnd).not.toHaveBeenCalled();
  });
  it('draws the upload target: a title, an Upload button and a URL field', () => {
    render(<ImageReplaceTarget name="Figure" editor={editor()} />);

    expect(screen.getByRole('group', { name: 'Replace image of Figure' })).toBeVisible();
    expect(screen.getByText('Replace image')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Image URL' })).toBeVisible();
  });

  it('replaces with an entered URL and ends once the replacement is over', async () => {
    const replace = editor();
    render(<ImageReplaceTarget name="Figure" editor={replace} />);

    const field = screen.getByRole('textbox', { name: 'Image URL' });
    fireEvent.change(field, { target: { value: 'https://example.com/new.png' } });
    fireEvent.submit(field);

    expect(replace.onReplace).toHaveBeenCalledWith({
      kind: 'url',
      url: 'https://example.com/new.png',
    });
    await waitFor(() => expect(replace.onEnd).toHaveBeenCalledTimes(1));
  });

  it('shows a refusal in the target and stays up', async () => {
    const replace = editor({
      onReplace: vi.fn(() => Promise.resolve('An image URL must start with https: or http:.')),
    });
    render(<ImageReplaceTarget name="Figure" editor={replace} />);

    const field = screen.getByRole('textbox', { name: 'Image URL' });
    fireEvent.change(field, { target: { value: 'data:image/png;base64,AAAA' } });
    fireEvent.submit(field);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An image URL must start with https: or http:.',
    );
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(replace.onEnd).not.toHaveBeenCalled();
  });

  it('opens the file picker from Upload and replaces with the file chosen', async () => {
    const replace = editor();
    render(<ImageReplaceTarget name="Figure" editor={replace} />);
    const picker = screen.getByTestId('replace-image-file');
    const opened = vi.spyOn(picker, 'click');

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(opened).toHaveBeenCalledTimes(1);

    const chosen = new File(['bytes'], 'diagram.png', { type: 'image/png' });
    fireEvent.change(picker, { target: { files: [chosen] } });
    expect(replace.onReplace).toHaveBeenCalledWith({ kind: 'files', files: [chosen] });
    await waitFor(() => expect(replace.onEnd).toHaveBeenCalledTimes(1));
  });

  it('takes a file dropped anywhere on it, and the drop goes no further', async () => {
    const replace = editor();
    const canvasDrop = vi.fn();
    render(
      <div onDrop={canvasDrop} onDragOver={canvasDrop}>
        <ImageReplaceTarget name="Figure" editor={replace} />
      </div>,
    );
    const target = screen.getByRole('group', { name: 'Replace image of Figure' });
    const dropped = new File(['bytes'], 'diagram.png', { type: 'image/png' });

    // A drop is only delivered where `dragover` was refused its default.
    expect(fireEvent.dragOver(target, { dataTransfer: { files: [dropped] } })).toBe(false);
    fireEvent.drop(target, { dataTransfer: { files: [dropped] } });

    expect(replace.onReplace).toHaveBeenCalledWith({ kind: 'files', files: [dropped] });
    expect(canvasDrop).not.toHaveBeenCalled();
    await waitFor(() => expect(replace.onEnd).toHaveBeenCalledTimes(1));
  });

  it('ends on Escape without replacing anything', () => {
    const replace = editor();
    render(<ImageReplaceTarget name="Figure" editor={replace} />);

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Image URL' }), { key: 'Escape' });

    expect(replace.onEnd).toHaveBeenCalledTimes(1);
    expect(replace.onReplace).not.toHaveBeenCalled();
  });

  it('offers the surrounding Resource Cancel, and no Save', () => {
    const replace = editor();
    const published: (ResourceContentEdit | null)[] = [];
    const { unmount } = render(
      <ResourceContentEditProvider value={(edit) => published.push(edit)}>
        <ImageReplaceTarget name="Figure" editor={replace} />
      </ResourceContentEditProvider>,
    );

    const edit = published.at(-1);
    expect(edit?.onSave).toBeUndefined();
    edit?.onCancel();
    expect(replace.onEnd).toHaveBeenCalledTimes(1);
    expect(replace.onReplace).not.toHaveBeenCalled();

    unmount();
    expect(published.at(-1)).toBeNull();
  });

  it('cannot be dismissed while a replacement is busy, so its answer is shown', async () => {
    let answer: (refusal: string | null) => void = () => undefined;
    const replace = editor({
      onReplace: vi.fn(
        () =>
          new Promise<string | null>((resolve) => {
            answer = resolve;
          }),
      ),
    });
    const published: (ResourceContentEdit | null)[] = [];
    render(
      <ResourceContentEditProvider value={(edit) => published.push(edit)}>
        <ImageReplaceTarget name="Figure" editor={replace} />
      </ResourceContentEditProvider>,
    );
    const field = screen.getByRole('textbox', { name: 'Image URL' });
    fireEvent.change(field, { target: { value: 'https://example.com/new.png' } });
    fireEvent.submit(field);

    expect(published.at(-1)?.busy).toBe(true);
    expect(screen.getByRole('group', { name: 'Replace image of Figure' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    // Withheld but still focusable, so the caret is not dropped while the answer is awaited.
    expect(screen.getByRole('button', { name: 'Upload' })).toHaveAttribute('aria-disabled', 'true');
    expect(field).toHaveAttribute('aria-disabled', 'true');
    expect(field).toHaveAttribute('readonly');
    fireEvent.submit(field);
    const dataTransfer = {
      files: [new File(['bytes'], 'other.png', { type: 'image/png' })],
      dropEffect: 'copy',
    };
    const target = screen.getByRole('group', { name: 'Replace image of Figure' });
    fireEvent.dragOver(target, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('none');
    fireEvent.drop(target, { dataTransfer });
    expect(replace.onReplace).toHaveBeenCalledTimes(1);
    published.at(-1)?.onCancel();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(replace.onEnd).not.toHaveBeenCalled();

    answer('The image could not be stored.');
    expect(await screen.findByRole('alert')).toHaveTextContent('The image could not be stored.');
    expect(published.at(-1)?.busy).toBeFalsy();
    expect(screen.getByRole('button', { name: 'Upload' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(field).not.toHaveAttribute('aria-disabled', 'true');
    expect(field).not.toHaveAttribute('readonly');
  });

  it('takes the caret on Upload when it appears', () => {
    render(<ImageReplaceTarget name="Figure" editor={editor()} />);

    expect(screen.getByRole('button', { name: 'Upload' })).toHaveFocus();
  });

  it('ends nothing when its answer arrives after the target has gone', async () => {
    let answer: (refusal: string | null) => void = () => undefined;
    const replace = editor({
      onReplace: vi.fn(
        () =>
          new Promise<string | null>((resolve) => {
            answer = resolve;
          }),
      ),
    });
    const { unmount } = render(<ImageReplaceTarget name="Figure" editor={replace} />);
    const field = screen.getByRole('textbox', { name: 'Image URL' });
    fireEvent.change(field, { target: { value: 'https://example.com/new.png' } });
    fireEvent.submit(field);

    unmount();
    await act(async () => {
      answer(null);
      await Promise.resolve();
    });

    expect(replace.onEnd).not.toHaveBeenCalled();
  });
});
