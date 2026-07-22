import { describe, expect, test } from "vitest";
import { selectBottleneck } from "../src/domain/bottleneck";

const metric = (previous: number | null, current: number | null) => ({
  previous,
  current,
});

describe("bottleneck evidence", () => {
  test("selects the largest decline from comparable store data", () => {
    const result = selectBottleneck({
      exposure: metric(10_000, 9_000),
      click: metric(1_000, 700),
      visit: metric(200, 190),
      averageOrderValue: metric(25_000, 26_000),
      returning: metric(80, 40),
      returningDataStatus: "unknown",
    });
    expect(result).toMatchObject({
      key: "click",
      status: "known",
      changeRate: -0.3,
    });
  });

  test("excludes returning visits when the customer identity is unknown", () => {
    const result = selectBottleneck({
      exposure: metric(10_000, 9_500),
      click: metric(null, null),
      visit: metric(null, null),
      averageOrderValue: metric(25_000, 24_000),
      returning: metric(100, 20),
      returningDataStatus: "unknown",
    });
    expect(result.key).toBe("exposure");
  });

  test("does not invent a bottleneck without comparable values", () => {
    const result = selectBottleneck({
      exposure: metric(null, null),
      click: metric(null, null),
      visit: metric(null, null),
      averageOrderValue: metric(null, 25_000),
      returning: metric(null, null),
      returningDataStatus: "unknown",
    });
    expect(result).toEqual({
      key: null,
      status: "insufficient",
      changeRate: null,
      reason: "비교할 이전 기간 수치가 부족해 병목을 단정하지 않았습니다.",
    });
  });
});
