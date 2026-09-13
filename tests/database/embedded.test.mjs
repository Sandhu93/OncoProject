import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { registerSchemaTests } from './suite.mjs';

// Executes PostgreSQL SQL locally without Docker. This does not validate network or multi-session contention.
registerSchemaTests('Embedded PostgreSQL schema smoke tests', async () => {
  const database = new PGlite({ extensions: { btree_gist } });
  await database.waitReady;
  const query = async (sql, params) => {
    const result = params ? await database.query(sql, params) : (await database.exec(sql)).at(-1);
    return {
      rows: result?.rows ?? [],
      rowCount: result?.rows?.length || result?.affectedRows || 0,
    };
  };
  return { query, connect: async () => ({ query, release() {} }), end: () => database.close() };
});
