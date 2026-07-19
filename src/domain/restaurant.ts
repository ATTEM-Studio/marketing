import type {
  FieldError,
  RestaurantCapacityStatus,
  RestaurantOperationsInsight,
  RestaurantOperationsInput,
} from "./types";

const positiveNumberMessage = "0蹂대떎 ???レ옄瑜??낅젰?댁＜?몄슂.";
const shareMessage = "鍮꾩쨷? 0~100 ?ъ씠濡??낅젰?댁＜?몄슂.";

const stayRanges = {
  under_30: { min: 20, max: 30 },
  "30_60": { min: 30, max: 60 },
  "60_90": { min: 60, max: 90 },
  over_90: { min: 90, max: 120 },
} as const;

function isFiniteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function capacityStatus(
  occupancy: RestaurantOperationsInput["peakOccupancy"],
): RestaurantCapacityStatus {
  if (occupancy === "spacious" || occupancy === "half") return "available";
  if (occupancy === "almost_full") return "time_limited";
  if (occupancy === "waiting") return "saturated";
  return "insufficient";
}

export function validateRestaurantOperations(
  input: RestaurantOperationsInput,
): FieldError[] {
  const errors: FieldError[] = [];
  const positiveFields = ["seats", "hallHours", "averagePartySize"] as const;

  positiveFields.forEach((field) => {
    const value = input[field];
    if (value !== null && (!isFiniteNumber(value) || value <= 0)) {
      errors.push({ field, message: positiveNumberMessage });
    }
  });

  const channelFields = ["dineIn", "takeout", "delivery"] as const;
  channelFields.forEach((field) => {
    const value = input.channelShares[field];
    if (value !== null && (!isFiniteNumber(value) || value < 0 || value > 100)) {
      errors.push({ field, message: shareMessage });
    }
  });

  const { dineIn, takeout, delivery } = input.channelShares;
  if (
    isFiniteNumber(dineIn) &&
    isFiniteNumber(takeout) &&
    isFiniteNumber(delivery) &&
    dineIn + takeout + delivery !== 100
  ) {
    errors.push({
      field: "channelShares",
      message: "?쨌?ъ옣쨌諛곕떖 鍮꾩쨷???⑷퀎瑜?100%濡?留욎떠二쇱꽭??",
    });
  }

  return errors;
}

export function analyzeRestaurantOperations(
  input: RestaurantOperationsInput,
  requiredCustomersPerDay: number,
): RestaurantOperationsInsight {
  const requiredPartiesPerDay =
    isFiniteNumber(input.averagePartySize) && input.averagePartySize > 0
      ? Math.ceil(requiredCustomersPerDay / input.averagePartySize)
      : null;
  const stayRange =
    input.averageStayBand === null || input.averageStayBand === "unknown"
      ? null
      : stayRanges[input.averageStayBand];
  const theoreticalTurns =
    isFiniteNumber(input.hallHours) && input.hallHours > 0 && stayRange !== null
      ? {
          min: roundToOneDecimal((input.hallHours * 60) / stayRange.max),
          max: roundToOneDecimal((input.hallHours * 60) / stayRange.min),
        }
      : null;

  return {
    status: capacityStatus(input.peakOccupancy),
    requiredPartiesPerDay,
    theoreticalTurns,
  };
}
