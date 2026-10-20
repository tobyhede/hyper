import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { inlineScriptSources, mountHeaders, mountHeaderRules } from '../mount-headers';

const policyOf = (headers: string): Map<string, string> => {
  const line = headers.split('\n').find((row) => row.trim().startsWith('Content-Security-Policy:'));
  if (line === undefined) throw new Error('The headers carry no Content-Security-Policy.');
  const policy = line.trim().slice('Content-Security-Policy:'.length).trim();
  return new Map(
    policy.split(';').map((directive) => {
      const [name = '', ...sources] = directive.trim().split(/\s+/);
      return [name, sources.join(' ')];
    }),
  );
};

const sha256 = (source: string): string =>
  `'sha256-${createHash('sha256').update(source).digest('base64')}'`;

describe('the static build’s headers', () => {
  it('reaches GitHub, and only GitHub, beyond its own origin', () => {
    const policy = policyOf(mountHeaders([]));

    expect(policy.get('default-src')).toBe("'self'");
    expect(policy.get('connect-src')).toBe(
      "'self' https://api.github.com https://raw.githubusercontent.com",
    );
    expect(policy.get('object-src')).toBe("'none'");
    expect(policy.get('frame-ancestors')).toBe("'none'");
  });

  it('draws a mounted picture from an object URL, and an authored one from anywhere', () => {
    expect(policyOf(mountHeaders([])).get('img-src')).toBe("'self' blob: data: https:");
  });

  it('runs its own scripts and the inline scripts of its page, by hash', () => {
    const source = "addEventListener('error', () => undefined);";

    expect(policyOf(mountHeaders([source])).get('script-src')).toBe(`'self' ${sha256(source)}`);
  });

  it('reads the inline scripts of a page, and not those it loads by URL', () => {
    const html = `<head><script type="module" src="/assets/index-abc.js"></script></head>
<body><script>
  first();
</script><script type="module">second();</script></body>`;

    expect(inlineScriptSources(html)).toEqual(['\n  first();\n', 'second();']);
  });

  it('keeps hashed assets for a year and sends nosniff everywhere', () => {
    const rules = mountHeaderRules([]);

    expect(rules.find(({ path }) => path === '/assets/*')?.headers).toEqual({
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    expect(rules.find(({ path }) => path === '/*')?.headers['X-Content-Type-Options']).toBe(
      'nosniff',
    );
  });
});
