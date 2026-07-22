import { describe, expect, it } from "vitest";
import {
  allocationNewCustomerTarget,
  calculateAdvertisingMetrics,
  calculateRevenueMetrics,
  normalizeGoalAllocation,
} from "../src/domain/revenue";
import { selectBottleneck } from "../src/domain/bottleneck";
import {
  analyzeRestaurantOperations,
  resolveEffectiveCapacity,
} from "../src/domain/restaurant";
import { selectAction } from "../src/domain/recommendation";
import type { DiagnosisInput } from "../src/ui/diagnosis";
import { isCompletedPersistedAssessment } from "../api/_lib/supabase-admin";

const inputs: DiagnosisInput = {
  revenue: {
    averageMonthlyRevenue: 8_000_000,
    targetMonthlyRevenue: 10_000_000,
    averageOrderValue: 20_000,
    operatingDays: 25,
    monthlyCustomerCount: 400,
    monthlyCustomerCountStatus: "exact",
  },
  allocation: {
    newCustomerRevenue: 1_000_000,
    returningCustomerRevenue: 500_000,
    averageOrderValueRevenue: 500_000,
  },
  advertising: {
    visitConversionRate: null,
    costPerClick: null,
    actualAdNewCustomers: null,
    actualAdSpend: null,
  },
  bottleneck: {
    exposure: { previous: null, current: null },
    click: { previous: null, current: null },
    visit: { previous: null, current: null },
    averageOrderValue: { previous: null, current: null },
    returning: { previous: null, current: null },
    returningDataStatus: "unknown",
  },
  restaurant: {
    seats: 20,
    hallHours: 10,
    peakOccupancy: "half",
    averagePartySize: 2,
    averageStayBand: "60_90",
    channelShares: { dineIn: 60, takeout: 20, delivery: 20 },
  },
  primaryConcern: "customers",
  capacity: "yes",
  returningDataStatus: "unknown",
  hasConsentDb: false,
  canChangeMenu: true,
  adsRunning: false,
  adAttributionKnown: false,
};

function authenticSavedSnapshot() {
  const revenueMetrics = calculateRevenueMetrics(inputs.revenue);
  const allocation = normalizeGoalAllocation(inputs.allocation);
  const newCustomerTarget = allocationNewCustomerTarget(
    revenueMetrics.maxNewCustomers,
    inputs.revenue.averageOrderValue,
    allocation,
  );
  const advertising = calculateAdvertisingMetrics(
    newCustomerTarget,
    inputs.advertising,
  );
  const bottleneck = selectBottleneck(inputs.bottleneck);
  const restaurant = analyzeRestaurantOperations(
    inputs.restaurant,
    revenueMetrics.maxNewCustomersPerDay,
  );
  const effectiveCapacity = resolveEffectiveCapacity(
    inputs.capacity,
    restaurant.status,
  );
  const action = selectAction({
    ...inputs,
    capacity: effectiveCapacity,
    metrics: revenueMetrics,
    bottleneck,
  });
  return {
    input_data: { ...inputs, allocation },
    calculated_metrics: {
      ...revenueMetrics,
      newCustomerTarget,
      advertising,
      restaurant,
    },
    diagnosis: {
      bottleneck,
      actionKey: action.key,
      effectiveCapacity,
    },
  };
}

const goal = { target_revenue: inputs.revenue.targetMonthlyRevenue };

describe("persisted assessment completion", () => {
  it("rejects placeholder JSON objects", () => {
    expect(
      isCompletedPersistedAssessment({
        input_data: { x: 1 },
        calculated_metrics: { x: 1 },
        diagnosis: { x: 1 },
      }),
    ).toBe(false);
  });

  it("accepts an authentic snapshot produced by the app domain pipeline", () => {
    expect(isCompletedPersistedAssessment(authenticSavedSnapshot(), goal)).toBe(
      true,
    );
  });

  it.each([
    [
      "allocation sum",
      (row: ReturnType<typeof authenticSavedSnapshot>) => {
        row.input_data.allocation.newCustomerRevenue = 900_000;
      },
    ],
    [
      "new customer target",
      (row: ReturnType<typeof authenticSavedSnapshot>) => {
        row.calculated_metrics.newCustomerTarget = 99;
      },
    ],
    [
      "advertising metrics",
      (row: ReturnType<typeof authenticSavedSnapshot>) => {
        row.calculated_metrics.advertising = {
          ...row.calculated_metrics.advertising,
          status: "measured",
        } as typeof row.calculated_metrics.advertising;
      },
    ],
    [
      "restaurant turns",
      (row: ReturnType<typeof authenticSavedSnapshot>) => {
        row.calculated_metrics.restaurant = {
          ...row.calculated_metrics.restaurant,
          theoreticalTurns: { min: 9, max: 3 },
        };
      },
    ],
    [
      "diagnosis action",
      (row: ReturnType<typeof authenticSavedSnapshot>) => {
        row.diagnosis.actionKey = "profit-review";
      },
    ],
    [
      "effective capacity",
      (row: ReturnType<typeof authenticSavedSnapshot>) => {
        row.diagnosis.effectiveCapacity = "no";
      },
    ],
  ])("rejects a shape-valid snapshot with forged %s", (_label, tamper) => {
    const row = authenticSavedSnapshot();
    tamper(row);

    expect(isCompletedPersistedAssessment(row, goal)).toBe(false);
  });
});
