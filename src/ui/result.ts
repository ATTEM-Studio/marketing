import { COACHING } from "../content/coaching";
import type {
  AdvertisingInputs,
  AdvertisingMetrics,
  BottleneckResult,
  GoalAllocation,
  RecommendedAction,
  RevenueMetrics,
} from "../domain/types";

export interface ResultViewModel {
  metrics: RevenueMetrics;
  allocation?: GoalAllocation | Record<string, never>;
  advertising?: AdvertisingMetrics;
  advertisingInputs?: AdvertisingInputs;
  bottleneck: BottleneckResult;
  action: RecommendedAction;
}

export interface ResultCallbacks {
  onSaveAction: () => Promise<void> | void;
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
  root.innerHTML = `
    <header class="site-header"><strong>장사 방향 코치</strong></header>
    <main id="main" class="result-shell">
      <p class="eyebrow">진단 결과</p>
      <h1>목표까지 갈 길을 숫자로 확인했어요.</h1>
      <section class="result-summary" aria-label="목표 매출 계산">
        <h2>목표까지 부족한 매출</h2><p class="result-number">${won.format(model.metrics.shortfallRevenue)}원</p>
        <h2>전원 신규 상한선</h2><p class="result-number">전부 신규 고객으로 채운다고 가정한 최대 ${won.format(model.metrics.maxNewCustomers)}명</p>
        <p>월 영업일 기준 하루 최대 필요 고객 수: ${won.format(model.metrics.maxNewCustomersPerDay)}명</p>
        <p>실제로 재방문과 객단가 개선이 포함되면 필요한 신규 고객 수는 줄어듭니다.</p>
      </section>
      ${allocationMarkup(model.allocation)}
      ${advertisingMarkup(model.advertising, model.advertisingInputs)}
      <section data-recommended-action class="recommended-action" aria-labelledby="action-title">
        <p class="eyebrow">오늘의 행동 한 가지</p>
        <h2 id="action-title">${model.action.title}</h2>
        <h3>선택 근거</h3><p>${model.bottleneck.status === "insufficient" ? "목표 크기, 고객 수용 여력, 지금 실행할 수 있는 조건을 기준으로 골랐습니다." : model.action.reason}</p>
        <p>${bottleneckCopy(model.bottleneck)}</p>
        <h3>실행 방법 세 단계</h3><ol>${model.action.steps.map((step) => `<li>${step}</li>`).join("")}</ol>
        <h3>확인할 숫자 하나</h3><p>${model.action.metric}</p>
        <h3>하지 말아야 할 행동</h3><p>${model.action.avoid}</p>
        ${callbacks ? '<button type="button" data-save-action>실행할게요</button><p class="form-status" role="status" aria-live="polite" data-action-status></p>' : ""}
      </section>
      <section class="coaching-principle"><h2>관련 코칭 원칙</h2><p>${summary ?? "한 번에 한 가지 행동만 바꾸고, 결과를 기록하세요."}</p></section>
    </main>`;

  const saveAction =
    root.querySelector<HTMLButtonElement>("[data-save-action]");
  const status = root.querySelector<HTMLElement>("[data-action-status]");
  let saving = false;
  saveAction?.addEventListener("click", async () => {
    if (!callbacks || saving) return;
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
