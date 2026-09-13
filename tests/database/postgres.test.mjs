import { createPool } from '../../scripts/database.mjs';
import { registerSchemaTests } from './suite.mjs';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString || !new URL(connectionString).pathname.endsWith('_test')) {
  throw new Error(
    'Set TEST_DATABASE_URL to a dedicated database ending in _test. This suite never falls back to DATABASE_URL.',
  );
}
registerSchemaTests('PostgreSQL schema integration', () => createPool(connectionString));
