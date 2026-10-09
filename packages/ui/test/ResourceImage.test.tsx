import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResourceImage } from '../src/ResourceImage';

const URL = 'https://example.com/harbour.png';

const loading = () => screen.queryByRole('status', { name: 'Loading image' });

describe('ResourceImage', () => {
  it('draws a skeleton in the picture’s place until the picture loads', () => {
    render(<ResourceImage url={URL} name="Harbour" />);
    expect(loading()).toBeInTheDocument();

    fireEvent.load(screen.getByRole('img', { name: 'Harbour' }));

    expect(loading()).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Harbour' })).toBeVisible();
  });

  it('replaces the skeleton with the failed-image state when the picture does not load', () => {
    render(<ResourceImage url={URL} name="Harbour" />);

    fireEvent.error(screen.getByRole('img', { name: 'Harbour' }));

    expect(loading()).not.toBeInTheDocument();
    expect(screen.getByText('Image did not load')).toBeInTheDocument();
  });

  it('draws no skeleton for a picture the browser already has', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(400);

    render(<ResourceImage url={URL} name="Harbour" />);

    expect(loading()).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Harbour' })).toBeVisible();
  });

  it('leaves a complete picture with no width to its load or error event', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0);

    render(<ResourceImage url={URL} name="Harbour" />);
    expect(loading()).toBeInTheDocument();

    fireEvent.error(screen.getByRole('img', { name: 'Harbour' }));
    expect(screen.getByText('Image did not load')).toBeInTheDocument();
  });
});
