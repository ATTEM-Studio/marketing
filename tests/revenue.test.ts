import { describe, expect, test } from "vitest";
import {
  calculateAdvertisingMetrics,
  calculateRevenueMetrics,
  normalizeGoalAllocation,
  validateAdvertisingInputs,
  validateGoalAllocation,
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

  test("keeps the all-new ceiling when no revenue allocation is entered", () => {
    const allocation = {
      newCustomerRevenue: null,
      returningCustomerRevenue: null,
      averageOrderValueRevenue: null,
    };

    expect(validateGoalAllocation(allocation, 10_000_000)).toEqual([]);
    expect(normalizeGoalAllocation(allocation)).toEqual({});
  });

  test("accepts only a direct allocation whose amounts exactly cover the shortfall", () => {
    const allocation = {
      newCustomerRevenue: 6_000_000,
      returningCustomerRevenue: 2_000_000,
      averageOrderValueRevenue: 2_000_000,
    };

    expect(validateGoalAllocation(allocation, 10_000_000)).toEqual([]);
    expect(normalizeGoalAllocation(allocation)).toEqual(allocation);
    expect(
      validateGoalAllocation(
        { ...allocation, returningCustomerRevenue: 1_999_999 },
        10_000_000,
      ),
    ).toContainEqual({
      field: "allocation",
      message: "세 항목의 합계가 부족 매출과 같아야 합니다.",
    });
  });

  test("rejects invalid direct allocation boundaries and permits only zero at target", () => {
    expect(
      validateGoalAllocation(
        {
          newCustomerRevenue: -1,
          returningCustomerRevenue: 0,
          averageOrderValueRevenue: 10_000_001,
        },
        10_000_000,
      ),
    ).toContainEqual({
      field: "newCustomerRevenue",
      message: "신규 고객 증가 매출은 0원 이상이어야 합니다.",
    });
    expect(
      validateGoalAllocation(
        {
          newCustomerRevenue: 1,
          returningCustomerRevenue: 0,
          averageOrderValueRevenue: 0,
        },
        0,
      ),
    ).toContainEqual({
      field: "allocation",
      message: "목표를 달성한 경우 분배 합계는 0원이어야 합니다.",
    });
    expect(
      normalizeGoalAllocation({
        newCustomerRevenue: 0,
        returningCustomerRevenue: 0,
        averageOrderValueRevenue: 0,
      }),
    ).toEqual({
      newCustomerRevenue: 0,
      returningCustomerRevenue: 0,
      averageOrderValueRevenue: 0,
    });
  });

  test("calculates advertising estimates only from all three actual inputs", () => {
    expect(
      calculateAdvertisingMetrics(400, {
        visitConversionRate: 0.2,
        costPerClick: 500,
        actualAdNewCustomers: 50,
      }),
    ).toEqual({
      status: "measured",
      newCustomerTarget: 400,
      requiredClicks: 2000,
      estimatedAdSpend: 1_000_000,
      customerAcquisitionCost: 20_000,
    });
    expect(
      calculateAdvertisingMetrics(400, {
        visitConversionRate: 0.2,
        costPerClick: 500,
        actualAdNewCustomers: null,
      }),
    ).toEqual({
      status: "needs_measurement",
      newCustomerTarget: 400,
      requiredClicks: null,
      estimatedAdSpend: null,
      customerAcquisitionCost: null,
    });
  });

  test("validates advertising input boundaries without treating blanks as measurements", () => {
    expect(
      validateAdvertisingInputs({
        visitConversionRate: null,
        costPerClick: null,
        actualAdNewCustomers: null,
      }),
    ).toEqual([]);
    expect(
      validateAdvertisingInputs({
        visitConversionRate: 0,
        costPerClick: -1,
        actualAdNewCustomers: 0,
      }),
    ).toEqual([
      {
        field: "visitConversionRate",
        message: "실제 방문 전환율은 0%보다 크고 100% 이하여야 합니다.",
      },
      {
        field: "costPerClick",
        message: "실제 평균 클릭 비용은 0원 이상이어야 합니다.",
      },
      {
        field: "actualAdNewCustomers",
        message: "광고 유입 실제 신규 고객 수는 1명 이상이어야 합니다.",
      },
    ]);
  });
});
