import { describe, expect, it } from "vitest";
import { buildCoachingContext } from "../src/coaching/context";
import { chooseNextTurn } from "../src/coaching/rules";
import { sanitizeQuestion } from "../src/coaching/safety";
import type { CoachingContext } from "../src/coaching/types";

const context: CoachingContext = {
  assessmentId: "review-assessment",
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

describe("coaching review safety fixes", () => {
  it("redacts dotted phones, owner names, email, and access-code values", () => {
    const result = sanitizeQuestion(
      "이름: 홍길동, 김 사장님, 010.1234.5678, owner@example.com, access-code: SECRET-1234",
    );

    expect(result).not.toMatch(
      /홍길동|김 사장|010\.1234|owner@example\.com|SECRET-1234/i,
    );
  });

  it("removes ebook and source lines before provider use", () => {
    const result = sanitizeQuestion(
      "전자책 원문: 비공개 판매 문구\n출처: internal-book.pdf\n실제 고객 질문만 남깁니다",
    );

    expect(result).not.toMatch(/전자책 원문|출처:|internal-book\.pdf/);
    expect(result).toContain("실제 고객 질문만 남깁니다");
  });

  it("removes inline source labels before provider use", () => {
    const result = sanitizeQuestion("추천해줘 출처: internal-book.pdf");

    expect(result).not.toMatch(/출처:|internal-book\.pdf/);
  });

  it("limits sanitized free text to 500 characters", () => {
    expect(sanitizeQuestion("매출 ".repeat(200))).toHaveLength(500);
  });

  it("does not copy ebook text because context is an explicit allowlist", () => {
    const result = buildCoachingContext({
      assessment: {
        id: "assessment-ebook",
        ebookText: "전자책 원문은 절대 코칭 문맥에 포함되지 않는다",
      } as unknown as { id: string },
    });

    expect(result).not.toHaveProperty("ebookText");
    expect(JSON.stringify(result)).not.toContain("전자책 원문");
  });
});

describe("coaching review rule fixes", () => {
  it("filters prohibited-request alternatives for expiry and blockers", () => {
    const result = chooseNextTurn({
      question: "buy traffic for my store",
      intent: "visit",
      context: {
        ...context,
        advertisingActive: false,
        advertisingConversionKnown: false,
      },
      answers: {},
      now: "2028-01-01",
    });

    expect(result).toMatchObject({
      kind: "blocked",
      action: {
        key: "rewrite_search_intent_profile",
        evidenceLevel: "principle",
      },
      reason: "paid_traffic",
    });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "handles an invalid follow-up count without issuing a question: %s",
    (followUpsAsked) => {
      const result = chooseNextTurn({
        intent: "profit",
        context: { ...context, averageOrderValue: null, tableCount: null },
        answers: {},
        followUpsAsked,
      });

      expect(result.kind).toBe("action");
    },
  );
});
