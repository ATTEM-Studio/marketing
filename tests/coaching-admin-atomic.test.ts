import { describe, expect, it, vi } from "vitest";
import { coachingActions } from "../src/coaching/content";
import { createSupabaseAdmin } from "../api/_lib/supabase-admin";

const coachingResponse = {
  situation: "current situation",
  stage: "discovery",
  evidence: ["approved evidence"],
  actionTitle: coachingActions[0]!.title,
  steps: [...coachingActions[0]!.steps],
  metric: coachingActions[0]!.metric,
  avoid: coachingActions[0]!.avoid,
};

describe("coaching admin atomic RPC interface", () => {
  it("passes the expected count and pending identity to the issue RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const admin = createSupabaseAdmin({ rpc } as never);

    const result = await admin.issueFollowUp({
      userId: "user-1",
      sessionId: "session-1",
      expectedFollowUpCount: 1,
      questionKey: "customer_consent",
      questionPayload: { kind: "follow_up" },
      context: {} as never,
      answers: {},
    });

    expect(result).toBe(2);
    expect(rpc).toHaveBeenCalledWith(
      "issue_coaching_follow_up",
      expect.objectContaining({
        p_expected_follow_up_count: 1,
        p_question_key: "customer_consent",
      }),
    );
  });

  it("treats a partial finalization RPC result as a failed CAS", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { recommendationId: "recommendation-1" },
      error: null,
    });
    const admin = createSupabaseAdmin({ rpc } as never);

    await expect(
      admin.getFinalizedResult("user-1", "session-1"),
    ).resolves.toBeNull();
  });

  it("returns the stored response from an idempotent finalization retry", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        recommendationId: "recommendation-1",
        response: coachingResponse,
        created: false,
      },
      error: null,
    });
    const admin = createSupabaseAdmin({ rpc } as never);

    await expect(
      admin.getFinalizedResult("user-1", "session-1"),
    ).resolves.toEqual({
      recommendationId: "recommendation-1",
      response: coachingResponse,
      created: false,
    });
  });
});
