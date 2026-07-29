import { act, within } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { startApplication } from '../src/startup';

it('renders complete startup failure details instead of leaving an empty root', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () => {
      await startApplication(root, () =>
        Promise.reject(
          new Error(
            'The bundled space failed to import:\n  - version: Invalid literal value, expected 2',
          ),
        ),
      );
    });

    const alert = within(container).getByRole('alert');
    expect(
      within(alert).getByRole('heading', { name: 'Application could not start' }),
    ).toBeVisible();
    expect(alert).toHaveTextContent('The space could not be opened.');
    expect(alert).toHaveTextContent(
      'The bundled space failed to import: - version: Invalid literal value, expected 2',
    );
    expect(container.querySelector('.react-flow')).not.toBeInTheDocument();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
