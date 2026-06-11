import { describe, expect, it, vi } from "vitest";

// world-cup-live-feed.ts carries a `server-only` import to prevent client
// bundling; vitest doesn't ship a stub. Empty mock = pure parse functions
// are importable here.
vi.mock("server-only", () => ({}));

import { parseStatus } from "./world-cup-live-feed";

// Status payload structure ESPN returns. type.state controls scheduled /
// in-progress / post; type.name + type.description disambiguate halftime
// from in-play halves.
function status(state: string, opts: { name?: string; description?: string } = {}) {
  return { type: { state, name: opts.name, description: opts.description } };
}

describe("parseStatus", () => {
  it("returns 'scheduled' when the match hasn't started", () => {
    expect(parseStatus(status("pre"))).toBe("scheduled");
  });

  it("returns 'final' when the match is post-game", () => {
    expect(parseStatus(status("post"))).toBe("final");
  });

  describe("in-progress matches", () => {
    it("returns 'live' during the 1st Half — regression for #halftime-misclassification", () => {
      expect(parseStatus(status("in", { description: "1st Half" }))).toBe("live");
      expect(parseStatus(status("in", { description: "First Half" }))).toBe("live");
    });

    it("returns 'live' during the 2nd Half", () => {
      expect(parseStatus(status("in", { description: "2nd Half" }))).toBe("live");
      expect(parseStatus(status("in", { description: "Second Half" }))).toBe("live");
    });

    it("returns 'halftime' for the actual interval", () => {
      expect(parseStatus(status("in", { description: "Halftime" }))).toBe("halftime");
      expect(parseStatus(status("in", { description: "Half Time" }))).toBe("halftime");
      expect(parseStatus(status("in", { description: "HT" }))).toBe("halftime");
    });

    it("prefers the structured type.name flag over description", () => {
      // ESPN sometimes ships type.name = STATUS_HALFTIME with a description
      // that doesn't say "halftime" at all. Trust the structured signal.
      expect(parseStatus(status("in", { name: "STATUS_HALFTIME", description: "End of 1st Half" }))).toBe("halftime");
    });

    it("returns 'live' when description is missing or unrecognised", () => {
      expect(parseStatus(status("in"))).toBe("live");
      expect(parseStatus(status("in", { description: "Extra Time" }))).toBe("live");
    });
  });

  it("handles malformed input safely", () => {
    expect(parseStatus(null)).toBe("scheduled");
    expect(parseStatus(undefined)).toBe("scheduled");
    expect(parseStatus("not an object")).toBe("scheduled");
    expect(parseStatus({})).toBe("scheduled");
  });
});
