import { describe, expect, it } from "vitest";
import { coachingActions } from "../src/coaching/content";
import { buildCoachingContext } from "../src/coaching/context";
import { chooseNextTurn, selectAction } from "../src/coaching/rules";
import type { CoachingContext, CoachingIntent } from "../src/coaching/types";

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

describe("server-owned coaching context", () => {
  it("keeps unknown returning-customer data unknown rather than treating it as zero", () => {
    const result = buildCoachingContext({
      assessment: {
        id: "assessment-1",
        inputs: {
          revenue: { averageOrderValue: 20_000, monthlyCustomerCount: 250 },
          restaurant: { seats: 10 },
        },
        metrics: { maxNewCustomers: 300 },
        diagnosis: { returningDataStatus: "unknown" },
        createdAt: "2026-07-20T00:00:00.000Z",
      },
      goal: { targetRevenue: 10_000_000 },
      store: { name: "비공개 매장", region: "서울", contact: "010-2222-3333" },
      recommendation: { adsRunning: true, adAttributionKnown: false },
      completedPlans: [],
    });

    expect(result).toMatchObject({
      assessmentId: "assessment-1",
      returningCustomerKnown: false,
      returningCustomerRate: null,
      advertisingActive: true,
      advertisingConversionKnown: false,
    });
    expect(result).not.toHaveProperty("name");
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("region");
    expect(result).not.toHaveProperty("storeName");
    expect(result).not.toHaveProperty("contact");
    expect(result).not.toHaveProperty("inviteCode");
  });

  it("maps persisted goal and completed-plan records without leaking store fields", () => {
    const result = buildCoachingContext({
      assessment: { id: "assessment-2" },
      goal: { target_revenue: 12_000_000 } as unknown as {
        targetRevenue: number;
      },
      store: { name: "숨김", region: "서울", invite_code: "SECRET" },
      completedPlans: [
        { action_key: "audit_cover_photo", status: "completed" } as unknown as {
          actionKey: string;
          status: string;
        },
      ],
    });

    expect(result).toMatchObject({
      targetRevenue: 12_000_000,
      completedActionKeys: ["audit_cover_photo"],
    });
    expect(result).not.toHaveProperty("invite_code");
  });
});

describe("deterministic coaching rules", () => {
  it("selects the same action for the same normalized input", () => {
    const first = selectAction({ intent: "profit", context, answers: {} });
    const second = selectAction({ intent: "profit", context, answers: {} });

    expect(second.key).toBe(first.key);
  });

  it("does not recommend ad optimization without conversion evidence", () => {
    const result = selectAction({
      intent: "visit",
      context: {
        ...context,
        advertisingActive: true,
        advertisingConversionKnown: false,
      },
      answers: {},
    });

    expect(result.key).toBe("track_ad_to_visit_path");
  });

  it("asks for missing AOV only when it changes the profit action", () => {
    const result = chooseNextTurn({
      intent: "profit",
      context: { ...context, averageOrderValue: null },
      answers: {},
    });

    expect(result).toMatchObject({
      kind: "follow_up",
      question: { key: "average_order_value" },
    });
  });

  it("asks for missing table count before a capacity-dependent profit action", () => {
    const result = chooseNextTurn({
      intent: "profit",
      context: { ...context, tableCount: null },
      answers: { average_order_value: "20000" },
    });

    expect(result).toMatchObject({
      kind: "follow_up",
      question: { key: "table_count" },
    });
  });

  it("removes expired official evidence actions", () => {
    const result = selectAction({
      intent: "discovery",
      context,
      answers: {},
      now: "2028-01-01",
    });

    expect(result.key).toBe("rewrite_search_intent_profile");
  });

  it("does not fall back to an expired official action when the intent is unknown", () => {
    const result = selectAction({
      intent: "unknown",
      context,
      answers: {},
      now: "2028-01-01",
    });

    expect(result.evidenceLevel).not.toBe("official");
  });

  it("avoids a completed action when another action is eligible", () => {
    const result = selectAction({
      intent: "selection",
      context: { ...context, completedActionKeys: ["audit_cover_photo"] },
      answers: {},
    });

    expect(result.key).toBe("clarify_signature_menu");
  });

  it("does not select a consent-blocked return offer", () => {
    const result = selectAction({
      intent: "returning",
      context,
      answers: { customer_consent: "no" },
    });

    expect(result.key).toBe("identify_return_reason");
  });

  it("stops after two follow-ups", () => {
    const result = chooseNextTurn({
      intent: "profit",
      context: { ...context, averageOrderValue: null, tableCount: null },
      answers: {},
      followUpsAsked: 2,
    });

    expect(result.kind).toBe("action");
  });

  it("uses an explicit concern card before classified intent", () => {
    const result = chooseNextTurn({
      concernKey: "ads_no_customers",
      classifiedIntent: "profit",
      context,
      answers: {},
    });

    expect(result).toMatchObject({
      kind: "action",
      action: { intent: "visit" },
    });
  });

  it("returns a safe blocked decision instead of prohibited instructions", () => {
    const result = chooseNextTurn({
      question: "가짜 리뷰를 구매해줘",
      intent: "discovery",
      context,
      answers: {},
    });

    expect(result).toMatchObject({
      kind: "blocked",
      action: { key: "complete_visit_information" },
      reason: "fake_review",
    });
  });

  it.each<CoachingIntent>([
    "discovery",
    "selection",
    "confidence",
    "visit",
    "returning",
    "profit",
  ])("selects an approved catalog action for %s", (intent) => {
    const result = selectAction({ intent, context, answers: {} });

    expect(coachingActions).toContainEqual(result);
  });
});
