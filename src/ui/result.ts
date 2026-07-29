import { COACHING } from "../content/coaching";
import { brandMarkup } from "./brand";
import type {
  AdvertisingInputs,
  AdvertisingMetrics,
  BottleneckResult,
  Capacity,
  GoalAllocation,
  RecommendedAction,
  RestaurantOperationsInsight,
  RevenueMetrics,
} from "../domain/types";

export interface ResultViewModel {
  effectiveCapacity: Capacity;
  metrics: RevenueMetrics;
  allocation?: GoalAllocation | Record<string, never>;
  advertising?: AdvertisingMetrics;
  advertisingInputs?: AdvertisingInputs;
  restaurant?: RestaurantOperationsInsight;
  bottleneck: BottleneckResult;
  action: RecommendedAction;
}

export interface ResultCallbacks {
  onSaveAction?: () => Promise<void> | void;
  onBack?: () => void;
}

const won = new Intl.NumberFormat("ko-KR");
const percentage = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
});
const bottleneckName = {
  exposure: "노출",
  click: "클릭",
  visit: "방문",
  averageOrderValue: "객단가",
  returning: "재방문",
} as const;

const coachingSummary: Record<string, string> = {
  "revenue-before-ranking":
    "목표까지의 차이를 먼저 계산하고, 한 번에 한 가지 행동만 확인하세요.",
  "three-revenue-levers":
    "새 고객, 재방문, 객단가는 서로 다른 숫자입니다. 한 번에 하나만 바꾸고 기록하세요.",
  "exposure-is-not-sales":
    "노출과 클릭만으로 매출을 판단하지 마세요. 실제 방문 경로를 기록한 뒤 판단하세요.",
  "channel-has-a-role":
    "채널마다 역할을 하나씩 정하고, 같은 기간의 숫자로 비교하세요.",
};

const constrainedCapacityCopy = {
  no: "대표님은 추가 고객을 받기 어려운 운영 제약이 있다고 답했습니다. 신규 고객을 늘리기 전에 그 제약을 먼저 해결하세요.",
  sometimes:
    "대표님은 시간대에 따른 운영 제약이 있다고 답했습니다. 한산한 시간대처럼 받을 수 있는 범위에서만 제한적으로 시험해보세요.",
} as const;

function restaurantGuidance(
  status: RestaurantOperationsInsight["status"],
  effectiveCapacity: Capacity,
): string {
  if (status === "saturated") {
    return "웨이팅이 발생하고 있어 고객을 더 모으기 전에 체류시간, 주문 처리 또는 포장·배달 구조를 먼저 점검해야 합니다.";
  }
  if (status === "available") {
    if (effectiveCapacity === "no" || effectiveCapacity === "sometimes") {
      return `좌석만 보면 여유가 있어 보이지만, ${constrainedCapacityCopy[effectiveCapacity]}`;
    }
    return "가장 붐비는 시간에도 좌석 여유가 있어, 지금은 좌석 확대보다 신규 고객 확보가 먼저입니다.";
  }
  if (status === "time_limited") {
    if (effectiveCapacity === "no") {
      return "붐비는 시간에는 좌석이 거의 차고, 대표님도 추가 고객을 받기 어려운 운영 제약이 있다고 답했습니다. 광고 확대보다 혼잡 시간대 운영과 포장·배달 구조를 먼저 정리하세요.";
    }
    return "붐비는 시간에는 좌석이 거의 찹니다. 광고 확대보다 혼잡 시간대 운영을 먼저 정리하고, 한산한 시간대 유입이나 포장·배달 전환을 제한적으로 시험해보세요.";
  }
  if (effectiveCapacity === "no" || effectiveCapacity === "sometimes") {
    return constrainedCapacityCopy[effectiveCapacity];
  }
  return "운영 정보가 충분하지 않아 매장 수용 여력은 단정하지 않았습니다.";
}

function bottleneckCopy(bottleneck: BottleneckResult): string {
  if (bottleneck.status === "insufficient") {
    return "비교할 이전 기간 수치가 부족해 병목을 단정하지 않았습니다.";
  }
  if (bottleneck.status === "known" && bottleneck.key) {
    const changeRate = bottleneck.changeRate;
    if (typeof changeRate === "number" && Number.isFinite(changeRate)) {
      const direction = changeRate < 0 ? "감소" : "증가";
      return `확인 가능한 수치에서는 ${bottleneckName[bottleneck.key]}이 이전 기간보다 ${percentage.format(Math.abs(changeRate))} ${direction}해 가장 낮았습니다.`;
    }
    return `확인 가능한 수치에서는 ${bottleneckName[bottleneck.key]} 변화가 가장 낮았습니다.`;
  }
  return "비교 가능한 수치에서 뚜렷한 감소를 확인하지 못했습니다.";
}

function allocationMarkup(
  allocation: GoalAllocation | Record<string, never> | undefined,
): string {
  if (!allocation || !("newCustomerRevenue" in allocation)) return "";
  return `<section class="result-allocation" aria-label="직접 정한 목표 분배">
    <h2>직접 정한 목표 분배</h2>
    <p>신규 고객 증가: ${won.format(allocation.newCustomerRevenue)}원</p>
    <p>재방문 증가: ${won.format(allocation.returningCustomerRevenue)}원</p>
    <p>객단가 상승: ${won.format(allocation.averageOrderValueRevenue)}원</p>
    <p>이 분배는 사용자가 정한 실행 계획이며, 재방문 병목 진단은 아닙니다.</p>
  </section>`;
}

function advertisingMarkup(
  advertising: AdvertisingMetrics | undefined,
  input: AdvertisingInputs | undefined,
): string {
  if (!advertising) return "";
  if (advertising.status !== "measured") {
    return `<section class="advertising-estimate" aria-label="광고 데이터 측정 안내">
      <h2>광고 비용은 아직 계산하지 않았어요</h2>
      <p>실제 방문 전환율, 평균 클릭 비용, 광고 유입 실제 신규 고객 수, 실제 집행 광고비 중 모르는 값이 있어 광고 수치를 표시하지 않았습니다. 아래 오늘의 행동으로 필요한 실제 값을 확인합니다.</p>
    </section>`;
  }
  const assumptions =
    input &&
    input.visitConversionRate !== null &&
    input.costPerClick !== null &&
    input.actualAdNewCustomers !== null &&
    input.actualAdSpend !== null
      ? `<p>실제 방문 전환율 ${percentage.format(input.visitConversionRate)}, 평균 클릭 비용 ${won.format(input.costPerClick)}원, 광고 유입 실제 신규 고객 ${won.format(input.actualAdNewCustomers)}명, 실제 집행 광고비 ${won.format(input.actualAdSpend)}원을 전제로 계산했습니다.</p>`
      : "";
  return `<section class="advertising-estimate" aria-label="실제 입력값을 전제로 한 광고 추정">
    <h2>실제 입력값을 전제로 한 광고 추정</h2>
    ${assumptions}
    <p>필요 클릭 수: ${won.format(advertising.requiredClicks ?? 0)}회</p>
    <p>예상 광고비: ${won.format(advertising.estimatedAdSpend ?? 0)}원</p>
    <p>실제 기준 CAC: ${won.format(advertising.customerAcquisitionCost ?? 0)}원</p>
    <p>필요 클릭 수와 예상 광고비는 목표를 위한 미래 추정이며, CAC는 실제 집행 광고비와 광고 유입 실제 신규 고객 수를 사용했습니다. 확정 비용이나 성과 보장이 아닙니다.</p>
  </section>`;
}

function restaurantMarkup(
  restaurant: RestaurantOperationsInsight | undefined,
  effectiveCapacity: Capacity,
): string {
  if (!restaurant) return "";
  const requiredParties =
    restaurant.requiredPartiesPerDay === null
      ? ""
      : `<p>목표 달성에는 하루 약 ${won.format(restaurant.requiredPartiesPerDay)}팀이 더 필요해요.</p>`;
  const theoreticalTurns = restaurant.theoreticalTurns
    ? `<p>이론상 좌석 회전 참고 범위: 하루 ${won.format(restaurant.theoreticalTurns.min)}~${won.format(restaurant.theoreticalTurns.max)}회</p>
       <p>실제 고객 수 예측이나 매출 보장이 아닙니다.</p>`
    : "";
  return `<section data-restaurant-insight class="restaurant-insight" aria-label="매장 운영 여력 안내">
    <h2>매장 운영 여력 참고</h2>
    ${requiredParties}
    <p>${restaurantGuidance(restaurant.status, effectiveCapacity)}</p>
    ${theoreticalTurns}
  </section>`;
}

export function checkInDueDate(assessmentCreatedAt: string): string {
  const assessmentDate = new Date(assessmentCreatedAt);
  if (Number.isNaN(assessmentDate.getTime())) {
    throw new Error("진단 날짜를 확인할 수 없습니다.");
  }
  assessmentDate.setUTCDate(assessmentDate.getUTCDate() + 7);
  return assessmentDate.toISOString().slice(0, 10);
}

export function renderResult(
  root: HTMLElement,
  model: ResultViewModel,
  callbacks?: ResultCallbacks,
): void {
  const coaching = COACHING[model.action.coachingKey as keyof typeof COACHING];
  const summary = coaching
    ? coachingSummary[model.action.coachingKey]
    : undefined;
  const customerCountBadge = {
    actual: "입력 기준",
    approximate: "대략 입력 기준",
    estimated: "추정 기준",
  }[model.metrics.customerCountSource];
  const backButton = callbacks?.onBack
    ? '<button type="button" class="quiet-button result-back" data-result-back aria-label="대시보드로 돌아가기">← 대시보드</button>'
    : "";
  root.innerHTML = `
    <header class="work-header">
      ${brandMarkup("/")}
      <div class="result-header-actions">${backButton}<span class="status-chip">진단 완료</span></div>
    </header>
    <main id="main" class="result-shell">
      <p class="eyebrow">진단 결과</p>
      <h1>목표까지 필요한 고객을 먼저 확인했어요.</h1>
      <section class="metric-hero" aria-labelledby="customer-target-title">
        <div>
          <p class="metric-label">목표까지 필요한 신규 고객 상한선</p>
          <h2 id="customer-target-title"><span>최대</span> <strong class="metric-value">${won.format(model.metrics.maxNewCustomers)}명</strong></h2>
          <p>전부 신규 고객으로 채운다고 가정한 최대 ${won.format(model.metrics.maxNewCustomers)}명입니다.</p>
        </div>
        <span class="estimate-badge">${customerCountBadge}</span>
      </section>
      <section class="metric-grid" aria-label="목표 매출 계산">
        <article class="metric-card"><span>목표까지 부족한 매출</span><strong>${won.format(model.metrics.shortfallRevenue)}원</strong></article>
        <article class="metric-card"><span>영업일 기준 하루 최대</span><strong>${won.format(model.metrics.maxNewCustomersPerDay)}명</strong></article>
      </section>
      <p class="calculation-note">재방문과 객단가 개선이 포함되면 실제 필요한 신규 고객 수는 줄어듭니다.</p>
      ${allocationMarkup(model.allocation)}
      ${advertisingMarkup(model.advertising, model.advertisingInputs)}
      ${restaurantMarkup(model.restaurant, model.effectiveCapacity)}
      <section data-recommended-action class="recommended-action action-card" aria-labelledby="action-title">
        <div class="action-heading"><div><p class="eyebrow">오늘의 행동 한 가지</p><h2 id="action-title">${model.action.title}</h2></div><span class="time-badge">약 ${model.action.minutes}분</span></div>
        <div class="action-reason"><h3>왜 이 행동인가요?</h3><p>${model.bottleneck.status === "insufficient" ? "목표 크기, 고객 수용 여력, 지금 실행할 수 있는 조건을 기준으로 골랐습니다." : model.action.reason}</p><p>${bottleneckCopy(model.bottleneck)}</p></div>
        <div class="action-steps"><h3>이 순서로 실행하세요</h3><ol>${model.action.steps.map((step) => `<li>${step}</li>`).join("")}</ol></div>
        <div class="action-meta"><div><span>확인할 숫자</span><strong>${model.action.metric}</strong></div><div class="avoid-note"><span>지금 피할 것</span><strong>${model.action.avoid}</strong></div></div>
        ${callbacks?.onSaveAction ? '<button type="button" class="primary-action" data-save-action>7일 행동으로 저장하기</button><p class="form-status" role="status" aria-live="polite" data-action-status></p>' : ""}
      </section>
      <section class="coaching-principle"><h2>관련 코칭 원칙</h2><p>${summary ?? "한 번에 한 가지 행동만 바꾸고, 결과를 기록하세요."}</p></section>
    </main>`;

  const saveAction =
    root.querySelector<HTMLButtonElement>("[data-save-action]");
  const status = root.querySelector<HTMLElement>("[data-action-status]");
  root
    .querySelector<HTMLButtonElement>("[data-result-back]")
    ?.addEventListener("click", () => callbacks?.onBack?.());
  let saving = false;
  saveAction?.addEventListener("click", async () => {
    if (!callbacks?.onSaveAction || saving) return;
    saving = true;
    saveAction.disabled = true;
    if (status) status.textContent = "실행 계획을 저장하고 있습니다.";
    try {
      await callbacks.onSaveAction();
    } catch {
      saving = false;
      saveAction.disabled = false;
      if (status) {
        status.textContent =
          "실행 계획을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
      }
      saveAction.focus();
    }
  });
}
