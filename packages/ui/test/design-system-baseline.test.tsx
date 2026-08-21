import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardSection,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Kbd,
  KbdGroup,
  Separator,
  Spinner,
  Textarea,
} from '../src';

describe('design-system baseline', () => {
  it('offers the shared composition primitives through the package surface', () => {
    render(
      <>
        <Alert>
          <AlertTitle>Could not save the Space</AlertTitle>
          <AlertDescription>Try again after correcting the conflict.</AlertDescription>
        </Alert>
        <Card>
          <CardHeader>
            <CardTitle>Space</CardTitle>
            <CardDescription>One authored canvas.</CardDescription>
          </CardHeader>
          <CardSection>Contents</CardSection>
        </Card>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No Spaces</EmptyTitle>
            <EmptyDescription>Create a Space to begin.</EmptyDescription>
          </EmptyHeader>
        </Empty>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="title">Title</FieldLabel>
            <Input id="title" />
          </Field>
          <Field>
            <FieldLabel htmlFor="body">Markdown</FieldLabel>
            <Textarea id="body" />
          </Field>
        </FieldGroup>
        <KbdGroup aria-label="Traversal keys">
          <Kbd>→</Kbd>
          <Kbd>Esc</Kbd>
        </KbdGroup>
        <Separator />
        <Spinner aria-label="Loading" />
      </>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not save the Space');
    expect(screen.getByText('Space')).toBeVisible();
    expect(screen.getByText('No Spaces')).toBeVisible();
    expect(screen.getByText('Create a Space to begin.').tagName).toBe('P');
    expect(screen.getByLabelText('Title')).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText('Markdown')).toBeInstanceOf(HTMLTextAreaElement);
    expect(screen.getByLabelText('Loading')).toBeVisible();
    // Both render `kbd`, so the group's props are a `kbd`'s. Typed as a `div`'s
    // it typechecked and handed a caller an `HTMLDivElement` that is not one.
    const keys = screen.getByLabelText('Traversal keys');
    expect(keys.tagName).toBe('KBD');
    expect(within(keys).getByText('→').tagName).toBe('KBD');
  });
});
