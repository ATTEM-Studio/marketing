import { describe, expect, test } from "vitest";
import {
  calculateRevenueMetrics,
  validateRevenueInputs,
} from "../src/domain/revenue";

const base = {
  averageMonthlyRevenue: 30_000_000,
  targetMonthlyRevenue: 40_000_000,
  averageOrderValue: 25_000,
  operatingDays: 20,
  monthlyCustomerCount: null,
} as const;

describe("revenue goal calculation", () => {
  test("calculates the all-new-customer upper bound", () => {
    expect(calculateRevenueMetrics(base)).toEqual({
      shortfallRevenue: 10_000_000,
      maxNewCustomers: 400,
      maxNewCustomersPerDay: 20,
      monthlyCustomerCount: 1200,
      customerCountSource: "estimated",
      targetReached: false,
    });
  });

  test("uses an actual customer count when provided", () => {
    expect(
      calculateRevenueMetrics({ ...base, monthlyCustomerCount: 980 })
        .monthlyCustomerCount,
    ).toBe(980);
    expect(
      calculateRevenueMetrics({ ...base, monthlyCustomerCount: 980 })
        .customerCountSource,
    ).toBe("actual");
  });

  test("does not return a negative shortfall after reaching target", () => {
    const result = calculateRevenueMetrics({
      ...base,
      averageMonthlyRevenue: 45_000_000,
    });
    expect(result.shortfallRevenue).toBe(0);
    expect(result.maxNewCustomers).toBe(0);
    expect(result.targetReached).toBe(true);
  });

  test("rounds up all-new-customer need and daily ceiling", () => {
    expect(
      calculateRevenueMetrics({
        ...base,
        targetMonthlyRevenue: 40_000_001,
      }),
    ).toMatchObject({
      shortfallRevenue: 10_000_001,
      maxNewCustomers: 401,
      maxNewCustomersPerDay: 21,
    });
  });

  test("treats matching current and target revenue as reached", () => {
    expect(
      calculateRevenueMetrics({
        ...base,
        targetMonthlyRevenue: base.averageMonthlyRevenue,
      }),
    ).toMatchObject({
      shortfallRevenue: 0,
      maxNewCustomers: 0,
      maxNewCustomersPerDay: 0,
      targetReached: true,
    });
  });

  test("returns field errors instead of dividing by zero", () => {
    expect(
      validateRevenueInputs({
        ...base,
        averageOrderValue: 0,
        operatingDays: 0,
      }),
    ).toEqual([
      {
        field: "averageOrderValue",
        message: "평균 객단가를 1원 이상 입력해 주세요.",
      },
      {
        field: "operatingDays",
        message: "월 영업일을 1일 이상 입력해 주세요.",
      },
    ]);
  });
});
