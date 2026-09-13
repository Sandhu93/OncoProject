import { readFile } from 'node:fs/promises';
import { createPool } from './database.mjs';

const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid');
if (process.env.NODE_ENV !== 'development' || !url.pathname.endsWith('_dev')) {
  throw new Error(
    'Development seed requires NODE_ENV=development and a database name ending in _dev.',
  );
}
const pool = createPool(process.env.DATABASE_URL);
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(
    await readFile(new URL('../database/seeds/development.sql', import.meta.url), 'utf8'),
  );
  await client.query('COMMIT');
  console.log('Draft development workflow seeded. No patient data or staff credentials created.');
} catch {
  await client.query('ROLLBACK');
  console.error(
    'Seed failed. Ensure migrations are applied and the development fixture remains draft.',
  );
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
