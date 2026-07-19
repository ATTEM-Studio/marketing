import type {
  AdvertisingInputs,
  AdvertisingMetrics,
  FieldError,
  GoalAllocation,
  GoalAllocationInput,
  RevenueInputs,
  RevenueMetrics,
} from "./types";

const allocationFields = [
  {
    key: "newCustomerRevenue",
    message: "신규 고객 증가 매출은 0원 이상이어야 합니다.",
  },
  {
    key: "returningCustomerRevenue",
    message: "재방문 증가 매출은 0원 이상이어야 합니다.",
  },
  {
    key: "averageOrderValueRevenue",
    message: "객단가 상승 매출은 0원 이상이어야 합니다.",
  },
] as const;

function isFiniteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateRevenueInputs(input: RevenueInputs): FieldError[] {
  const errors: FieldError[] = [];

  if (input.averageMonthlyRevenue < 0) {
    errors.push({
      field: "averageMonthlyRevenue",
      message: "최근 월평균 매출은 0원 이상이어야 합니다.",
    });
  }
  if (input.targetMonthlyRevenue <= 0) {
    errors.push({
      field: "targetMonthlyRevenue",
      message: "목표 월 매출을 1원 이상 입력해 주세요.",
    });
  }
  if (input.averageOrderValue <= 0) {
    errors.push({
      field: "averageOrderValue",
      message: "평균 객단가를 1원 이상 입력해 주세요.",
    });
  }
  if (input.operatingDays <= 0) {
    errors.push({
      field: "operatingDays",
      message: "월 영업일을 1일 이상 입력해 주세요.",
    });
  }
  if (input.monthlyCustomerCount !== null && input.monthlyCustomerCount <= 0) {
    errors.push({
      field: "monthlyCustomerCount",
      message: "월 고객 수는 1명 이상 입력하거나 모름을 선택해 주세요.",
    });
  }

  return errors;
}

export function calculateRevenueMetrics(input: RevenueInputs): RevenueMetrics {
  const errors = validateRevenueInputs(input);
  if (errors.length > 0) {
    throw new TypeError(errors.map((error) => error.message).join(" "));
  }

  const shortfallRevenue = Math.max(
    input.targetMonthlyRevenue - input.averageMonthlyRevenue,
    0,
  );
  const maxNewCustomers = Math.ceil(shortfallRevenue / input.averageOrderValue);
  const actualCount = input.monthlyCustomerCount;

  return {
    shortfallRevenue,
    maxNewCustomers,
    maxNewCustomersPerDay: Math.ceil(maxNewCustomers / input.operatingDays),
    monthlyCustomerCount:
      actualCount ??
      Math.ceil(input.averageMonthlyRevenue / input.averageOrderValue),
    customerCountSource: actualCount === null ? "estimated" : "actual",
    targetReached: input.averageMonthlyRevenue >= input.targetMonthlyRevenue,
  };
}

export function validateGoalAllocation(
  input: GoalAllocationInput,
  shortfallRevenue: number,
): FieldError[] {
  const errors: FieldError[] = [];
  const hasAllocation = allocationFields.some(({ key }) => input[key] !== null);
  if (!hasAllocation) return errors;

  allocationFields.forEach(({ key, message }) => {
    const value = input[key];
    if (value !== null && (!isFiniteNumber(value) || value < 0)) {
      errors.push({ field: key, message });
    }
  });
  if (errors.length > 0) return errors;

  const total = allocationFields.reduce(
    (sum, { key }) => sum + (input[key] ?? 0),
    0,
  );
  if (shortfallRevenue === 0 && total !== 0) {
    errors.push({
      field: "allocation",
      message: "목표를 달성한 경우 분배 합계는 0원이어야 합니다.",
    });
  } else if (total !== shortfallRevenue) {
    errors.push({
      field: "allocation",
      message: "세 항목의 합계가 부족 매출과 같아야 합니다.",
    });
  }
  return errors;
}

export function normalizeGoalAllocation(
  input: GoalAllocationInput,
): GoalAllocation | Record<string, never> {
  const hasAllocation = allocationFields.some(({ key }) => input[key] !== null);
  if (!hasAllocation) return {};
  return {
    newCustomerRevenue: input.newCustomerRevenue ?? 0,
    returningCustomerRevenue: input.returningCustomerRevenue ?? 0,
    averageOrderValueRevenue: input.averageOrderValueRevenue ?? 0,
  };
}

export function allocationNewCustomerTarget(
  maximumNewCustomers: number,
  averageOrderValue: number,
  allocation: GoalAllocation | Record<string, never>,
): number {
  if (!("newCustomerRevenue" in allocation)) return maximumNewCustomers;
  return Math.ceil(allocation.newCustomerRevenue / averageOrderValue);
}

export function validateAdvertisingInputs(
  input: AdvertisingInputs,
): FieldError[] {
  const errors: FieldError[] = [];
  if (
    input.visitConversionRate !== null &&
    (!isFiniteNumber(input.visitConversionRate) ||
      input.visitConversionRate <= 0 ||
      input.visitConversionRate > 1)
  ) {
    errors.push({
      field: "visitConversionRate",
      message: "실제 방문 전환율은 0%보다 크고 100% 이하여야 합니다.",
    });
  }
  if (
    input.costPerClick !== null &&
    (!isFiniteNumber(input.costPerClick) || input.costPerClick < 0)
  ) {
    errors.push({
      field: "costPerClick",
      message: "실제 평균 클릭 비용은 0원 이상이어야 합니다.",
    });
  }
  if (
    input.actualAdNewCustomers !== null &&
    (!isFiniteNumber(input.actualAdNewCustomers) ||
      input.actualAdNewCustomers < 1)
  ) {
    errors.push({
      field: "actualAdNewCustomers",
      message: "광고 유입 실제 신규 고객 수는 1명 이상이어야 합니다.",
    });
  }
  return errors;
}

export function calculateAdvertisingMetrics(
  newCustomerTarget: number,
  input: AdvertisingInputs,
): AdvertisingMetrics {
  const { visitConversionRate, costPerClick, actualAdNewCustomers } = input;
  if (
    visitConversionRate === null ||
    costPerClick === null ||
    actualAdNewCustomers === null ||
    validateAdvertisingInputs(input).length > 0
  ) {
    return {
      status: "needs_measurement",
      newCustomerTarget,
      requiredClicks: null,
      estimatedAdSpend: null,
      customerAcquisitionCost: null,
    };
  }

  const requiredClicks = Math.ceil(newCustomerTarget / visitConversionRate);
  const estimatedAdSpend = requiredClicks * costPerClick;
  return {
    status: "measured",
    newCustomerTarget,
    requiredClicks,
    estimatedAdSpend,
    customerAcquisitionCost: estimatedAdSpend / actualAdNewCustomers,
  };
}
