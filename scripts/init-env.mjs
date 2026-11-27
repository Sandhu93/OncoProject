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

// The web app reads its own settings: it calls the API from its server, never from the browser.
const webEnv = `API_URL=http://127.0.0.1:3000/api/v1
NEXT_PUBLIC_APP_NAME=OncoTrack
NEXT_PUBLIC_APP_URL=http://localhost:5173
`;
try {
  await writeFile(new URL('../apps/web/.env.local', import.meta.url), webEnv, {
    flag: 'wx',
    mode: 0o600,
  });
  console.log('Created apps/web/.env.local pointing at the local API.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('apps/web/.env.local already exists; no values changed.');
}
