/** Shared session cookie names — keep middleware, client, and API aligned. */

export const API_SESSION_COOKIE = "dang_session";
export const WEB_SESSION_COOKIE = "dang_web_session";
/** Only this value counts as an authenticated web flag (middleware + SessionGate). */
export const WEB_SESSION_COOKIE_VALUE = "1";
