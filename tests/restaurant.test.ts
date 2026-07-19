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
      message: "?쨌?ъ옣쨌諛곕떖 鍮꾩쨷???⑷퀎瑜?100%濡?留욎떠二쇱꽭??",
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
        message: "0蹂대떎 ???レ옄瑜??낅젰?댁＜?몄슂.",
      },
      {
        field: "hallHours",
        message: "0蹂대떎 ???レ옄瑜??낅젰?댁＜?몄슂.",
      },
      {
        field: "averagePartySize",
        message: "0蹂대떎 ???レ옄瑜??낅젰?댁＜?몄슂.",
      },
      {
        field: "dineIn",
        message: "鍮꾩쨷? 0~100 ?ъ씠濡??낅젰?댁＜?몄슂.",
      },
      {
        field: "takeout",
        message: "鍮꾩쨷? 0~100 ?ъ씠濡??낅젰?댁＜?몄슂.",
      },
      {
        field: "delivery",
        message: "鍮꾩쨷? 0~100 ?ъ씠濡??낅젰?댁＜?몄슂.",
      },
    ]);
  });
});
