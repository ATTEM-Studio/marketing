import { COACHING } from "../content/coaching";
import type {
  BottleneckResult,
  RecommendedAction,
  RevenueMetrics,
} from "../domain/types";

export interface ResultViewModel {
  metrics: RevenueMetrics;
  bottleneck: BottleneckResult;
  action: RecommendedAction;
}

const won = new Intl.NumberFormat("ko-KR");
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
    return `확인 가능한 수치에서는 ${bottleneckName[bottleneck.key]} 변화가 가장 낮았습니다.`;
  }
  return "비교 가능한 수치에서 뚜렷한 감소를 확인하지 못했습니다.";
}

export function renderResult(root: HTMLElement, model: ResultViewModel): void {
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
      <section data-recommended-action class="recommended-action" aria-labelledby="action-title">
        <p class="eyebrow">오늘의 행동 한 가지</p>
        <h2 id="action-title">${model.action.title}</h2>
        <h3>선택 근거</h3><p>${model.bottleneck.status === "insufficient" ? "목표 크기, 고객 수용 여력, 지금 실행할 수 있는 조건을 기준으로 골랐습니다." : model.action.reason}</p>
        <p>${bottleneckCopy(model.bottleneck)}</p>
        <h3>실행 방법 세 단계</h3><ol>${model.action.steps.map((step) => `<li>${step}</li>`).join("")}</ol>
        <h3>확인할 숫자 하나</h3><p>${model.action.metric}</p>
        <h3>하지 말아야 할 행동</h3><p>${model.action.avoid}</p>
      </section>
      <section class="coaching-principle"><h2>관련 코칭 원칙</h2><p>${summary ?? "한 번에 한 가지 행동만 바꾸고, 결과를 기록하세요."}</p></section>
    </main>`;
}
