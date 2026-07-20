import { selectBottleneck } from "../../src/domain/bottleneck";
import { selectAction } from "../../src/domain/recommendation";
import {
  analyzeRestaurantOperations,
  resolveEffectiveCapacity,
} from "../../src/domain/restaurant";
import {
  allocationNewCustomerTarget,
  calculateAdvertisingMetrics,
  calculateRevenueMetrics,
  normalizeGoalAllocation,
} from "../../src/domain/revenue";
import type { DiagnosisInput } from "../../src/ui/diagnosis";

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

export function createAuthenticAssessment(id = "completed-assessment") {
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
    id,
    inputs: { ...inputs, allocation },
    metrics: {
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
    createdAt: "2026-07-20T00:00:00.000Z",
  };
}
