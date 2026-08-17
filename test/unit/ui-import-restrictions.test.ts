import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const lintImport = async (specifier: string, filePath: string): Promise<readonly string[]> => {
  const eslint = new ESLint({ cwd: process.cwd(), overrideConfigFile: 'eslint.config.js' });
  const [result] = await eslint.lintText(`import value from '${specifier}'; void value;`, {
    filePath,
  });
  return (result?.messages ?? [])
    .filter(({ ruleId }) => ruleId === 'no-restricted-imports')
    .map(({ message }) => message);
};

describe('application UI import restrictions', () => {
  it.each([
    '@base-ui/react',
    '@base-ui/react/dialog',
    'cmdk',
    'cmdk/internal',
    'lucide-react',
    'lucide-react/icons',
    '@project/ui/components/button',
    '../../ui/src/components/button',
  ])('rejects %s from app composition', async (specifier) => {
    const messages = await lintImport(specifier, 'packages/app/src/App.tsx');
    expect(messages).toHaveLength(1);
  });

  it('applies the same boundary to the React Flow adapter', async () => {
    const messages = await lintImport(
      'lucide-react',
      'packages/react-flow-adapter/src/CardNode.tsx',
    );
    expect(messages).toHaveLength(1);
  });

  it.each(['@project/ui', '@xyflow/react'])(
    'permits %s at the composition boundary',
    async (specifier) => {
      const messages = await lintImport(specifier, 'packages/app/src/App.tsx');
      expect(messages).toEqual([]);
    },
  );
});
