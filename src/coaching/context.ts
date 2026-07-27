import type { CoachingContext } from "./types.js";

type DataRecord = Record<string, unknown>;

export interface CoachingAssessmentRecord {
  id: string;
  inputs?: DataRecord;
  metrics?: DataRecord;
  diagnosis?: DataRecord;
  createdAt?: unknown;
}

export interface CoachingGoalRecord {
  targetRevenue?: unknown;
  target_revenue?: unknown;
}

export interface CoachingRecommendationRecord {
  adsRunning?: unknown;
  adAttributionKnown?: unknown;
}

export interface CoachingPlanRecord {
  actionKey?: unknown;
  action_key?: unknown;
  status?: unknown;
}

export interface CoachingContextSource {
  assessment: CoachingAssessmentRecord;
  goal?: CoachingGoalRecord | null;
  store?: DataRecord | null;
  recommendation?: CoachingRecommendationRecord | null;
  completedPlans?: readonly CoachingPlanRecord[];
}

function data(value: unknown): DataRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as DataRecord)
    : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const result = numberOrNull(value);
    if (result !== null) return result;
  }
  return null;
}

export function buildCoachingContext(
  source: CoachingContextSource,
): CoachingContext {
  const inputs = data(source.assessment.inputs);
  const metrics = data(source.assessment.metrics);
  const diagnosis = data(source.assessment.diagnosis);
  const revenue = data(inputs.revenue);
  const restaurant = data(inputs.restaurant);
  const recommendation = source.recommendation ?? {};
  const returnStatus =
    diagnosis.returningDataStatus ?? inputs.returningDataStatus;
  const returnRate = firstNumber(
    diagnosis.returningCustomerRate,
    metrics.returningCustomerRate,
    inputs.returningCustomerRate,
  );
  const returningCustomerKnown =
    returnStatus === "known" || returnStatus === "sampled"
      ? returnRate !== null
      : returnRate !== null && returnStatus !== "unknown";

  return {
    assessmentId: source.assessment.id,
    targetRevenue: firstNumber(
      source.goal?.targetRevenue,
      source.goal?.target_revenue,
      revenue.targetMonthlyRevenue,
    ),
    averageOrderValue: firstNumber(revenue.averageOrderValue),
    currentCustomerCount: firstNumber(revenue.monthlyCustomerCount),
    requiredCustomerCount: firstNumber(
      metrics.maxNewCustomers,
      metrics.requiredCustomerCount,
    ),
    returningCustomerKnown,
    returningCustomerRate: returningCustomerKnown ? returnRate : null,
    advertisingActive:
      booleanOrNull(recommendation.adsRunning) ??
      booleanOrNull(inputs.adsRunning) ??
      booleanOrNull(diagnosis.adsRunning),
    advertisingConversionKnown:
      recommendation.adAttributionKnown === true ||
      inputs.adAttributionKnown === true ||
      diagnosis.adAttributionKnown === true,
    tableCount: firstNumber(restaurant.seats, inputs.tableCount),
    dailyTurnover: firstNumber(
      metrics.dailyTurnover,
      data(metrics.restaurant).dailyTurnover,
    ),
    completedActionKeys: (source.completedPlans ?? []).flatMap((plan) => {
      const actionKey = plan.actionKey ?? plan.action_key;
      return plan.status === "completed" && typeof actionKey === "string"
        ? [actionKey]
        : [];
    }),
  };
}
