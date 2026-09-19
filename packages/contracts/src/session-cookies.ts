/** Shared session cookie names — keep middleware, client, and API aligned. */

export const API_SESSION_COOKIE = "dang_session";
export const WEB_SESSION_COOKIE = "dang_web_session";
/** Only this value counts as an authenticated web flag (client UX hint; not middleware gate). */
export const WEB_SESSION_COOKIE_VALUE = "1";

/** Double-submit CSRF cookie (readable by JS; paired with X-CSRF-Token header). */
export const CSRF_COOKIE = "dang_csrf";
export const CSRF_HEADER = "x-csrf-token";

/**
 * Short-lived step-up reauth cookie (HttpOnly). Issued after password confirm;
 * required for export, account delete confirmation path, and vault admin ops.
 */
export const REAUTH_COOKIE = "dang_reauth";
export const REAUTH_TTL_MS = 5 * 60 * 1000;
