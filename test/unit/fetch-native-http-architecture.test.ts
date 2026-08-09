import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryFile = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

describe('Fetch-native HTTP architecture', () => {
  it('has no superseded raw Node graph module', () => {
    expect(repositoryFile('../../src/http/space-http-handler.ts')).not.toSatisfy(existsSync);
  });
});
