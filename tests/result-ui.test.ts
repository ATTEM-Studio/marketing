import { beforeEach, expect, test } from "vitest";
import { analyzeRestaurantOperations } from "../src/domain/restaurant";
import type {
  Capacity,
  RestaurantCapacityStatus,
  RestaurantOperationsInput,
  RestaurantOperationsInsight,
} from "../src/domain/types";
import { renderResult, type ResultViewModel } from "../src/ui/result";

const emptyRestaurant: RestaurantOperationsInput = {
  seats: null,
  hallHours: null,
  peakOccupancy: null,
  averagePartySize: null,
  averageStayBand: null,
  channelShares: { dineIn: null, takeout: null, delivery: null },
};

const baseModel: ResultViewModel = {
  effectiveCapacity: "yes",
  metrics: {
    shortfallRevenue: 10_000_000,
    maxNewCustomers: 400,
    maxNewCustomersPerDay: 20,
    monthlyCustomerCount: 1200,
    customerCountSource: "estimated",
    targetReached: false,
  },
  bottleneck: {
    key: null,
    status: "insufficient",
    changeRate: null,
    reason: "수치가 부족합니다.",
  },
  action: {
    key: "local-discovery",
    title: "대표 사진을 확인해요",
    reason: "지금 할 수 있어요.",
    steps: ["사진을 봐요", "한 장을 바꿔요", "길찾기를 적어요"],
    metric: "길찾기 수",
    avoid: "광고비를 먼저 늘리지 마세요.",
    minutes: 15,
    coachingKey: "revenue-before-ranking",
  },
};

function renderRestaurant(
  restaurant: RestaurantOperationsInsight,
  effectiveCapacity: Capacity = "yes",
) {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  renderResult(root, { ...baseModel, restaurant, effectiveCapacity });
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
});

test.each([
  ["available", "신규 고객 확보가 먼저입니다"],
  ["time_limited", "혼잡 시간대 운영"],
  ["saturated", "체류시간"],
  ["insufficient", "수용 여력은 단정하지 않았습니다"],
] as const)(
  "renders explicitly supplied %s restaurant guidance",
  (status: RestaurantCapacityStatus, expectedCopy) => {
    const root = renderRestaurant({
      status,
      requiredPartiesPerDay: null,
      theoreticalTurns: null,
    });

    expect(
      root.querySelector("[data-restaurant-insight]")?.textContent,
    ).toContain(expectedCopy);
  },
);

test.each([
  ["no", "추가 고객을 받기 어려운 운영 제약", "그 제약을 먼저 해결"],
  ["sometimes", "시간대에 따른 운영 제약", "제한적으로 시험"],
] as const)(
  "uses effective %s capacity when raw occupancy is available",
  (effectiveCapacity, constraintCopy, priorityCopy) => {
    const root = renderRestaurant(
      {
        status: "available",
        requiredPartiesPerDay: null,
        theoreticalTurns: null,
      },
      effectiveCapacity,
    );
    const copy =
      root.querySelector("[data-restaurant-insight]")?.textContent ?? "";

    expect(copy).toContain("좌석만 보면 여유가 있어 보이지만");
    expect(copy).toContain(constraintCopy);
    expect(copy).toContain(priorityCopy);
    expect(copy).not.toContain("신규 고객 확보가 먼저입니다");
  },
);

test("puts constrained-period work before acquisition for time-limited capacity", () => {
  const root = renderRestaurant(
    {
      status: "time_limited",
      requiredPartiesPerDay: null,
      theoreticalTurns: null,
    },
    "sometimes",
  );
  const copy =
    root.querySelector("[data-restaurant-insight]")?.textContent ?? "";

  expect(copy).toContain("광고 확대보다");
  expect(copy).toContain("혼잡 시간대 운영");
  expect(copy).toContain("먼저");
  expect(copy).not.toContain("광고 확대와 함께");
});

test.each([
  ["no", "추가 고객을 받기 어려운 운영 제약"],
  ["sometimes", "시간대에 따른 운영 제약"],
] as const)(
  "uses effective %s capacity when restaurant evidence is insufficient",
  (effectiveCapacity, expectedCopy) => {
    const root = renderRestaurant(
      {
        status: "insufficient",
        requiredPartiesPerDay: null,
        theoreticalTurns: null,
      },
      effectiveCapacity,
    );

    expect(
      root.querySelector("[data-restaurant-insight]")?.textContent,
    ).toContain(expectedCopy);
  },
);

test("labels approximate customer data without calling it actual", () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  renderResult(root, {
    ...baseModel,
    metrics: { ...baseModel.metrics, customerCountSource: "approximate" },
  });

  expect(root.querySelector(".estimate-badge")?.textContent).toBe(
    "대략 입력 기준",
  );
});

test("immediately qualifies theoretical turns when hours and stay band support them", () => {
  const root = renderRestaurant(
    analyzeRestaurantOperations(
      { ...emptyRestaurant, hallHours: 8, averageStayBand: "60_90" },
      20,
    ),
  );
  const theoreticalLine = Array.from(
    root.querySelectorAll<HTMLParagraphElement>("[data-restaurant-insight] p"),
  ).find((paragraph) =>
    paragraph.textContent?.includes("이론상 좌석 회전 참고 범위"),
  );

  expect(theoreticalLine?.textContent).toContain("하루 5.3~8회");
  expect(theoreticalLine?.nextElementSibling?.textContent).toBe(
    "실제 고객 수 예측이나 매출 보장이 아닙니다.",
  );
});

test.each([
  [8, null],
  [null, "60_90"],
  [null, null],
] as const)(
  "omits theoretical turns without both supporting values (%s, %s)",
  (hallHours, averageStayBand) => {
    const root = renderRestaurant(
      analyzeRestaurantOperations(
        { ...emptyRestaurant, hallHours, averageStayBand },
        20,
      ),
    );

    expect(
      root.querySelector("[data-restaurant-insight]")?.textContent,
    ).not.toContain("이론상 좌석 회전 참고 범위");
  },
);
