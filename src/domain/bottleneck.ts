import type {
  BottleneckInputs,
  BottleneckKey,
  BottleneckResult,
  ComparableMetric,
} from "./types";

const INSUFFICIENT_RESULT: BottleneckResult = {
  key: null,
  status: "insufficient",
  changeRate: null,
  reason: "비교할 이전 기간 수치가 부족해 병목을 단정하지 않았습니다.",
};

function isFiniteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isComparable(
  metric: ComparableMetric,
): metric is ComparableMetric & { previous: number; current: number } {
  return (
    isFiniteNumber(metric.previous) &&
    isFiniteNumber(metric.current) &&
    metric.previous > 0 &&
    metric.current >= 0
  );
}

export function selectBottleneck(input: BottleneckInputs): BottleneckResult {
  const keys: readonly BottleneckKey[] = [
    "exposure",
    "click",
    "visit",
    "averageOrderValue",
    "returning",
  ];
  const rates = keys
    .filter(
      (key) => key !== "returning" || input.returningDataStatus === "known",
    )
    .flatMap((key) => {
      const metric = input[key];
      return isComparable(metric)
        ? [
            {
              key,
              changeRate: (metric.current - metric.previous) / metric.previous,
            },
          ]
        : [];
    })
    .sort((left, right) => left.changeRate - right.changeRate);

  const lowest = rates[0];
  if (!lowest) return INSUFFICIENT_RESULT;

  if (lowest.changeRate >= 0) {
    return {
      key: null,
      status: "stable",
      changeRate: lowest.changeRate,
      reason: "비교 가능한 핵심 수치에서 감소 구간을 찾지 못했습니다.",
    };
  }

  return {
    key: lowest.key,
    status: "known",
    changeRate: lowest.changeRate,
    reason: "비교 가능한 핵심 수치에서 가장 큰 감소 구간을 확인했습니다.",
  };
}
