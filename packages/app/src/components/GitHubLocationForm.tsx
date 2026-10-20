import { useId, useState, type FormEvent } from 'react';
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
} from '@project/ui';
import { parseGitHubLocation, type MalformedGitHubLocation } from '../mount/github-location';
import { withSource } from '../source-parameter';

export interface GitHubLocationFormProps {
  /**
   * Go to a URL relative to the page, as `window.location.assign` does. The
   * form asks for `?source=…`, which keeps the page's path.
   */
  readonly navigate: (url: string) => void;
  /** Why the location the page was given could not be read, or `null` when it was given none. */
  readonly failure: MalformedGitHubLocation | null;
}

/**
 * Asks for the GitHub location a mounted page reads when it has neither a
 * `source` parameter nor a build-time default (ADR 0130).
 *
 * The location is read by `parseGitHubLocation`, the one parser of the syntax,
 * and a location it refuses is answered with its reason beside the field
 * rather than navigated to.
 */
export function GitHubLocationForm({ navigate, failure }: GitHubLocationFormProps) {
  const [value, setValue] = useState(failure?.input ?? '');
  const [reason, setReason] = useState(failure?.reason ?? null);
  const inputId = useId();
  const descriptionId = useId();
  const errorId = useId();

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const location = value.trim();
    const parsed = parseGitHubLocation(location);
    if (!parsed.ok) {
      setReason(parsed.failure.reason);
      return;
    }
    setReason(null);
    navigate(withSource('', location));
  };

  return (
    <form className="mx-auto w-full max-w-lg p-4" noValidate onSubmit={submit}>
      <FieldGroup>
        <Field data-invalid={reason !== null}>
          <FieldLabel htmlFor={inputId}>GitHub location</FieldLabel>
          <Input
            id={inputId}
            name="source"
            value={value}
            placeholder="github:owner/repo@ref/path"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={reason !== null}
            aria-describedby={reason === null ? descriptionId : `${descriptionId} ${errorId}`}
            onChange={(event) => setValue(event.target.value)}
          />
          <FieldDescription id={descriptionId}>
            A public repository holding an Aggregate directory. The ref and path are optional.
          </FieldDescription>
          {reason === null ? null : <FieldError id={errorId}>{reason}</FieldError>}
        </Field>
        <Field orientation="horizontal">
          <Button type="submit">Open</Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
