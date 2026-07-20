import { describe, expect, it } from "vitest";
import { coachingActions } from "../src/coaching/content";

describe("coaching action catalog", () => {
  it("contains 15 unique, reviewable, executable actions", () => {
    expect(coachingActions).toHaveLength(15);
    expect(new Set(coachingActions.map((action) => action.key)).size).toBe(15);
    for (const action of coachingActions) {
      expect(action.steps.length).toBeGreaterThanOrEqual(2);
      expect(action.steps.length).toBeLessThanOrEqual(3);
      expect(action.metric).not.toBe("");
      expect(action.avoid).not.toBe("");
      expect(["official", "principle", "hypothesis"]).toContain(
        action.evidenceLevel,
      );
      if (action.evidenceLevel === "official") {
        expect(action.reviewAfter).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});
