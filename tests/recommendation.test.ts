import { describe, expect, test } from "vitest";
import { selectAction } from "../src/domain/recommendation";

const context = {
  metrics: {
    shortfallRevenue: 10_000_000,
    maxNewCustomers: 400,
    maxNewCustomersPerDay: 20,
    monthlyCustomerCount: 1200,
    customerCountSource: "estimated" as const,
    targetReached: false,
  },
  bottleneck: {
    key: null,
    status: "insufficient" as const,
    changeRate: null,
    reason: "비교할 이전 기간 수치가 부족해 병목을 단정하지 않았습니다.",
  },
  primaryConcern: "unknown" as const,
  capacity: "yes" as const,
  returningDataStatus: "unknown" as const,
  hasConsentDb: false,
  canChangeMenu: true,
  adsRunning: false,
  adAttributionKnown: false,
};

describe("single action selection", () => {
  test("uses the all-new count for scale but does not diagnose repeat visits", () => {
    expect(selectAction(context).key).toBe("local-discovery");
  });

  test("does not recommend more acquisition without capacity", () => {
    expect(selectAction({ ...context, capacity: "no" }).key).toBe(
      "average-order-value",
    );
  });

  test("asks for attribution before changing ad budget", () => {
    expect(
      selectAction({ ...context, primaryConcern: "ads", adsRunning: true }).key,
    ).toBe("measure-acquisition-source");
  });

  test("uses the single seven-day measurement action whenever live ads lack all actual data", () => {
    expect(
      selectAction({
        ...context,
        primaryConcern: "unknown",
        capacity: "no",
        adsRunning: true,
      }).key,
    ).toBe("measure-acquisition-source");
  });

  test("measures incomplete live ad attribution even after the revenue target is reached", () => {
    expect(
      selectAction({
        ...context,
        metrics: {
          ...context.metrics,
          targetReached: true,
          shortfallRevenue: 0,
          maxNewCustomers: 0,
          maxNewCustomersPerDay: 0,
        },
        adsRunning: true,
        adAttributionKnown: false,
      }).key,
    ).toBe("measure-acquisition-source");
  });

  test("does not recommend customer messages without consent", () => {
    expect(
      selectAction({
        ...context,
        primaryConcern: "returning",
        returningDataStatus: "known",
      }).key,
    ).not.toBe("returning-message");
  });

  test("protects profit after the target is reached", () => {
    expect(
      selectAction({
        ...context,
        metrics: {
          ...context.metrics,
          targetReached: true,
          shortfallRevenue: 0,
          maxNewCustomers: 0,
          maxNewCustomersPerDay: 0,
        },
      }).key,
    ).toBe("profit-review");
  });

  test("protects profit after the target is reached when live ad attribution is complete", () => {
    expect(
      selectAction({
        ...context,
        metrics: {
          ...context.metrics,
          targetReached: true,
          shortfallRevenue: 0,
          maxNewCustomers: 0,
          maxNewCustomersPerDay: 0,
        },
        adsRunning: true,
        adAttributionKnown: true,
      }).key,
    ).toBe("profit-review");
  });
});
