export const AUTH_LOGIN: string = '/auth/login';
/** Revokes the session on the API at logout (the token stops working at once). */
export const AUTH_LOGOUT: string | null = '/auth/logout';
/**
 * The OncoTrack API issues one opaque session token and no refresh token: a session lasts
 * `SESSION_TTL_HOURS` (default 12) and the user then logs in again. `null` turns token refresh off.
 */
export const AUTH_REFRESH: string | null = null;
/** Only used when `AUTH_REFRESH` is set. */
export const AUTH_REFRESH_TOKEN_IN: 'body' | 'bearer' = 'body';
