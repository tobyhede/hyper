import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type Resource } from '@project/core';
import { DeleteResourceConfirmation } from '../src/components/DeleteResourceConfirmation';

const id = (suffix: string) => uuidSchema.parse(`00000000-0000-4000-8000-${suffix}`);

const ask = (resource: Resource) =>
  render(
    <DeleteResourceConfirmation
      resource={resource}
      deleting={false}
      onConfirm={() => undefined}
      onDismiss={() => undefined}
    />,
  );

describe('the question Delete from Space asks', () => {
  it('names the Resource, says what deleting does, and answers with Delete', () => {
    ask({ id: id('000000000001'), title: 'Auth', kind: 'markdown', body: '' });

    const question = screen.getByRole('alertdialog', { name: 'Delete Auth From Space?' });
    expect(question).toHaveTextContent('Permanently deletes the Resource from the Space.');
    expect(within(question).getByRole('button', { name: 'Delete' })).toBeVisible();
    expect(within(question).getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  it('names a Resource whose Title spans several lines by its first line and an ellipsis', () => {
    ask({
      id: id('000000000002'),
      title: 'Resource Title\nThat\nSpans\nLines',
      kind: 'markdown',
      body: '',
    });

    expect(
      screen.getByRole('alertdialog', { name: 'Delete Resource Title… From Space?' }),
    ).toBeVisible();
  });
});
