import { describe, expect, test } from "vitest";
import {
  analyzeRestaurantOperations,
  validateRestaurantOperations,
} from "../src/domain/restaurant";

const emptyProfile = {
  seats: null,
  hallHours: null,
  peakOccupancy: null,
  averagePartySize: null,
  averageStayBand: null,
  channelShares: {
    dineIn: null,
    takeout: null,
    delivery: null,
  },
} as const;

describe("restaurant operations", () => {
  test("keeps a fully empty profile valid and capacity-insufficient", () => {
    expect(validateRestaurantOperations(emptyProfile)).toEqual([]);
    expect(analyzeRestaurantOperations(emptyProfile, 12)).toEqual({
      status: "insufficient",
      requiredPartiesPerDay: null,
      theoreticalTurns: null,
    });
  });

  test("derives available status, daily parties, and theoretical turns", () => {
    expect(
      analyzeRestaurantOperations(
        {
          ...emptyProfile,
          seats: 32,
          hallHours: 8,
          peakOccupancy: "half",
          averagePartySize: 4,
          averageStayBand: "60_90",
        },
        12,
      ),
    ).toEqual({
      status: "available",
      requiredPartiesPerDay: 3,
      theoreticalTurns: { min: 5.3, max: 8 },
    });
  });

  test("marks a waiting peak as saturated", () => {
    expect(
      analyzeRestaurantOperations(
        { ...emptyProfile, peakOccupancy: "waiting" },
        12,
      ).status,
    ).toBe("saturated");
  });

  test("rejects complete channel shares that do not total 100 percent", () => {
    expect(
      validateRestaurantOperations({
        ...emptyProfile,
        channelShares: { dineIn: 60, takeout: 20, delivery: 10 },
      }),
    ).toContainEqual({
      field: "channelShares",
      message: "홀·포장·배달 비중의 합계를 100%로 맞춰주세요.",
    });
  });

  test("accepts partial channel shares", () => {
    expect(
      validateRestaurantOperations({
        ...emptyProfile,
        channelShares: { dineIn: 60, takeout: null, delivery: null },
      }),
    ).toEqual([]);
  });

  test("rejects invalid optional numeric values and channel share boundaries", () => {
    expect(
      validateRestaurantOperations({
        ...emptyProfile,
        seats: 0,
        hallHours: Number.NaN,
        averagePartySize: Number.POSITIVE_INFINITY,
        channelShares: { dineIn: -1, takeout: 101, delivery: Number.NaN },
      }),
    ).toEqual([
      {
        field: "seats",
        message: "0보다 큰 숫자를 입력해주세요.",
      },
      {
        field: "hallHours",
        message: "0보다 큰 숫자를 입력해주세요.",
      },
      {
        field: "averagePartySize",
        message: "0보다 큰 숫자를 입력해주세요.",
      },
      {
        field: "dineIn",
        message: "비중은 0~100 사이로 입력해주세요.",
      },
      {
        field: "takeout",
        message: "비중은 0~100 사이로 입력해주세요.",
      },
      {
        field: "delivery",
        message: "비중은 0~100 사이로 입력해주세요.",
      },
    ]);
  });
});
