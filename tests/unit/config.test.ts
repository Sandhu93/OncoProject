import { expect, it } from 'vitest';
import { readConfig } from '../../apps/api/src/config.js';

it.each(['0', '65536', 'abc', '3.5'])('rejects invalid API port %s', (API_PORT) => {
  expect(() => readConfig({ API_PORT })).toThrow('API_PORT');
});
it('does not accept a non-PostgreSQL database URL', () => {
  expect(() => readConfig({ DATABASE_URL: 'https://example.invalid' })).toThrow('PostgreSQL');
});
