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

  it("maps the exact pending key, answer payload, context, and answers to consume", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const admin = createSupabaseAdmin({ rpc } as never);
    const context = { assessmentId: "assessment-1" } as never;
    const answers = { customer_consent: "yes" };
    const answerPayload = {
      kind: "follow_up_answer",
      answer: { questionKey: "customer_consent", value: "yes" },
    };

    await expect(
      admin.consumeFollowUp({
        userId: "user-1",
        sessionId: "session-1",
        questionKey: "customer_consent",
        answerPayload,
        context,
        answers,
      }),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("consume_coaching_follow_up", {
      p_user_id: "user-1",
      p_session_id: "session-1",
      p_question_key: "customer_consent",
      p_answer_payload: answerPayload,
      p_context: context,
      p_answers: answers,
    });
  });

  it("maps every authoritative recommendation and response field to finalization", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        recommendationId: "recommendation-1",
        response: coachingResponse,
        created: true,
      },
      error: null,
    });
    const admin = createSupabaseAdmin({ rpc } as never);
    const context = { assessmentId: "assessment-1" } as never;
    const answers = { customer_consent: "yes" };
    const metricSnapshot = { targetRevenue: 10_000_000 };

    await admin.finalizeSession({
      userId: "user-1",
      sessionId: "session-1",
      actionKey: "local-discovery",
      actionVersion: 3,
      evidenceKeys: ["targetRevenue"],
      metricSnapshot,
      response: coachingResponse,
      context,
      answers,
      answeredAt: "2026-07-21T00:00:00.000Z",
    });

    expect(rpc).toHaveBeenCalledWith("finalize_coaching_session", {
      p_user_id: "user-1",
      p_session_id: "session-1",
      p_action_key: "local-discovery",
      p_action_version: 3,
      p_evidence_keys: ["targetRevenue"],
      p_metric_snapshot: metricSnapshot,
      p_response: coachingResponse,
      p_context: context,
      p_answers: answers,
      p_answered_at: "2026-07-21T00:00:00.000Z",
    });
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
