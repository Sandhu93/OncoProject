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
  // D-07 (when a chart counts as stalled) is still to be confirmed with the consultant; the prototype used 3.
  const stallDays = Number(env.STALL_DAYS ?? 3);
  if (!Number.isInteger(stallDays) || stallDays < 1 || stallDays > 60) {
    throw new Error('STALL_DAYS must be an integer between 1 and 60.');
  }
  // How often reminders (stalled charts, Saturday updates) are created; 0 switches the timer off.
  const sweepMinutes = Number(env.NOTIFICATION_SWEEP_MINUTES ?? 15);
  if (!Number.isInteger(sweepMinutes) || sweepMinutes < 0 || sweepMinutes > 1440) {
    throw new Error('NOTIFICATION_SWEEP_MINUTES must be an integer between 0 and 1440.');
  }
  return {
    port,
    host: env.API_HOST ?? '127.0.0.1',
    databaseUrl: env.DATABASE_URL,
    sessionTtlHours,
    stallDays,
    sweepMinutes,
  };
}
