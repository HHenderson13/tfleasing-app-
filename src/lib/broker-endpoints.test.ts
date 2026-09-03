import { describe, it, expect } from "vitest";
import {
  BROKER_CLIENT_ENDPOINTS, BROKER_COOKIE_PATH, BROKER_SECURITY_EVENT_ENDPOINT,
  BROKER_SESSION_ENDPOINT, withinCookiePath,
} from "./broker-endpoints";

describe("withinCookiePath", () => {
  it("knows what a Path-scoped cookie is actually sent to", () => {
    expect(withinCookiePath("/broker")).toBe(true);
    expect(withinCookiePath("/broker/stock")).toBe(true);
    expect(withinCookiePath("/broker/api/session")).toBe(true);
    // The shape that caused the bug: same words, wrong order.
    expect(withinCookiePath("/api/broker/session")).toBe(false);
    expect(withinCookiePath("/api/broker/security-event")).toBe(false);
    // A prefix match on the string alone is not enough.
    expect(withinCookiePath("/brokerage")).toBe(false);
    expect(withinCookiePath("/")).toBe(false);
  });
});

describe("broker client endpoints", () => {
  // The regression this file exists for. The portal's scripts call these with
  // the browser's cookie jar; anything outside the cookie's path arrives
  // unauthenticated, which the heartbeat reads as "signed in elsewhere" and
  // acts on by signing the user out.
  it("are all inside the session cookie's path", () => {
    for (const endpoint of BROKER_CLIENT_ENDPOINTS) {
      expect(withinCookiePath(endpoint), `${endpoint} is outside ${BROKER_COOKIE_PATH} — the cookie will not be sent`).toBe(true);
    }
  });

  it("are the paths the routes actually live at", () => {
    // Kept literal on purpose: if a route moves, this fails rather than
    // following it somewhere the cookie cannot go.
    expect(BROKER_SESSION_ENDPOINT).toBe("/broker/api/session");
    expect(BROKER_SECURITY_EVENT_ENDPOINT).toBe("/broker/api/security-event");
  });
});
