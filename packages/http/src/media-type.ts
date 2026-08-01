/**
 * RFC 9110 media-type validation, kept whole and away from the route tree.
 *
 * This is not a duplicate of the `content-type` dependency. `content-type@2`
 * validates nothing — `parse` has no throw path at all and answers
 * `parse('garbage')` with `{ type: 'garbage' }` — so this scanner is the whole
 * of the package's media validation, and `parse` only splits and lowercases a
 * value this module has already accepted. Against `content-type@1`, which threw
 * on malformed parameters, it would have been near-redundant.
 *
 * Hono's own json validator applies a narrower regex than RFC 9110 allows, and
 * on disagreement it does not parse the body and reports nothing. That is why
 * the caller rewrites the header this scanner accepts to canonical
 * `application/json` rather than leaving two media policies in force.
 */

const isOptionalWhitespace = (character: string): boolean =>
  character === ' ' || character === '\t';

const isTokenCharacter = (character: string): boolean =>
  /^[!#$%&'*+.^_`|~0-9A-Za-z-]$/.test(character);

export const hasValidUniqueMediaTypeParameters = (value: string): boolean => {
  let index = 0;
  const skipWhitespace = (): void => {
    while (index < value.length && isOptionalWhitespace(value.charAt(index))) {
      index += 1;
    }
  };
  const readToken = (): string => {
    const start = index;
    while (index < value.length && isTokenCharacter(value.charAt(index))) {
      index += 1;
    }
    return value.slice(start, index);
  };

  skipWhitespace();
  if (readToken() === '' || value[index] !== '/') {
    return false;
  }
  index += 1;
  if (readToken() === '') {
    return false;
  }
  skipWhitespace();

  const parameterNames = new Set<string>();
  while (index < value.length) {
    if (value[index] !== ';') {
      return false;
    }
    index += 1;
    skipWhitespace();
    const parameterName = readToken().toLowerCase();
    if (parameterName === '' || parameterNames.has(parameterName)) {
      return false;
    }
    parameterNames.add(parameterName);
    skipWhitespace();
    if (value[index] !== '=') {
      return false;
    }
    index += 1;
    skipWhitespace();

    if (value[index] === '"') {
      index += 1;
      let closed = false;
      while (index < value.length) {
        const code = value.charCodeAt(index);
        if (code === 34) {
          index += 1;
          closed = true;
          break;
        }
        if (code === 92) {
          index += 1;
          if (index >= value.length) {
            return false;
          }
          const escapedCode = value.charCodeAt(index);
          if (
            escapedCode !== 9 &&
            (escapedCode < 32 || (escapedCode > 126 && escapedCode < 128) || escapedCode > 255)
          ) {
            return false;
          }
          index += 1;
          continue;
        }
        const isQuotedText =
          code === 9 ||
          code === 32 ||
          code === 33 ||
          (code >= 35 && code <= 91) ||
          (code >= 93 && code <= 126) ||
          (code >= 128 && code <= 255);
        if (!isQuotedText) {
          return false;
        }
        index += 1;
      }
      if (!closed) {
        return false;
      }
    } else if (readToken() === '') {
      return false;
    }
    skipWhitespace();
  }
  return true;
};
