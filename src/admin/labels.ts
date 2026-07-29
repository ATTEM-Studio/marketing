import type {
  AdminDetailItem,
  AdminDetailSection,
  AdminMemberDetail,
} from "./types";
import { formatKoreanDate, formatKoreanDateTime } from "./date-format";

const missing = "입력하지 않음";
const formatter = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown): string =>
  typeof value === "string" && value.trim() !== "" ? value : missing;
const count = (value: unknown, unit = "명"): string => {
  const parsed = finite(value);
  return parsed === null ? missing : `${formatter.format(parsed)}${unit}`;
};
const won = (value: unknown): string => {
  const parsed = finite(value);
  return parsed === null ? missing : `${formatter.format(parsed)}원`;
};
const percent = (value: unknown, multiplier = 1): string => {
  const parsed = finite(value);
  return parsed === null
    ? missing
    : `${formatter.format(parsed * multiplier)}%`;
};
const yesNo = (value: unknown): string =>
  value === true ? "예" : value === false ? "아니오" : missing;
const mapped = (value: unknown, labels: Record<string, string>): string =>
  typeof value === "string" ? (labels[value] ?? missing) : missing;
const item = (label: string, value: string): AdminDetailItem => ({
  label,
  value,
});

const concernLabels: Record<string, string> = {
  customers: "신규 고객",
  ads: "광고",
  averageOrderValue: "객단가",
  returning: "재방문",
  unknown: "모르겠음",
};
const capacityLabels: Record<string, string> = {
  yes: "여유 있음",
  sometimes: "시간대에 따라 다름",
  no: "여유 없음",
};
const customerCountLabels: Record<string, string> = {
  exact: "정확한 값",
  approximate: "대략적인 값",
  unknown: "모름",
};
const returningDataLabels: Record<string, string> = {
  known: "확인됨",
  sampled: "일부 확인됨",
  unknown: "모름",
};
const occupancyLabels: Record<string, string> = {
  spacious: "여유 있음",
  half: "절반 정도 참",
  almost_full: "거의 참",
  waiting: "대기 있음",
};
const stayLabels: Record<string, string> = {
  under_30: "30분 미만",
  "30_60": "30~60분",
  "60_90": "60~90분",
  over_90: "90분 이상",
  unknown: "모름",
};
const sourceLabels: Record<string, string> = {
  actual: "실제 입력",
  approximate: "대략 입력",
  estimated: "추정",
};
const adStatusLabels: Record<string, string> = {
  measured: "실측 가능",
  needs_measurement: "측정 필요",
};
const restaurantStatusLabels: Record<string, string> = {
  available: "여유 있음",
  time_limited: "시간대 제한",
  saturated: "포화",
  insufficient: "정보 부족",
};
const bottleneckLabels: Record<string, string> = {
  exposure: "노출",
  click: "클릭",
  visit: "방문",
  averageOrderValue: "객단가",
  returning: "재방문",
};
const bottleneckStatusLabels: Record<string, string> = {
  known: "확인됨",
  stable: "안정적",
  insufficient: "정보 부족",
};
const actionLabels: Record<string, string> = {
  "profit-review": "수익 구조 점검",
  "average-order-value": "객단가 높이기",
  "measure-acquisition-source": "유입 경로 측정",
  "returning-message": "재방문 메시지",
  "off-peak-offer": "비혼잡 시간대 제안",
  "local-discovery": "지역 검색 정보 개선",
};
const actionStatusLabels: Record<string, string> = {
  pending: "예정",
  in_progress: "진행 중",
  completed: "완료",
  skipped: "건너뜀",
};

export function diagnosisSections(
  detail: AdminMemberDetail,
): AdminDetailSection[] {
  const assessment = detail.latestAssessment;
  const input = object(assessment?.inputData);
  const revenue = object(input.revenue);
  const advertising = object(input.advertising);
  const restaurant = object(input.restaurant);
  const shares = object(restaurant.channelShares);
  const metrics = object(assessment?.calculatedMetrics);
  const advertisingMetrics = object(metrics.advertising);
  const restaurantMetrics = object(metrics.restaurant);
  const diagnosis = object(assessment?.diagnosis);
  const bottleneck = object(diagnosis.bottleneck);
  const goal = assessment?.goal;
  const allocation = object(goal?.allocation);
  const latestActionPlan = detail.actionPlans[0];
  const turns = object(restaurantMetrics.theoreticalTurns);

  return [
    {
      title: "기본 정보",
      items: [
        item("상호", text(detail.profile.businessName)),
        item("이름", text(detail.profile.name)),
        item("이메일", text(detail.profile.email)),
        item("지역", text(detail.profile.region)),
        item("가입일", formatKoreanDateTime(detail.profile.joinedAt)),
        item("서비스 약관 동의", yesNo(detail.profile.consents.serviceTerms)),
        item("마케팅 동의", yesNo(detail.profile.consents.marketing)),
        item("중복 의심 회원 수", count(detail.duplicatePeers.totalCount)),
        item(
          "중복 회원 목록",
          detail.duplicatePeers.truncated ? "일부만 제공됨" : "전체 제공됨",
        ),
        item(
          "완료 진단 횟수",
          count(detail.assessmentHistory.totalCount, "회"),
        ),
        item("실행 계획 수", count(detail.actionPlans.length, "개")),
        item("코칭 이용 횟수", count(detail.coachingUsage.count, "회")),
        item(
          "최근 코칭 일시",
          formatKoreanDateTime(detail.coachingUsage.latestAt),
        ),
      ],
    },
    {
      title: "최근 진단 요약",
      items: [
        item("최근 진단 일시", formatKoreanDateTime(assessment?.createdAt)),
        item("목표 월매출", won(goal?.targetRevenue)),
        item("목표 기간 시작", formatKoreanDate(goal?.periodStart)),
        item("목표 기간 종료", formatKoreanDate(goal?.periodEnd)),
        item("병목 구간", mapped(bottleneck.key, bottleneckLabels)),
        item("병목 상태", mapped(bottleneck.status, bottleneckStatusLabels)),
        item("병목 변화율", percent(bottleneck.changeRate, 100)),
        item("병목 설명", text(bottleneck.reason)),
        item("추천 행동", mapped(diagnosis.actionKey, actionLabels)),
        item(
          "실행 가능 여력",
          mapped(diagnosis.effectiveCapacity, capacityLabels),
        ),
        item(
          "최근 실행 계획",
          mapped(latestActionPlan?.actionKey, actionLabels),
        ),
        item(
          "최근 실행 계획 상태",
          mapped(latestActionPlan?.status, actionStatusLabels),
        ),
        item(
          "최근 실행 계획 예정일",
          formatKoreanDate(latestActionPlan?.scheduledFor),
        ),
      ],
    },
    {
      title: "고객과 운영",
      items: [
        item("최근 월평균 매출", won(revenue.averageMonthlyRevenue)),
        item("목표 월매출", won(revenue.targetMonthlyRevenue)),
        item("평균 객단가", won(revenue.averageOrderValue)),
        item("영업일 수", count(revenue.operatingDays, "일")),
        item("월 고객 수", count(revenue.monthlyCustomerCount)),
        item(
          "월 고객 수 정보",
          mapped(revenue.monthlyCustomerCountStatus, customerCountLabels),
        ),
        item("우선 고민", mapped(input.primaryConcern, concernLabels)),
        item("고객 수용 여력", mapped(input.capacity, capacityLabels)),
        item(
          "재방문 데이터 상태",
          mapped(input.returningDataStatus, returningDataLabels),
        ),
        item("광고 안내 동의 고객 목록", yesNo(input.hasConsentDb)),
        item("메뉴 변경 가능", yesNo(input.canChangeMenu)),
      ],
    },
    {
      title: "광고",
      items: [
        item("광고 진행 여부", yesNo(input.adsRunning)),
        item("방문 전환율", percent(advertising.visitConversionRate, 100)),
        item("클릭당 비용", won(advertising.costPerClick)),
        item("광고 유입 신규 고객 수", count(advertising.actualAdNewCustomers)),
        item("실제 광고비", won(advertising.actualAdSpend)),
        item(
          "광고 측정 상태",
          mapped(advertisingMetrics.status, adStatusLabels),
        ),
        item(
          "광고 신규 고객 목표",
          count(advertisingMetrics.newCustomerTarget),
        ),
        item("필요 클릭 수", count(advertisingMetrics.requiredClicks, "회")),
        item("예상 광고비", won(advertisingMetrics.estimatedAdSpend)),
        item("고객 획득 비용", won(advertisingMetrics.customerAcquisitionCost)),
      ],
    },
    {
      title: "음식점 선택 정보",
      items: [
        item("좌석 수", count(restaurant.seats, "석")),
        item("하루 매장 운영 시간", count(restaurant.hallHours, "시간")),
        item(
          "가장 붐비는 시간대 좌석 상황",
          mapped(restaurant.peakOccupancy, occupancyLabels),
        ),
        item("평균 동행 인원", count(restaurant.averagePartySize)),
        item("평균 체류 시간", mapped(restaurant.averageStayBand, stayLabels)),
        item("매장 식사 비중", percent(shares.dineIn)),
        item("포장 비중", percent(shares.takeout)),
        item("배달 비중", percent(shares.delivery)),
        item(
          "음식점 운영 여력",
          mapped(restaurantMetrics.status, restaurantStatusLabels),
        ),
        item(
          "하루 필요 팀 수",
          count(restaurantMetrics.requiredPartiesPerDay, "팀"),
        ),
        item("예상 회전 수(최소)", count(turns.min, "회")),
        item("예상 회전 수(최대)", count(turns.max, "회")),
      ],
    },
    {
      title: "계산 결과와 추천",
      items: [
        item("부족 매출", won(metrics.shortfallRevenue)),
        item("필요 신규 고객 수", count(metrics.maxNewCustomers)),
        item("하루 필요 신규 고객 수", count(metrics.maxNewCustomersPerDay)),
        item("계산된 월 고객 수", count(metrics.monthlyCustomerCount)),
        item(
          "월 고객 수 계산 기준",
          mapped(metrics.customerCountSource, sourceLabels),
        ),
        item("목표 달성 여부", yesNo(metrics.targetReached)),
        item("신규 고객 매출 배분", won(allocation.newCustomerRevenue)),
        item("재방문 매출 배분", won(allocation.returningCustomerRevenue)),
        item("객단가 매출 배분", won(allocation.averageOrderValueRevenue)),
      ],
    },
  ];
}
