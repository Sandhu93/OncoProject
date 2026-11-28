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
  // Directory (LDAP) sign-in is off unless DIRECTORY_URL is set. The password is checked by binding as the person, so
  // no service account is needed. DIRECTORY_BIND_DN is the person's DN with {username} where their login name goes
  // (for example "uid={username},ou=staff,dc=hospital,dc=local" or "{username}@hospital.local").
  const directoryUrl = env.DIRECTORY_URL?.trim();
  let directory:
    | {
        url: string;
        bindDn: string;
        startTls: boolean;
        caFile: string | undefined;
        timeoutMs: number;
      }
    | undefined;
  if (directoryUrl) {
    const url = new URL(directoryUrl);
    if (!['ldap:', 'ldaps:'].includes(url.protocol)) {
      throw new Error(
        'DIRECTORY_URL must start with ldaps:// (or ldap:// with DIRECTORY_START_TLS=true).',
      );
    }
    const startTls = env.DIRECTORY_START_TLS === 'true';
    if (url.protocol === 'ldap:' && !startTls) {
      // A password must never cross the network unencrypted.
      throw new Error(
        'DIRECTORY_URL uses ldap://, which needs DIRECTORY_START_TLS=true. Prefer ldaps://.',
      );
    }
    const bindDn = env.DIRECTORY_BIND_DN?.trim() ?? '';
    if (!bindDn.includes('{username}')) {
      throw new Error('DIRECTORY_BIND_DN must contain {username}.');
    }
    const timeoutMs = Number(env.DIRECTORY_TIMEOUT_MS ?? 5000);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 60000) {
      throw new Error('DIRECTORY_TIMEOUT_MS must be an integer between 500 and 60000.');
    }
    directory = {
      url: directoryUrl,
      bindDn,
      startTls,
      caFile: env.DIRECTORY_CA_FILE?.trim() || undefined,
      timeoutMs,
    };
  }
  return {
    port,
    directory,
    host: env.API_HOST ?? '127.0.0.1',
    databaseUrl: env.DATABASE_URL,
    sessionTtlHours,
    stallDays,
    sweepMinutes,
  };
}
