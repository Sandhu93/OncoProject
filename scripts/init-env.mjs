import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const password = randomBytes(24).toString('hex');
const contents = `NODE_ENV=development
API_HOST=127.0.0.1
API_PORT=3000
POSTGRES_USER=oncotrack_dev
POSTGRES_PASSWORD=${password}
POSTGRES_DB=oncotrack_dev
DATABASE_URL=postgresql://oncotrack_dev:${password}@127.0.0.1:5432/oncotrack_dev
TEST_DATABASE_URL=postgresql://oncotrack_dev:${password}@127.0.0.1:5433/oncotrack_test
`;
try {
  await writeFile(new URL('../.env', import.meta.url), contents, { flag: 'wx', mode: 0o600 });
  console.log('Created .env with random development database credentials. Keep this file private.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env already exists; no values changed.');
}
