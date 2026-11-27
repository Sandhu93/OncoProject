export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.API_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT must be an integer between 1 and 65535.');
  }
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      throw new Error('DATABASE_URL must use PostgreSQL.');
    }
  }
  const sessionTtlHours = Number(env.SESSION_TTL_HOURS ?? 12);
  if (!Number.isInteger(sessionTtlHours) || sessionTtlHours < 1 || sessionTtlHours > 72) {
    throw new Error('SESSION_TTL_HOURS must be an integer between 1 and 72.');
  }
  return {
    port,
    host: env.API_HOST ?? '127.0.0.1',
    databaseUrl: env.DATABASE_URL,
    sessionTtlHours,
  };
}
