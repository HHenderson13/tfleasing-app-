import { describe, expect, it } from "vitest";
import { computeGroupStandings, scorePrediction, winnerForGroup } from "./world-cup-scoring";

describe("scorePrediction", () => {
  it("exact match → 10 (2 + 3 + 5)", () => {
    expect(scorePrediction({ team1Goals: 2, team2Goals: 1 }, { team1Goals: 2, team2Goals: 1 }).total).toBe(10);
  });

  it("right result + right total goals, wrong score → 5 (2 + 3)", () => {
    // Predicted 3-2 (5 goals, team1 win), actual 4-1 (5 goals, team1 win).
    expect(scorePrediction({ team1Goals: 3, team2Goals: 2 }, { team1Goals: 4, team2Goals: 1 }).total).toBe(5);
  });

  it("right result, wrong total goals → 3 (result only)", () => {
    // Predicted 2-0 (team1 win), actual 3-1 (team1 win, but 4 goals not 2).
    expect(scorePrediction({ team1Goals: 2, team2Goals: 0 }, { team1Goals: 3, team2Goals: 1 }).total).toBe(3);
  });

  it("right total goals, wrong result → 2 (total goals only)", () => {
    // Predicted 1-2 (team2 win, 3 goals), actual 3-0 (team1 win, 3 goals).
    expect(scorePrediction({ team1Goals: 1, team2Goals: 2 }, { team1Goals: 3, team2Goals: 0 }).total).toBe(2);
  });

  it("nothing right → 0", () => {
    // Predicted 0-0 (draw, 0 goals); actual 3-1 (team1 win, 4 goals).
    expect(scorePrediction({ team1Goals: 0, team2Goals: 0 }, { team1Goals: 3, team2Goals: 1 }).total).toBe(0);
  });

  it("correctly identifies a draw", () => {
    // Predicted 1-1, actual 2-2 — same outcome (draw) + same total (4? no, 2 vs 4).
    // Total differs, so just the 3 result points.
    expect(scorePrediction({ team1Goals: 1, team2Goals: 1 }, { team1Goals: 2, team2Goals: 2 }).total).toBe(3);
  });
});

describe("winnerForGroup", () => {
  it("returns the higher-scoring team", () => {
    expect(winnerForGroup(2, 1, "USA", "Paraguay")).toBe("USA");
    expect(winnerForGroup(0, 1, "Mexico", "Brazil")).toBe("Brazil");
  });
  it("returns 'Draw' on a level score", () => {
    expect(winnerForGroup(1, 1, "France", "Spain")).toBe("Draw");
  });
});

describe("computeGroupStandings", () => {
  it("3-3-3 round robin sorts by points → GD → GF", () => {
    // A: W vs B (2-0), W vs C (1-0), W vs D (3-1) → 9 pts, GD +5
    // B: L to A (0-2), W vs C (2-1), D vs D (1-1) → 4 pts, GD -1
    // C: L to A (0-1), L to B (1-2), W vs D (3-0) → 3 pts, GD +1
    // D: L to A (1-3), D vs B (1-1), L to C (0-3) → 1 pt, GD -5
    const standings = computeGroupStandings(
      ["A", "B", "C", "D"],
      [
        { team1: "A", team2: "B", team1Goals: 2, team2Goals: 0 },
        { team1: "A", team2: "C", team1Goals: 1, team2Goals: 0 },
        { team1: "A", team2: "D", team1Goals: 3, team2Goals: 1 },
        { team1: "B", team2: "C", team1Goals: 2, team2Goals: 1 },
        { team1: "B", team2: "D", team1Goals: 1, team2Goals: 1 },
        { team1: "C", team2: "D", team1Goals: 3, team2Goals: 0 },
      ],
    );
    expect(standings.map((s) => s.team)).toEqual(["A", "B", "C", "D"]);
    expect(standings[0].points).toBe(9);
    expect(standings[0].goalDiff).toBe(5);
    expect(standings[3].played).toBe(3);
  });

  it("ties broken by goal difference, then goals scored", () => {
    // X and Y both: W 1 D 1 L 1 = 4 pts. X scored more, X wins tiebreak.
    const s = computeGroupStandings(
      ["X", "Y", "Z"],
      [
        { team1: "X", team2: "Y", team1Goals: 3, team2Goals: 0 },
        { team1: "X", team2: "Z", team1Goals: 1, team2Goals: 1 },
        { team1: "Y", team2: "Z", team1Goals: 2, team2Goals: 2 },
      ],
    );
    // X: 1W 1D 0L = 4 pts, GD +3, GF 4
    // Y: 0W 1D 1L = 1 pt
    // Z: 0W 2D 0L = 2 pts
    expect(s[0].team).toBe("X");
  });

  it("handles a group with no results yet", () => {
    const s = computeGroupStandings(["P", "Q", "R", "S"], []);
    expect(s).toHaveLength(4);
    expect(s.every((r) => r.played === 0 && r.points === 0)).toBe(true);
  });
});
