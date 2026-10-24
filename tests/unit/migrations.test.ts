import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REQUIRED_MIGRATIONS } from '../../apps/api/src/database/database.service.js';

describe('MIG-001 readiness migration list', () => {
  it('names every migration file so readiness cannot pass on a partly migrated database', () => {
    const files = readdirSync(new URL('../../database/migrations/', import.meta.url))
      .filter((name) => /^\d+_.+\.sql$/.test(name))
      .sort();
    expect([...REQUIRED_MIGRATIONS]).toEqual(files);
  });
});
