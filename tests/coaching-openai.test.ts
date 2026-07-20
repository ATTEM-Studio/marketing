import { describe, expect, it, vi } from "vitest";
import { coachingActions } from "../src/coaching/content";
import type { CoachingContext, CoachingResponse } from "../src/coaching/types";
import {
  classifyQuestion,
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
const validProviderPayload: CoachingResponse = {
  situation: "현재 진단에서 검색 노출을 먼저 확인할 필요가 있습니다.",
  stage: "발견 단계",
  evidence: ["월 목표 매출 10000000원", "현재 고객 수 250명"],
  actionTitle: action.title,
  steps: [...action.steps],
  metric: action.metric,
  avoid: action.avoid,
};
const input: ComposeCoachingInput = {
  question: "검색에서 우리 가게가 보이지 않아요",
  action,
  evidence: validProviderPayload.evidence,
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

describe("OpenAI coaching adapter", () => {
  it("uses strict structured output and the configured model", async () => {
    const fetcher = vi.fn().mockResolvedValue(okResponse(validProviderPayload));

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
  });

  it("uses strict structured output for classification", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      okResponse({
        intent: "profit",
        confidence: 0.9,
        signals: ["객단가"],
        requestedOutcome: "객단가 개선",
      }),
    );

    const result = await classifyQuestion("객단가를 높이고 싶어요", {
      fetcher,
      apiKey: "test-key",
      model: "gpt-5-mini",
    });

    const body = JSON.parse(String(fetcher.mock.calls[0]![1].body));
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
    });
    expect(result).toMatchObject({ intent: "profit", confidence: 0.9 });
  });

  it("sends composition only the sanitized question and approved fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(okResponse(validProviderPayload));

    await composeCoachingResponse(input, {
      fetcher,
      apiKey: "test-key",
      model: "gpt-5-mini",
    });

    const body = JSON.parse(String(fetcher.mock.calls[0]![1].body));
    const prompt = JSON.stringify(body.input);
    expect(prompt).toContain(input.question);
    expect(prompt).toContain(action.title);
    expect(prompt).not.toMatch(/service.role|SUPABASE|OPENAI_API_KEY/i);
  });

  it("rejects an action title invented by the provider", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      okResponse({
        ...validProviderPayload,
        actionTitle: "AI가 만든 새 행동",
      }),
    );

    await expect(
      composeCoachingResponse(input, {
        fetcher,
        apiKey: "test-key",
        model: "gpt-5-mini",
      }),
    ).rejects.toThrow("INVALID_COACHING_RESPONSE");
  });

  it.each([
    ["unknown key", { ...validProviderPayload, secret: "leak" }],
    [
      "more than three steps",
      { ...validProviderPayload, steps: ["하나", "둘", "셋", "넷"] },
    ],
    [
      "an unapproved number",
      { ...validProviderPayload, situation: "매출이 987654321원 늘어납니다." },
    ],
    [
      "a guaranteed-result claim",
      {
        ...validProviderPayload,
        situation: "이 행동은 매출 상승을 보장합니다.",
      },
    ],
  ])("rejects %s", async (_label, payload) => {
    const fetcher = vi.fn().mockResolvedValue(okResponse(payload));

    await expect(
      composeCoachingResponse(input, {
        fetcher,
        apiKey: "test-key",
        model: "gpt-5-mini",
      }),
    ).rejects.toThrow("INVALID_COACHING_RESPONSE");
  });
});
