import { createPool, migrate } from './database.mjs';

const pool = createPool(process.env.DATABASE_URL);
try {
  await migrate(pool);
  console.log('Database migrations applied; checksums verified.');
} catch (error) {
  console.error(
    error.message.startsWith('Applied migration changed:')
      ? error.message
      : 'Migration failed. Verify database availability, credentials and migration SQL.',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
