import { selectBottleneck } from "../domain/bottleneck.js";
import { selectAction } from "../domain/recommendation.js";
import {
  analyzeRestaurantOperations,
  resolveEffectiveCapacity,
  validateRestaurantOperations,
} from "../domain/restaurant.js";
import {
  allocationNewCustomerTarget,
  calculateAdvertisingMetrics,
  calculateRevenueMetrics,
  validateAdvertisingInputs,
  validateGoalAllocation,
} from "../domain/revenue.js";
import type {
  AdvertisingInputs,
  BottleneckInputs,
  Capacity,
  GoalAllocation,
  GoalAllocationInput,
  PrimaryConcern,
  RestaurantOperationsInput,
  ReturningDataStatus,
  RevenueInputs,
} from "../domain/types.js";

type Row = Record<string, unknown>;

function record(value: unknown): Row {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

function finite(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function oneOf(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

function nullableFinite(value: unknown): boolean {
  return value === null || finite(value);
}

function hasFields(value: Row, fields: readonly string[]): boolean {
  return fields.every((field) => Object.hasOwn(value, field));
}

function comparableMetric(value: unknown): boolean {
  const metric = record(value);
  return (
    hasFields(metric, ["previous", "current"]) &&
    nullableFinite(metric.previous) &&
    nullableFinite(metric.current)
  );
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEqual(value, right[index]))
    );
  }
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }
  const leftRecord = left as Row;
  const rightRecord = right as Row;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        jsonEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

export function isCompletedPersistedAssessment(
  row: Row,
  goalValue?: Row | null,
): boolean {
  const input = record(row.input_data);
  const revenue = record(input.revenue);
  const metrics = record(row.calculated_metrics);
  const diagnosis = record(row.diagnosis);
  const goal = record(goalValue);
  const allocation = record(input.allocation);
  const advertisingInput = record(input.advertising);
  const bottleneckInput = record(input.bottleneck);
  const restaurantInput = record(input.restaurant);
  const channelShares = record(restaurantInput.channelShares);
  const advertisingMetrics = record(metrics.advertising);
  const restaurantMetrics = record(metrics.restaurant);
  const diagnosisBottleneck = record(diagnosis.bottleneck);
  let expectedRevenueMetrics: ReturnType<typeof calculateRevenueMetrics>;
  try {
    expectedRevenueMetrics = calculateRevenueMetrics(
      revenue as unknown as RevenueInputs,
    );
  } catch {
    return false;
  }
  const allocationValid =
    Object.keys(allocation).length === 0 ||
    (hasFields(allocation, [
      "newCustomerRevenue",
      "returningCustomerRevenue",
      "averageOrderValueRevenue",
    ]) &&
      [
        allocation.newCustomerRevenue,
        allocation.returningCustomerRevenue,
        allocation.averageOrderValueRevenue,
      ].every((value) => finite(value) && (value as number) >= 0));
  const shapeValid =
    [
      revenue.averageMonthlyRevenue,
      revenue.targetMonthlyRevenue,
      revenue.averageOrderValue,
      revenue.operatingDays,
      metrics.shortfallRevenue,
      metrics.maxNewCustomers,
      metrics.maxNewCustomersPerDay,
      metrics.monthlyCustomerCount,
      metrics.newCustomerTarget,
      goal.target_revenue,
    ].every(finite) &&
    goal.target_revenue === revenue.targetMonthlyRevenue &&
    metrics.shortfallRevenue === expectedRevenueMetrics.shortfallRevenue &&
    metrics.maxNewCustomers === expectedRevenueMetrics.maxNewCustomers &&
    metrics.maxNewCustomersPerDay ===
      expectedRevenueMetrics.maxNewCustomersPerDay &&
    metrics.monthlyCustomerCount ===
      expectedRevenueMetrics.monthlyCustomerCount &&
    metrics.customerCountSource ===
      expectedRevenueMetrics.customerCountSource &&
    metrics.targetReached === expectedRevenueMetrics.targetReached &&
    (revenue.monthlyCustomerCount === null ||
      finite(revenue.monthlyCustomerCount)) &&
    oneOf(revenue.monthlyCustomerCountStatus, [
      "exact",
      "approximate",
      "unknown",
    ]) &&
    oneOf(input.primaryConcern, [
      "customers",
      "ads",
      "averageOrderValue",
      "returning",
      "unknown",
    ]) &&
    oneOf(input.capacity, ["yes", "sometimes", "no"]) &&
    oneOf(input.returningDataStatus, ["known", "sampled", "unknown"]) &&
    [
      input.hasConsentDb,
      input.canChangeMenu,
      input.adsRunning,
      input.adAttributionKnown,
      metrics.targetReached,
    ].every((value) => typeof value === "boolean") &&
    oneOf(metrics.customerCountSource, [
      "actual",
      "approximate",
      "estimated",
    ]) &&
    allocationValid &&
    hasFields(advertisingInput, [
      "visitConversionRate",
      "costPerClick",
      "actualAdNewCustomers",
      "actualAdSpend",
    ]) &&
    Object.values(advertisingInput).every(nullableFinite) &&
    ["exposure", "click", "visit", "averageOrderValue", "returning"].every(
      (key) => comparableMetric(bottleneckInput[key]),
    ) &&
    oneOf(bottleneckInput.returningDataStatus, [
      "known",
      "sampled",
      "unknown",
    ]) &&
    hasFields(restaurantInput, [
      "seats",
      "hallHours",
      "peakOccupancy",
      "averagePartySize",
      "averageStayBand",
      "channelShares",
    ]) &&
    [
      restaurantInput.seats,
      restaurantInput.hallHours,
      restaurantInput.averagePartySize,
      channelShares.dineIn,
      channelShares.takeout,
      channelShares.delivery,
    ].every(nullableFinite) &&
    (restaurantInput.peakOccupancy === null ||
      oneOf(restaurantInput.peakOccupancy, [
        "spacious",
        "half",
        "almost_full",
        "waiting",
      ])) &&
    (restaurantInput.averageStayBand === null ||
      oneOf(restaurantInput.averageStayBand, [
        "under_30",
        "30_60",
        "60_90",
        "over_90",
        "unknown",
      ])) &&
    hasFields(advertisingMetrics, [
      "status",
      "newCustomerTarget",
      "requiredClicks",
      "estimatedAdSpend",
      "customerAcquisitionCost",
    ]) &&
    oneOf(advertisingMetrics.status, ["measured", "needs_measurement"]) &&
    [
      advertisingMetrics.newCustomerTarget,
      advertisingMetrics.requiredClicks,
      advertisingMetrics.estimatedAdSpend,
      advertisingMetrics.customerAcquisitionCost,
    ].every(nullableFinite) &&
    hasFields(restaurantMetrics, [
      "status",
      "requiredPartiesPerDay",
      "theoreticalTurns",
    ]) &&
    oneOf(restaurantMetrics.status, [
      "available",
      "time_limited",
      "saturated",
      "insufficient",
    ]) &&
    nullableFinite(restaurantMetrics.requiredPartiesPerDay) &&
    (restaurantMetrics.theoreticalTurns === null ||
      hasFields(record(restaurantMetrics.theoreticalTurns), ["min", "max"])) &&
    oneOf(diagnosis.actionKey, [
      "profit-review",
      "average-order-value",
      "measure-acquisition-source",
      "returning-message",
      "off-peak-offer",
      "local-discovery",
    ]) &&
    hasFields(diagnosisBottleneck, ["key", "status", "changeRate", "reason"]) &&
    (diagnosisBottleneck.key === null ||
      oneOf(diagnosisBottleneck.key, [
        "exposure",
        "click",
        "visit",
        "averageOrderValue",
        "returning",
      ])) &&
    oneOf(diagnosisBottleneck.status, ["known", "stable", "insufficient"]) &&
    nullableFinite(diagnosisBottleneck.changeRate) &&
    typeof diagnosisBottleneck.reason === "string" &&
    oneOf(diagnosis.effectiveCapacity, ["yes", "sometimes", "no"]);
  if (!shapeValid) return false;

  const typedRevenue = revenue as unknown as RevenueInputs;
  const typedAdvertising = advertisingInput as unknown as AdvertisingInputs;
  const typedBottleneck = bottleneckInput as unknown as BottleneckInputs;
  const typedRestaurant =
    restaurantInput as unknown as RestaurantOperationsInput;
  const typedAllocation: GoalAllocation | Record<string, never> =
    Object.keys(allocation).length === 0
      ? {}
      : (allocation as unknown as GoalAllocation);
  const allocationForValidation: GoalAllocationInput =
    Object.keys(typedAllocation).length === 0
      ? {
          newCustomerRevenue: null,
          returningCustomerRevenue: null,
          averageOrderValueRevenue: null,
        }
      : (typedAllocation as GoalAllocation);
  if (
    validateGoalAllocation(
      allocationForValidation,
      expectedRevenueMetrics.shortfallRevenue,
    ).length > 0 ||
    validateAdvertisingInputs(typedAdvertising).length > 0 ||
    validateRestaurantOperations(typedRestaurant).length > 0 ||
    input.returningDataStatus !== bottleneckInput.returningDataStatus
  ) {
    return false;
  }

  const expectedNewCustomerTarget = allocationNewCustomerTarget(
    expectedRevenueMetrics.maxNewCustomers,
    typedRevenue.averageOrderValue,
    typedAllocation,
  );
  const expectedAdvertising = calculateAdvertisingMetrics(
    expectedNewCustomerTarget,
    typedAdvertising,
  );
  const expectedBottleneck = selectBottleneck(typedBottleneck);
  const expectedRestaurant = analyzeRestaurantOperations(
    typedRestaurant,
    expectedRevenueMetrics.maxNewCustomersPerDay,
  );
  const expectedCapacity = resolveEffectiveCapacity(
    input.capacity as Capacity,
    expectedRestaurant.status,
  );
  const expectedAction = selectAction({
    metrics: expectedRevenueMetrics,
    bottleneck: expectedBottleneck,
    primaryConcern: input.primaryConcern as PrimaryConcern,
    capacity: expectedCapacity,
    returningDataStatus: input.returningDataStatus as ReturningDataStatus,
    hasConsentDb: input.hasConsentDb as boolean,
    canChangeMenu: input.canChangeMenu as boolean,
    adsRunning: input.adsRunning as boolean,
    adAttributionKnown: input.adAttributionKnown as boolean,
  });

  return (
    jsonEqual(metrics, {
      ...expectedRevenueMetrics,
      newCustomerTarget: expectedNewCustomerTarget,
      advertising: expectedAdvertising,
      restaurant: expectedRestaurant,
    }) &&
    jsonEqual(diagnosis, {
      bottleneck: expectedBottleneck,
      actionKey: expectedAction.key,
      effectiveCapacity: expectedCapacity,
    })
  );
}
