// Client-safe. The paths the broker portal's own scripts call, and the cookie
// path they must sit inside.
//
// This exists because they did not, once. The session cookie is deliberately
// Path=/broker (defence in depth — a broker cookie physically cannot be sent
// to a TF route), and the endpoints lived at /api/broker/*, which is NOT
// inside /broker. Browsers honoured that and withheld the cookie, so the
// heartbeat got a 401 every 30 seconds and signed people out mid-session,
// telling them they had signed in on another device.
//
// It survived testing because curl -b "name=value" sends a cookie regardless
// of path, so every check passed. broker-endpoints.test.ts now asserts the
// relationship these constants have to hold.
export const BROKER_COOKIE_PATH = "/broker";

export const BROKER_SESSION_ENDPOINT = "/broker/api/session";
export const BROKER_SECURITY_EVENT_ENDPOINT = "/broker/api/security-event";

export const BROKER_CLIENT_ENDPOINTS = [
  BROKER_SESSION_ENDPOINT,
  BROKER_SECURITY_EVENT_ENDPOINT,
] as const;

// A cookie with Path=P is sent to P and anything beneath it, and nowhere else.
export function withinCookiePath(path: string, cookiePath = BROKER_COOKIE_PATH): boolean {
  return path === cookiePath || path.startsWith(cookiePath + "/");
}
