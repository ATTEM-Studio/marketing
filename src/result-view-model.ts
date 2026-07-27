import { isCompletedPersistedAssessment } from "./coaching/completion";
import { selectBottleneck } from "./domain/bottleneck";
import { selectAction } from "./domain/recommendation";
import {
  analyzeRestaurantOperations,
  resolveEffectiveCapacity,
} from "./domain/restaurant";
import {
  allocationNewCustomerTarget,
  calculateAdvertisingMetrics,
  calculateRevenueMetrics,
  normalizeGoalAllocation,
} from "./domain/revenue";
import type { AssessmentSnapshot } from "./services/contracts";
import type { DiagnosisInput } from "./ui/diagnosis";
import type { ResultViewModel } from "./ui/result";

export interface DiagnosisOutcome {
  model: ResultViewModel;
  persistedMetrics: Record<string, unknown>;
  persistedDiagnosis: Record<string, unknown>;
}

function hasValue(values: readonly unknown[]): boolean {
  return values.some((value) => value !== null);
}

export function buildDiagnosisOutcome(input: DiagnosisInput): DiagnosisOutcome {
  const metrics = calculateRevenueMetrics(input.revenue);
  const allocation = normalizeGoalAllocation(input.allocation);
  const newCustomerTarget = allocationNewCustomerTarget(
    metrics.maxNewCustomers,
    input.revenue.averageOrderValue,
    allocation,
  );
  const advertising = calculateAdvertisingMetrics(
    newCustomerTarget,
    input.advertising,
  );
  const bottleneck = selectBottleneck(input.bottleneck);
  const restaurant = analyzeRestaurantOperations(
    input.restaurant,
    metrics.maxNewCustomersPerDay,
  );
  const effectiveCapacity = resolveEffectiveCapacity(
    input.capacity,
    restaurant.status,
  );
  const action = selectAction({
    ...input,
    capacity: effectiveCapacity,
    metrics,
    bottleneck,
  });
  const hasAdvertisingInputs = hasValue(Object.values(input.advertising));
  const hasRestaurantInputs = hasValue([
    input.restaurant.seats,
    input.restaurant.hallHours,
    input.restaurant.peakOccupancy,
    input.restaurant.averagePartySize,
    input.restaurant.averageStayBand,
    input.restaurant.channelShares.dineIn,
    input.restaurant.channelShares.takeout,
    input.restaurant.channelShares.delivery,
  ]);
  const model: ResultViewModel = {
    effectiveCapacity,
    metrics,
    allocation,
    ...(input.adsRunning || hasAdvertisingInputs
      ? { advertising, advertisingInputs: input.advertising }
      : {}),
    ...(hasRestaurantInputs ? { restaurant } : {}),
    bottleneck,
    action,
  };

  return {
    model,
    persistedMetrics: {
      ...metrics,
      newCustomerTarget,
      advertising,
      restaurant,
    },
    persistedDiagnosis: {
      bottleneck,
      actionKey: action.key,
      effectiveCapacity,
    },
  };
}

function restoredInput(assessment: AssessmentSnapshot): DiagnosisInput {
  const input = assessment.inputs as unknown as DiagnosisInput;
  const allocation =
    input.allocation &&
    Object.keys(input.allocation as unknown as Record<string, unknown>).length >
      0
      ? input.allocation
      : {
          newCustomerRevenue: null,
          returningCustomerRevenue: null,
          averageOrderValueRevenue: null,
        };
  return { ...input, allocation };
}

export function restoreResultViewModel(
  assessment: AssessmentSnapshot,
): ResultViewModel | null {
  const completed = isCompletedPersistedAssessment(
    {
      input_data: assessment.inputs,
      calculated_metrics: assessment.metrics,
      diagnosis: assessment.diagnosis,
    },
    { target_revenue: assessment.goalTargetRevenue },
  );
  if (!completed) return null;

  try {
    return buildDiagnosisOutcome(restoredInput(assessment)).model;
  } catch {
    return null;
  }
}
