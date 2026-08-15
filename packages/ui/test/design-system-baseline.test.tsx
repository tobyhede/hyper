import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
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
          <CardContent>Contents</CardContent>
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
        <Separator />
        <Spinner aria-label="Loading" />
      </>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not save the Space');
    expect(screen.getByText('Space')).toBeVisible();
    expect(screen.getByText('No Spaces')).toBeVisible();
    expect(screen.getByLabelText('Title')).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText('Markdown')).toBeInstanceOf(HTMLTextAreaElement);
    expect(screen.getByLabelText('Loading')).toBeVisible();
  });
});
