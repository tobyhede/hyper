import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const COMPONENTS_DIRECTORY = new URL('../../packages/ui/src/components/', import.meta.url);

const componentFiles = readdirSync(COMPONENTS_DIRECTORY, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
  .map((entry) => new URL(entry.name, COMPONENTS_DIRECTORY));

const BARE_REACT_IMPORT = /^import \* as React from 'react';/m;

// The value members a component could legitimately need `React` for at
// runtime. A file importing `React` as a value but calling none of these only
// reaches it for a type position (`React.ComponentProps<...>`) and should
// import `type * as React` instead, per `verbatimModuleSyntax`.
const REACT_VALUE_USAGE =
  /React\.(forwardRef|createElement|useState|useEffect|useLayoutEffect|useRef|useMemo|useCallback|useContext|useReducer|useId|useImperativeHandle|Children|cloneElement|isValidElement|createContext|memo|lazy|Suspense|Fragment|StrictMode)\b/;

describe('React namespace imports in packages/ui/src/components', () => {
  it('are type-only unless the file uses React as a value', () => {
    const valueImportsWithNoValueUsage = componentFiles
      .map((file) => ({ file, text: readFileSync(file, 'utf8') }))
      .filter(({ text }) => BARE_REACT_IMPORT.test(text) && !REACT_VALUE_USAGE.test(text))
      .map(({ file }) => file.pathname);

    expect(valueImportsWithNoValueUsage).toEqual([]);
  });
});
