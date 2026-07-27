import { beforeEach, describe, expect, it, vi } from "vitest";
import { coachingActions } from "../src/coaching/content";
import type { CoachingResponse } from "../src/coaching/types";
import {
  handleCoachingRequest,
  type CoachingHandlerDependencies,
  type CoachingHttpRequest,
  type OwnedCoachingAssessment,
} from "../api/_lib/coaching-handler";
import { createCoachingEndpoint } from "../api/coaching";

const userId = "00000000-0000-4000-8000-000000000001";
const assessmentId = "00000000-0000-4000-8000-000000000002";
const storeId = "00000000-0000-4000-8000-000000000003";
const sessionId = "00000000-0000-4000-8000-000000000004";
const recommendationId = "00000000-0000-4000-8000-000000000005";

const ownedAssessment: OwnedCoachingAssessment = {
  completed: true,
  storeId,
  assessment: {
    id: assessmentId,
    inputs: {
      revenue: {
        targetMonthlyRevenue: 10_000_000,
        averageOrderValue: 20_000,
        monthlyCustomerCount: 250,
      },
      returningDataStatus: "unknown",
      adsRunning: true,
    },
    metrics: { requiredCustomerCount: 300 },
    diagnosis: { completed: true },
  },
  goal: { targetRevenue: 10_000_000 },
  store: { name: "서버에만 있는 매장명", phone: "010-1111-2222" },
  recommendation: { adsRunning: true, adAttributionKnown: false },
  completedPlans: [],
};

const providerAnswer: CoachingResponse = {
  situation: "현재 상황을 확인했습니다.",
  stage: "발견 단계",
  evidence: ["진단 근거"],
  actionTitle: coachingActions[0]!.title,
  steps: [...coachingActions[0]!.steps],
  metric: coachingActions[0]!.metric,
  avoid: coachingActions[0]!.avoid,
};

function request(body: unknown, token = "valid-token"): CoachingHttpRequest {
  return {
    method: "POST",
    headers: token === "" ? {} : { authorization: `Bearer ${token}` },
    body,
  };
}

function turn(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    kind: "turn",
    assessmentId,
    concernKey: "not_visible",
    ...overrides,
  };
}

function dependencies(): CoachingHandlerDependencies {
  return {
    admin: {
      verifyToken: vi.fn().mockResolvedValue({ userId }),
      hasActiveProfile: vi.fn().mockResolvedValue(true),
      getOwnedAssessment: vi.fn().mockResolvedValue(ownedAssessment),
      consumeRate: vi.fn().mockResolvedValue(true),
      getOwnedSession: vi.fn().mockResolvedValue(null),
      insertSession: vi.fn().mockResolvedValue({
        id: sessionId,
        userId,
        storeId,
        assessmentId,
        concernKey: "not_visible",
        initialQuestion: "not_visible",
        intent: "discovery",
        confidence: 1,
        status: "active",
        followUpCount: 0,
        pendingFollowUpKey: null,
        answers: {},
      }),
      insertMessage: vi.fn().mockResolvedValue(undefined),
      issueFollowUp: vi.fn().mockResolvedValue(1),
      consumeFollowUp: vi.fn().mockResolvedValue(true),
      finalizeSession: vi.fn().mockImplementation(async (input) => ({
        recommendationId,
        response: input.response,
        created: true,
      })),
      getFinalizedResult: vi.fn().mockResolvedValue({
        recommendationId,
        response: providerAnswer,
        created: false,
      }),
      updateFeedback: vi.fn().mockResolvedValue(true),
    },
    classifyQuestion: vi.fn().mockResolvedValue({
      intent: "discovery",
      confidence: 0.9,
      signals: ["검색"],
    }),
    composeCoachingResponse: vi.fn().mockResolvedValue(providerAnswer),
  };
}

describe("coaching server handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a missing bearer token with 401", async () => {
    const deps = dependencies();

    const result = await handleCoachingRequest(request(turn(), ""), deps);

    expect(result.status).toBe(401);
    expect(deps.admin.verifyToken).not.toHaveBeenCalled();
  });

  it("hides an assessment owned by another user with 404", async () => {
    const deps = dependencies();
    vi.mocked(deps.admin.getOwnedAssessment).mockResolvedValue(null);

    const result = await handleCoachingRequest(request(turn()), deps);

    expect(result.status).toBe(404);
  });

  it("rejects an incomplete diagnosis with 409", async () => {
    const deps = dependencies();
    vi.mocked(deps.admin.getOwnedAssessment).mockResolvedValue({
      ...ownedAssessment,
      completed: false,
    });

    const result = await handleCoachingRequest(request(turn()), deps);

    expect(result.status).toBe(409);
    expect(deps.admin.consumeRate).not.toHaveBeenCalled();
  });

  it("rejects the 501st question character with 400", async () => {
    const deps = dependencies();

    const result = await handleCoachingRequest(
      request(turn({ concernKey: undefined, question: "가".repeat(501) })),
      deps,
    );

    expect(result.status).toBe(400);
    expect(deps.admin.getOwnedAssessment).not.toHaveBeenCalled();
  });

  it("rejects an exhausted database limiter with 429", async () => {
    const deps = dependencies();
    vi.mocked(deps.admin.consumeRate).mockResolvedValue(false);

    const result = await handleCoachingRequest(request(turn()), deps);

    expect(result.status).toBe(429);
    expect(deps.admin.insertSession).not.toHaveBeenCalled();
  });

  it("allows the second trusted session follow-up", async () => {
    const deps = dependencies();
    vi.mocked(deps.admin.getOwnedSession).mockResolvedValue({
      id: sessionId,
      userId,
      storeId,
      assessmentId,
      concernKey: "low_returning",
      initialQuestion: "재방문이 적어요",
      intent: "returning",
      confidence: 1,
      status: "active",
      followUpCount: 1,
      pendingFollowUpKey: "customer_choice_reason",
      answers: {},
    });
    vi.mocked(deps.admin.issueFollowUp).mockResolvedValue(2);

    const result = await handleCoachingRequest(
      request(
        turn({
          sessionId,
          concernKey: undefined,
          answer: { questionKey: "customer_choice_reason", value: "모름" },
        }),
      ),
      deps,
    );

    expect(result).toMatchObject({
      status: 200,
      body: { kind: "follow_up", sessionId, remaining: 0 },
    });
    expect(deps.admin.issueFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({ expectedFollowUpCount: 1 }),
    );
    expect(deps.composeCoachingResponse).not.toHaveBeenCalled();
  });

  it("prevents a third follow-up and returns an answer", async () => {
    const deps = dependencies();
    vi.mocked(deps.admin.getOwnedSession).mockResolvedValue({
      id: sessionId,
      userId,
      storeId,
      assessmentId,
      concernKey: "low_returning",
      initialQuestion: "재방문이 적어요",
      intent: "returning",
      confidence: 1,
      status: "active",
      followUpCount: 2,
      pendingFollowUpKey: "return_reason_known",
      answers: {},
    });

    const result = await handleCoachingRequest(
      request(
        turn({
          sessionId,
          concernKey: undefined,
          answer: { questionKey: "return_reason_known", value: "모름" },
        }),
      ),
      deps,
    );

    expect(result).toMatchObject({
      status: 200,
      body: { kind: "answer", sessionId, recommendationId },
    });
    expect(deps.composeCoachingResponse).toHaveBeenCalledOnce();
  });

  it("falls back to a catalog template when the provider fails", async () => {
    const deps = dependencies();
    vi.mocked(deps.composeCoachingResponse).mockRejectedValue(
      new Error("provider timeout"),
    );

    const result = await handleCoachingRequest(request(turn()), deps);

    expect(result).toMatchObject({
      status: 200,
      body: {
        kind: "answer",
        sessionId,
        recommendationId,
        response: {
          actionTitle: coachingActions[0]!.title,
          steps: coachingActions[0]!.steps,
          metric: coachingActions[0]!.metric,
          avoid: coachingActions[0]!.avoid,
        },
      },
    });
    expect(deps.admin.finalizeSession).toHaveBeenCalledOnce();
    expect(deps.admin.insertMessage).toHaveBeenCalledTimes(1);
  });

  it("hides feedback updates for a non-owner with 404", async () => {
    const deps = dependencies();
    vi.mocked(deps.admin.updateFeedback).mockResolvedValue(false);

    const result = await handleCoachingRequest(
      request({
        kind: "feedback",
        recommendationId,
        feedback: "helpful",
      }),
      deps,
    );

    expect(result.status).toBe(404);
    expect(deps.admin.updateFeedback).toHaveBeenCalledWith(
      userId,
      recommendationId,
      "helpful",
    );
  });

  it("classifies only free-text questions and sanitizes before provider use", async () => {
    const cardDeps = dependencies();
    await handleCoachingRequest(request(turn()), cardDeps);
    expect(cardDeps.classifyQuestion).not.toHaveBeenCalled();

    const textDeps = dependencies();
    await handleCoachingRequest(
      request(
        turn({
          concernKey: undefined,
          question: "매출 질문 010-1234-5678 owner@example.com",
        }),
      ),
      textDeps,
    );
    expect(textDeps.classifyQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ signals: expect.any(Array) }),
    );
    expect(textDeps.composeCoachingResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        questionSignals: expect.objectContaining({
          signals: expect.any(Array),
        }),
      }),
    );
  });

  it("uses the rule fallback without a provider when free text has no allowlisted signal", async () => {
    const deps = dependencies();

    const result = await handleCoachingRequest(
      request(
        turn({
          concernKey: undefined,
          question: "Kim owns Blue Shop at 12 River Road, @blue-secret",
        }),
      ),
      deps,
    );

    expect(result.status).toBe(200);
    expect(deps.classifyQuestion).not.toHaveBeenCalled();
    expect(deps.composeCoachingResponse).not.toHaveBeenCalled();
  });

  it("sanitizes a follow-up answer before persisting it", async () => {
    const deps = dependencies();
    vi.mocked(deps.admin.getOwnedSession).mockResolvedValue({
      id: sessionId,
      userId,
      storeId,
      assessmentId,
      concernKey: "low_returning",
      initialQuestion: "재방문이 적어요",
      intent: "returning",
      confidence: 1,
      status: "active",
      followUpCount: 1,
      pendingFollowUpKey: "customer_choice_reason",
      answers: {},
    });

    await handleCoachingRequest(
      request(
        turn({
          sessionId,
          concernKey: undefined,
          answer: {
            questionKey: "customer_choice_reason",
            value: "연락처 010-1234-5678 owner@example.com",
          },
        }),
      ),
      deps,
    );

    expect(
      JSON.stringify(vi.mocked(deps.admin.consumeFollowUp).mock.calls[0]),
    ).not.toMatch(/010-1234-5678|owner@example\.com/);
  });

  it("rejects an answer that is not for the persisted pending follow-up", async () => {
    const deps = dependencies();
    vi.mocked(deps.admin.getOwnedSession).mockResolvedValue({
      id: sessionId,
      userId,
      storeId,
      assessmentId,
      concernKey: "low_returning",
      initialQuestion: "returning customers",
      intent: "returning",
      confidence: 1,
      status: "active",
      followUpCount: 1,
      pendingFollowUpKey: "customer_consent",
      answers: {},
    });

    const result = await handleCoachingRequest(
      request(
        turn({
          sessionId,
          concernKey: undefined,
          answer: {
            questionKey: "customer_choice_reason",
            value: "menu",
          },
        }),
      ),
      deps,
    );

    expect(result).toMatchObject({
      status: 409,
      body: { error: "FOLLOW_UP_MISMATCH" },
    });
    expect(deps.admin.consumeFollowUp).not.toHaveBeenCalled();
  });

  it("returns a conflict when atomic follow-up issuance loses its CAS", async () => {
    const deps = dependencies();
    vi.mocked(deps.admin.issueFollowUp).mockResolvedValue(null);
    vi.mocked(deps.admin.getOwnedSession).mockResolvedValue({
      id: sessionId,
      userId,
      storeId,
      assessmentId,
      concernKey: "low_returning",
      initialQuestion: "returning customers",
      intent: "returning",
      confidence: 1,
      status: "active",
      followUpCount: 1,
      pendingFollowUpKey: "customer_choice_reason",
      answers: {},
    });

    const result = await handleCoachingRequest(
      request(
        turn({
          sessionId,
          concernKey: undefined,
          answer: { questionKey: "customer_choice_reason", value: "unknown" },
        }),
      ),
      deps,
    );

    expect(result).toMatchObject({
      status: 409,
      body: { error: "SESSION_STATE_CHANGED" },
    });
  });

  it("resumes finalization after an answer was atomically consumed before an interruption", async () => {
    const deps = dependencies();
    vi.mocked(deps.admin.getOwnedSession).mockResolvedValue({
      id: sessionId,
      userId,
      storeId,
      assessmentId,
      concernKey: "low_returning",
      initialQuestion: "returning customers",
      intent: "returning",
      confidence: 1,
      status: "active",
      followUpCount: 2,
      pendingFollowUpKey: null,
      answers: { return_reason_known: "unknown" },
    });

    const result = await handleCoachingRequest(
      request(
        turn({
          sessionId,
          concernKey: undefined,
          answer: { questionKey: "return_reason_known", value: "unknown" },
        }),
      ),
      deps,
    );

    expect(result).toMatchObject({
      status: 200,
      body: { kind: "answer", recommendationId },
    });
    expect(deps.admin.consumeFollowUp).not.toHaveBeenCalled();
    expect(deps.admin.finalizeSession).toHaveBeenCalledOnce();
  });

  it("returns the stored answer on an idempotent answered-session retry", async () => {
    const deps = dependencies();
    vi.mocked(deps.admin.getOwnedSession).mockResolvedValue({
      id: sessionId,
      userId,
      storeId,
      assessmentId,
      concernKey: "low_returning",
      initialQuestion: "returning customers",
      intent: "returning",
      confidence: 1,
      status: "answered",
      followUpCount: 1,
      pendingFollowUpKey: null,
      answers: { customer_consent: "yes" },
    });

    const result = await handleCoachingRequest(
      request(
        turn({
          sessionId,
          concernKey: undefined,
          answer: { questionKey: "customer_consent", value: "yes" },
        }),
      ),
      deps,
    );

    expect(result).toMatchObject({
      status: 200,
      body: { kind: "answer", recommendationId, response: providerAnswer },
    });
    expect(deps.admin.getFinalizedResult).toHaveBeenCalledWith(
      userId,
      sessionId,
    );
    expect(deps.composeCoachingResponse).not.toHaveBeenCalled();
  });

  it("rejects an answer for an unknown follow-up key", async () => {
    const deps = dependencies();

    const result = await handleCoachingRequest(
      request(
        turn({
          sessionId,
          concernKey: undefined,
          answer: { questionKey: "__proto__", value: "yes" },
        }),
      ),
      deps,
    );

    expect(result.status).toBe(400);
    expect(deps.admin.getOwnedAssessment).not.toHaveBeenCalled();
  });

  it("does not send a prohibited request to the composition provider", async () => {
    const deps = dependencies();

    const result = await handleCoachingRequest(
      request(
        turn({
          concernKey: undefined,
          question: "buy traffic and fake reviews for my store",
        }),
      ),
      deps,
    );

    expect(deps.composeCoachingResponse).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 200,
      body: {
        kind: "answer",
        response: {
          situation: expect.stringContaining("안내할 수 없습니다"),
        },
      },
    });
  });

  it("logs only a safe error code when a coaching request fails", async () => {
    const deps = dependencies();
    deps.admin.verifyToken = vi
      .fn()
      .mockRejectedValue(new Error("COACHING_DATA_ERROR"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const result = await handleCoachingRequest(
        request(
          turn({
            concernKey: undefined,
            question: "customer question text",
          }),
        ),
        deps,
      );

      expect(result.status).toBe(500);
      expect(log).toHaveBeenCalledWith(
        "COACHING_REQUEST_FAILED",
        "COACHING_DATA_ERROR",
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        "customer question text",
      );
    } finally {
      log.mockRestore();
    }
  });
});

describe("Vercel coaching endpoint", () => {
  it("maps the pure handler status and JSON body", async () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const endpoint = createCoachingEndpoint(dependencies());

    await endpoint(
      { method: "POST", headers: {}, body: turn() } as never,
      { status, json, setHeader: vi.fn() } as never,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "UNAUTHORIZED" });
  });
});
