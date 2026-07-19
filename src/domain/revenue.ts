import type { FieldError, RevenueInputs, RevenueMetrics } from "./types";

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
