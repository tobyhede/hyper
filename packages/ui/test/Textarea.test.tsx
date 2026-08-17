import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Textarea } from '../src/components/textarea';

describe('Textarea', () => {
  it('forwards its ref and composes caller classes', () => {
    const ref = createRef<HTMLTextAreaElement>();

    render(<Textarea ref={ref} aria-label="Markdown" className="editor-textarea" />);

    const textarea = screen.getByRole('textbox', { name: 'Markdown' });
    expect(textarea).toHaveAttribute('data-slot', 'textarea');
    expect(textarea).toHaveClass('editor-textarea');
    expect(ref.current).toBe(textarea);
  });
});
