interface ResourceTitle {
  readonly title: string;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

/**
 * Must survive: `unknown` at a genuine parse boundary, narrowed by type
 * predicates rather than by an assertion. This is the shape the assertion rules
 * exist to push code towards, so rejecting it would defeat them.
 */
export const parseResourceTitle = (value: unknown): ResourceTitle => {
  if (!isRecord(value)) throw new Error('a Resource must be an object');
  const title = value['title'];
  if (!isString(title)) throw new Error('a Resource must carry a string title');
  return { title };
};
