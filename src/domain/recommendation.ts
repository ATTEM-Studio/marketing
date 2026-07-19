import type { RecommendedAction, RecommendationContext } from "./types";

const ACTIONS = {
  "profit-review": {
    key: "profit-review",
    title: "추가 광고보다 남는 매출부터 확인하세요",
    reason:
      "최근 월평균 매출이 목표에 도달했습니다. 손님을 더 모으기 전에 이익과 운영 효율을 확인할 차례입니다.",
    steps: [
      "대표 메뉴 세 개의 판매가와 재료비를 적으세요.",
      "메뉴별로 판매가에서 직접 재료비를 빼세요.",
      "남는 금액이 가장 적은 메뉴 한 개의 가격이나 구성을 검토하세요.",
    ],
    metric: "대표 메뉴별 판매가에서 직접 재료비를 뺀 금액",
    avoid: "목표를 달성했다는 이유만으로 광고비부터 늘리지 마세요.",
    minutes: 20,
    coachingKey: "revenue-before-ranking",
  },
  "average-order-value": {
    key: "average-order-value",
    title: "대표 메뉴 옆에 추가 메뉴 한 개를 배치하세요",
    reason:
      "지금은 추가 손님을 충분히 받을 수 없어 이미 방문한 손님의 선택을 개선하는 편이 현실적입니다.",
    steps: [
      "가장 많이 팔리는 메뉴 한 개를 고르세요.",
      "함께 주문하기 좋은 추가 메뉴 한 개를 정하세요.",
      "메뉴판과 직원 안내 문장을 같은 표현으로 바꾸세요.",
    ],
    metric: "7일간 추가 메뉴 선택 건수와 평균 객단가",
    avoid: "모든 메뉴와 가격을 한꺼번에 바꾸지 마세요.",
    minutes: 20,
    coachingKey: "three-revenue-levers",
  },
  "measure-acquisition-source": {
    key: "measure-acquisition-source",
    title: "7일 동안 신규 고객의 방문 경로를 기록하세요",
    reason:
      "광고 클릭이 실제 방문으로 이어졌는지 확인되지 않아 예산을 판단할 근거가 부족합니다.",
    steps: [
      "결제할 때 처음 방문인지 확인하세요.",
      "처음이라면 매장을 알게 된 경로 한 가지만 표시하세요.",
      "7일 뒤 광고 경로 신규 고객 수와 광고비를 함께 보세요.",
    ],
    metric: "광고를 보고 방문했다고 답한 실제 신규 고객 수",
    avoid: "클릭 수만 보고 광고비를 늘리지 마세요.",
    minutes: 10,
    coachingKey: "exposure-is-not-sales",
  },
  "returning-message": {
    key: "returning-message",
    title: "동의 고객 일부에게 다음 방문 이유를 알려주세요",
    reason:
      "확인된 재방문 데이터와 홍보 수신동의 고객이 있어 작은 재방문 실험을 측정할 수 있습니다.",
    steps: [
      "최근 방문 고객 중 수신동의 고객만 고르세요.",
      "7일 안에 다시 올 이유 한 가지를 작성하세요.",
      "일부 고객에게만 보내고 실제 재방문 수를 기록하세요.",
    ],
    metric: "발송 고객 중 7일 안에 재방문한 고객 수",
    avoid: "수신동의가 없는 연락처로 홍보하지 마세요.",
    minutes: 15,
    coachingKey: "three-revenue-levers",
  },
  "off-peak-offer": {
    key: "off-peak-offer",
    title: "손님을 더 받을 수 있는 시간대 하나를 정하세요",
    reason:
      "시간대에 따라 수용 여력이 달라서 전체 유입보다 빈 시간대에 맞춘 행동이 먼저입니다.",
    steps: [
      "최근 한 달 중 가장 비는 요일과 시간을 고르세요.",
      "그 시간대에 맞는 대표 메뉴와 이용 이유를 한 문장으로 쓰세요.",
      "한 채널에만 안내하고 해당 시간 방문 수를 기록하세요.",
    ],
    metric: "선택한 시간대의 7일 방문 고객 수",
    avoid: "바쁜 시간까지 같은 혜택을 적용하지 마세요.",
    minutes: 20,
    coachingKey: "channel-has-a-role",
  },
  "local-discovery": {
    key: "local-discovery",
    title: "검색한 고객이 선택할 이유 한 가지를 고치세요",
    reason:
      "추가 고객을 받을 수 있으므로 광고 확대보다 매장을 비교하는 고객에게 선택 이유를 분명히 보여주는 행동이 먼저입니다.",
    steps: [
      "대표 메뉴와 핵심 이용 상황 한 가지를 정하세요.",
      "대표사진과 첫 설명 문장을 같은 내용으로 맞추세요.",
      "주차·예약·영업시간 정보가 맞는지 확인하세요.",
    ],
    metric: "7일간 전화·길찾기·예약 수",
    avoid: "여러 지역과 메뉴 키워드를 한꺼번에 추가하지 마세요.",
    minutes: 25,
    coachingKey: "exposure-is-not-sales",
  },
} as const satisfies Record<RecommendedAction["key"], RecommendedAction>;

export function selectAction(
  context: RecommendationContext,
): RecommendedAction {
  if (context.metrics.targetReached) return ACTIONS["profit-review"];
  if (context.adsRunning && !context.adAttributionKnown) {
    return ACTIONS["measure-acquisition-source"];
  }
  if (context.capacity === "no") {
    return context.canChangeMenu
      ? ACTIONS["average-order-value"]
      : ACTIONS["off-peak-offer"];
  }
  if (context.primaryConcern === "averageOrderValue" && context.canChangeMenu) {
    return ACTIONS["average-order-value"];
  }
  if (
    context.primaryConcern === "returning" &&
    context.returningDataStatus === "known" &&
    context.hasConsentDb
  ) {
    return ACTIONS["returning-message"];
  }
  if (context.capacity === "sometimes") return ACTIONS["off-peak-offer"];
  return ACTIONS["local-discovery"];
}
