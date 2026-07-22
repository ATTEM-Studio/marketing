import { describe, expect, it, vi } from "vitest";
import { coachingActions } from "../src/coaching/content";
import type { CoachingContext } from "../src/coaching/types";
import {
  buildProviderQuestionSignals,
  classifyQuestion,
  coachingNarrativeTemplates,
  composeCoachingResponse,
  type ComposeCoachingInput,
} from "../api/_lib/openai";

const action = coachingActions[0]!;
const context: CoachingContext = {
  assessmentId: "assessment-1",
  targetRevenue: 10_000_000,
  averageOrderValue: 20_000,
  currentCustomerCount: 250,
  requiredCustomerCount: 300,
  returningCustomerKnown: true,
  returningCustomerRate: 0.35,
  advertisingActive: true,
  advertisingConversionKnown: true,
  tableCount: 10,
  dailyTurnover: 2,
  completedActionKeys: [],
};
const validNarrative = {
  situationKey: "action_ready",
  stageKey: "discovery",
  disclaimerKey: "none",
};
const questionSignals = {
  concernKey: "not_visible" as const,
  signals: ["search_visibility"] as const,
};
const input: ComposeCoachingInput = {
  questionSignals,
  action,
  evidence: ["월 목표 매출 10000000원", "현재 고객 수 250명"],
  context,
};

function okResponse(payload: unknown): Response {
  return new Response(
    JSON.stringify({
      id: "resp_test",
      object: "response",
      created_at: 1_784_513_600,
      status: "completed",
      error: null,
      incomplete_details: null,
      instructions: null,
      max_output_tokens: 500,
      model: "gpt-5-mini",
      output: [
        {
          id: "msg_test",
          type: "message",
          status: "completed",
          role: "assistant",
          content: [
            {
              type: "output_text",
              annotations: [],
              logprobs: [],
              text: JSON.stringify(payload),
            },
          ],
        },
      ],
      parallel_tool_calls: true,
      previous_response_id: null,
      reasoning: { effort: null, summary: null },
      store: false,
      temperature: 1,
      text: { format: { type: "text" }, verbosity: "medium" },
      tool_choice: "auto",
      tools: [],
      top_p: 1,
      truncation: "disabled",
      usage: {
        input_tokens: 10,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 10,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 20,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("OpenAI coaching adapter authority", () => {
  it("uses strict structured output and the configured model", async () => {
    const fetcher = vi.fn().mockResolvedValue(okResponse(validNarrative));

    await composeCoachingResponse(input, {
      fetcher,
      apiKey: "test-key",
      model: "gpt-5-mini",
    });

    const [url, init] = fetcher.mock.calls[0]!;
    const body = JSON.parse(String(init.body));
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.headers.authorization).toBe("Bearer test-key");
    expect(body.model).toBe("gpt-5-mini");
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
    expect(Object.keys(body.text.format.schema.properties).sort()).toEqual([
      "disclaimerKey",
      "situationKey",
      "stageKey",
    ]);
    expect(body.text.format.schema.properties.situationKey.enum).toEqual(
      Object.keys(coachingNarrativeTemplates.situation),
    );
  });

  it("constructs every authoritative field from approved server data", async () => {
    const fetcher = vi.fn().mockResolvedValue(okResponse(validNarrative));

    const result = await composeCoachingResponse(input, {
      fetcher,
      apiKey: "test-key",
    });

    expect(result).toEqual({
      situation: coachingNarrativeTemplates.situation.action_ready,
      stage: coachingNarrativeTemplates.stage.discovery,
      evidence: input.evidence,
      actionTitle: action.title,
      steps: action.steps,
      metric: action.metric,
      avoid: action.avoid,
    });
  });

  it.each([
    ["situationKey", "다섯 배"],
    ["situationKey", "may double"],
    ["stageKey", "확정"],
    ["disclaimerKey", "will definitely improve"],
    ["evidence", ["provider evidence"]],
    ["actionTitle", "provider action"],
    ["steps", ["provider step"]],
    ["metric", "provider metric"],
    ["avoid", "provider avoid"],
  ])(
    "rejects provider-authored text or authority in %s",
    async (key, value) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(okResponse({ ...validNarrative, [key]: value }));

      await expect(
        composeCoachingResponse(input, { fetcher, apiKey: "test-key" }),
      ).rejects.toThrow("INVALID_COACHING_RESPONSE");
    },
  );

  it("maps every returned narrative string from the closed server templates", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      okResponse({
        situationKey: "measurement_gap",
        stageKey: "visit",
        disclaimerKey: "test_and_measure",
      }),
    );

    const result = await composeCoachingResponse(input, {
      fetcher,
      apiKey: "test-key",
    });

    expect(result.situation).toBe(
      coachingNarrativeTemplates.situation.measurement_gap,
    );
    expect(result.stage).toBe(coachingNarrativeTemplates.stage.visit);
    expect(result.disclaimer).toBe(
      coachingNarrativeTemplates.disclaimer.test_and_measure,
    );
  });
});

describe("fail-closed provider question signals", () => {
  it("uses strict structured output for classification", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      okResponse({
        intent: "profit",
        confidence: 0.9,
        signals: ["average_order_value"],
        requestedOutcome: "increase_average_order_value",
      }),
    );

    const result = await classifyQuestion(
      {
        concernKey: "low_average_order_value",
        signals: ["average_order_value"],
      },
      { fetcher, apiKey: "test-key", model: "gpt-5-mini" },
    );

    const body = JSON.parse(String(fetcher.mock.calls[0]![1].body));
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
    });
    expect(result).toMatchObject({ intent: "profit", confidence: 0.9 });
  });

  it("drops arbitrary identity and location text while retaining business signals", async () => {
    const raw = [
      "홍길동 사장님",
      "서울시 강남구 테헤란로 123",
      "@secret_store #우리매장",
      "010-1234-5678 owner@example.com invite-code: SECRET-1234",
      "전자책 원문: paid-guide.pdf source: internal.epub",
      "광고비는 나가는데 실제 방문 고객이 없고 객단가도 낮아요",
    ].join(" ");
    const safe = buildProviderQuestionSignals(raw, "unknown");
    const fetcher = vi.fn().mockResolvedValue(
      okResponse({
        intent: "visit",
        confidence: 0.9,
        signals: ["advertising_conversion"],
        requestedOutcome: "measure_visit_conversion",
      }),
    );

    expect(safe).toEqual({
      concernKey: "unknown",
      signals: ["advertising_conversion", "average_order_value"],
    });
    await classifyQuestion(safe!, { fetcher, apiKey: "test-key" });

    const requestBody = String(fetcher.mock.calls[0]![1].body);
    expect(requestBody).toContain("advertising_conversion");
    expect(requestBody).toContain("average_order_value");
    expect(requestBody).not.toMatch(
      /홍길동|테헤란로|secret_store|우리매장|010-1234|owner@example|SECRET-1234|paid-guide|internal\.epub/iu,
    );
  });

  it("returns null when arbitrary text has no allowlisted coaching signal", () => {
    expect(
      buildProviderQuestionSignals(
        "홍길동 서울시 강남구 @secret_store 오늘 날씨가 좋아요",
        "unknown",
      ),
    ).toBeNull();
  });

  it("sends composition only canonical signals and approved action fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(okResponse(validNarrative));

    await composeCoachingResponse(input, { fetcher, apiKey: "test-key" });

    const requestBody = String(fetcher.mock.calls[0]![1].body);
    expect(requestBody).toContain("search_visibility");
    expect(requestBody).toContain(action.title);
    expect(requestBody).not.toMatch(/service.role|SUPABASE|OPENAI_API_KEY/iu);
  });
});
