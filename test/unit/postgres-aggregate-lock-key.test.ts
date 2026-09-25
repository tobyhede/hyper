import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The PostgreSQL store takes the aggregate lock in two modes: exclusive in
 * `lockAggregate`, shared in `lockAggregateShared`. The modes exclude each
 * other only while both name the same advisory key, so a fast path under the
 * shared lock waits for a replacement, deletion or aggregate commit under the
 * exclusive one. Each key is written as a literal in its own statement, and
 * the race tests that would notice them drifting apart run only against
 * PostgreSQL, outside `verify`. This holds them to one key.
 */
const ADVISORY_LOCK = /pg_advisory_xact_lock(_shared)?\((\d+),\s*(\d+)\)/g;

describe('the PostgreSQL aggregate lock key', () => {
  it('is the same key in the exclusive and the shared mode', () => {
    const source = readFileSync('src/prisma/sql-store.ts', 'utf8');
    const locks = [...source.matchAll(ADVISORY_LOCK)].map(([, shared, first, second]) => ({
      mode: shared === undefined ? 'exclusive' : 'shared',
      key: `${first},${second}`,
    }));

    expect(locks.map(({ mode }) => mode).sort()).toEqual(['exclusive', 'shared']);
    expect(new Set(locks.map(({ key }) => key)).size).toBe(1);
  });
});
