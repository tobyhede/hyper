import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GitHubLocationForm } from '../src/components/GitHubLocationForm';

/** The form with every navigation it asks for recorded. */
function ask(
  failure?: Parameters<typeof GitHubLocationForm>[0]['failure'],
  href = 'https://hyper.test/',
) {
  const navigated: string[] = [];
  render(
    <GitHubLocationForm
      navigate={(url) => navigated.push(url)}
      href={() => href}
      failure={failure ?? null}
    />,
  );
  const field = screen.getByRole('textbox', { name: 'GitHub location' });
  const submit = (value: string): void => {
    fireEvent.change(field, { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  };
  return { navigated, field, submit };
}

describe('asking for a GitHub location', () => {
  it('opens a valid location by its source parameter', () => {
    const { navigated, submit } = ask();

    submit('github:tobyhede/talk@main/slides');

    expect(navigated).toEqual(['?source=github:tobyhede/talk@main/slides']);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('opens the location with the page’s other query parameters', () => {
    const { navigated, submit } = ask(undefined, 'https://hyper.test/?utm=feed&source=bad#x');

    submit('github:tobyhede/talk');

    expect(navigated).toEqual(['?utm=feed&source=github:tobyhede/talk']);
  });

  it('says why an invalid location cannot be opened, and opens nothing', () => {
    const { navigated, field, submit } = ask();

    submit('tobyhede/talk');

    expect(navigated).toEqual([]);
    expect(screen.getByRole('alert')).toHaveTextContent('a GitHub location begins with github:');
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('clears the reason once a corrected location is opened', () => {
    const { navigated, submit } = ask();
    submit('github:tobyhede');

    submit('github:tobyhede/talk');

    expect(navigated).toEqual(['?source=github:tobyhede/talk']);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('withdraws the reason once the location is edited', () => {
    const { field, submit } = ask();
    submit('tobyhede/talk');

    fireEvent.change(field, { target: { value: 'github:tobyhede/talk' } });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(field).toHaveAttribute('aria-invalid', 'false');
  });

  it('shows the location the address gave, and why it could not be read', () => {
    const { field } = ask({
      kind: 'malformed-location',
      input: 'github:tobyhede',
      reason: 'a GitHub location names owner/repo',
    });

    expect(field).toHaveValue('github:tobyhede');
    expect(screen.getByRole('alert')).toHaveTextContent('a GitHub location names owner/repo');
  });
});
