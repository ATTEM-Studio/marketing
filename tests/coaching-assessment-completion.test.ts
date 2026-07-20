import { describe, expect, it } from "vitest";
import { isCompletedPersistedAssessment } from "../api/_lib/supabase-admin";

const completeRow = {
  input_data: {
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
      seats: null,
      hallHours: null,
      peakOccupancy: null,
      averagePartySize: null,
      averageStayBand: null,
      channelShares: { dineIn: null, takeout: null, delivery: null },
    },
    primaryConcern: "customers",
    capacity: "yes",
    returningDataStatus: "unknown",
    hasConsentDb: false,
    canChangeMenu: true,
    adsRunning: false,
    adAttributionKnown: false,
  },
  calculated_metrics: {
    shortfallRevenue: 2_000_000,
    maxNewCustomers: 100,
    maxNewCustomersPerDay: 4,
    monthlyCustomerCount: 400,
    customerCountSource: "actual",
    targetReached: false,
    newCustomerTarget: 50,
    advertising: {
      status: "needs_measurement",
      newCustomerTarget: 50,
      requiredClicks: null,
      estimatedAdSpend: null,
      customerAcquisitionCost: null,
    },
    restaurant: {
      status: "insufficient",
      requiredPartiesPerDay: null,
      theoreticalTurns: null,
    },
  },
  diagnosis: {
    bottleneck: {
      key: null,
      status: "insufficient",
      changeRate: null,
      reason: "not enough observations",
    },
    actionKey: "local-discovery",
    effectiveCapacity: "yes",
  },
};

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

  it("accepts the assessment contract saved by the app", () => {
    expect(
      isCompletedPersistedAssessment(completeRow, {
        target_revenue: 10_000_000,
      }),
    ).toBe(true);
  });
});
