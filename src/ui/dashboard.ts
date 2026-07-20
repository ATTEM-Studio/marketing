import type {
  ActionPlanRecord,
  AppService,
  AppSession,
  AssessmentSnapshot,
} from "../services/contracts";
import { isCompletedPersistedAssessment } from "../coaching/completion";

const number = new Intl.NumberFormat("ko-KR");

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function dataObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isCompletedAssessment(assessment: AssessmentSnapshot | null): boolean {
  if (!assessment || !assessment.id) return false;
  return isCompletedPersistedAssessment(
    {
      input_data: assessment.inputs,
      calculated_metrics: assessment.metrics,
      diagnosis: assessment.diagnosis,
    },
    { target_revenue: assessment.goalTargetRevenue },
  );
}

function latestTarget(assessment: AssessmentSnapshot): number | null {
  const inputs = dataObject(assessment.inputs);
  return (
    numberValue(inputs.targetMonthlyRevenue) ??
    numberValue(dataObject(inputs.revenue).targetMonthlyRevenue)
  );
}

function maximumNewCustomers(assessment: AssessmentSnapshot): number | null {
  return numberValue(dataObject(assessment.metrics).maxNewCustomers);
}

function dueDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
  }).format(date);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function actionName(plan: ActionPlanRecord): string {
  return plan.metric ? `${plan.metric} 확인` : "오늘의 행동";
}

interface CheckInValues {
  beforeValue: string;
  afterValue: string;
  note: string;
}

function checkInForm(
  plan: ActionPlanRecord | null,
  values: CheckInValues,
): string {
  if (!plan) return "";
  const metric = escapeHtml(plan.metric || "확인할 숫자");
  return `
    <section class="checkin-panel" aria-labelledby="checkin-title">
      <h2 id="checkin-title">결과 기록</h2>
      <p>${metric}의 실행 전후를 적어 주세요. 숫자만 정확히 맞추려 하지 않아도 됩니다.</p>
      <form data-checkin-form novalidate>
        <div class="field"><label for="beforeValue">실행 전 값</label><input id="beforeValue" name="beforeValue" required aria-describedby="beforeValue-error" value="${escapeHtml(values.beforeValue)}"><p id="beforeValue-error" class="field-error"></p></div>
        <div class="field"><label for="afterValue">실행 후 값</label><input id="afterValue" name="afterValue" required aria-describedby="afterValue-error" value="${escapeHtml(values.afterValue)}"><p id="afterValue-error" class="field-error"></p></div>
        <div class="field"><label for="note">메모 <span class="optional">(선택)</span></label><textarea id="note" name="note" rows="3">${escapeHtml(values.note)}</textarea></div>
        <button type="submit" data-submit-checkin>결과 기록하기</button>
      </form>
    </section>`;
}

function dashboardMarkup(
  session: AppSession,
  assessment: AssessmentSnapshot | null,
  plans: ActionPlanRecord[],
  activePlan: ActionPlanRecord | null,
  checkInValues: CheckInValues,
  status: string,
): string {
  const profile = session.profile;
  const planned = plans
    .filter((plan) => plan.status === "planned")
    .sort((left, right) => left.checkInDueAt.localeCompare(right.checkInDueAt));
  const completed = plans.filter((plan) => plan.status === "completed");
  const currentPlan = planned[0] ?? null;
  const upcoming = planned.slice(1);
  const target = assessment ? latestTarget(assessment) : null;
  const ceiling = assessment ? maximumNewCustomers(assessment) : null;
  const coachingEntry = isCompletedAssessment(assessment)
    ? '<button type="button" class="secondary-action" data-start-coaching>지금 고민 해결하기</button>'
    : "";

  const assessmentSummary = assessment
    ? `<section class="dashboard-summary" aria-label="최근 진단 요약">
        <h2>최근 진단 요약</h2>
        ${target === null ? "<p>목표 매출을 다시 확인해 주세요.</p>" : `<p>목표 월 매출 ${number.format(target)}원</p>`}
        ${ceiling === null ? "" : `<p>전부 신규 고객으로 채운다고 가정한 최대 ${number.format(ceiling)}명입니다.</p>`}
      </section>`
    : `<section class="dashboard-summary"><h2>아직 진단한 내용이 없어요.</h2><p>최근 매출과 목표 매출만 먼저 적어 보면 됩니다.</p></section>`;

  const currentAction = currentPlan
    ? `<section class="current-action action-card" aria-labelledby="current-action-title">
        <p class="eyebrow">지금 할 행동 하나</p>
        <h2 id="current-action-title">${escapeHtml(actionName(currentPlan))}</h2>
        <div class="action-meta"><div><span>결과 확인 예정</span><strong>${escapeHtml(dueDate(currentPlan.checkInDueAt))}</strong></div><div><span>확인할 숫자</span><strong>${escapeHtml(currentPlan.metric)}</strong></div></div>
        <button type="button" class="primary-action" data-complete-plan="${escapeHtml(currentPlan.id)}">실행 결과 기록하기</button>
      </section>`
    : `<section class="current-action action-card"><h2>오늘 할 행동을 정해 볼까요?</h2><p>진단을 시작하면 지금 할 수 있는 가장 작은 행동 하나를 보여드려요.</p></section>`;

  const upcomingPlans = upcoming.length
    ? `<section class="upcoming-actions"><h2>다음 예정</h2><ul>${upcoming.map((plan) => `<li>${escapeHtml(actionName(plan))} · 결과 확인 예정 ${escapeHtml(dueDate(plan.checkInDueAt))}</li>`).join("")}</ul></section>`
    : "";
  const completedPlans = completed.length
    ? `<section class="action-history" aria-labelledby="history-title"><h2 id="history-title">지난 결과 기록</h2><ul>${completed.map((plan) => `<li><strong>${escapeHtml(actionName(plan))}</strong><div class="before-after"><span><small>실행 전</small><strong>${escapeHtml(text(plan.beforeValue))}</strong></span><span class="before-after-arrow" aria-hidden="true">→</span><span><small>실행 후</small><strong>${escapeHtml(text(plan.afterValue))}</strong></span><span class="sr-only">실행 전 ${escapeHtml(text(plan.beforeValue))} · 실행 후 ${escapeHtml(text(plan.afterValue))}</span></div>${plan.note ? `<span class="history-note">메모: ${escapeHtml(plan.note)}</span>` : ""}</li>`).join("")}</ul></section>`
    : `<section class="action-history"><h2>지난 결과 기록</h2><p>아직 기록이 없습니다. 작은 변화도 적어 두면 다음 판단에 도움이 됩니다.</p></section>`;

  return `
    <header class="work-header"><a class="work-brand" href="/" aria-label="장사네비게이션 홈"><span class="brand-symbol" aria-hidden="true">N</span><strong>장사네비게이션</strong></a>${session.mode === "live" ? '<button type="button" class="quiet-button" data-sign-out>로그아웃</button>' : '<span class="status-chip">샘플 모드</span>'}</header>
    <main id="main" class="dashboard-shell">
      <section class="dashboard-hero"><div><p class="eyebrow">내 가게 대시보드</p><h1>${escapeHtml(profile?.businessName ?? "내 매장")}의 다음 한 걸음</h1><p>${escapeHtml(profile?.name ?? "사장님")}님, 모든 것을 한꺼번에 바꾸지 않아도 됩니다.</p></div>${assessmentSummary}</section>
      ${currentAction}
      ${checkInForm(activePlan, checkInValues)}
      ${upcomingPlans}
      ${completedPlans}
      <div class="dashboard-actions"><button type="button" class="secondary-action" data-start-diagnosis>오늘 할 행동 찾기</button>${coachingEntry}</div>
      <p class="form-status" role="status" aria-live="polite" data-dashboard-status>${escapeHtml(status)}</p>
    </main>`;
}

function requiredText(
  root: HTMLElement,
  name: "beforeValue" | "afterValue",
): string | null {
  const input = root.querySelector<HTMLInputElement>(`[name='${name}']`);
  const error = root.querySelector<HTMLElement>(`#${name}-error`);
  const value = input?.value.trim() ?? "";
  if (value) return value;
  if (input) {
    input.setAttribute("aria-invalid", "true");
    input.focus();
  }
  if (error) error.textContent = "값을 적어 주세요.";
  return null;
}

export async function renderDashboard(
  root: HTMLElement,
  session: AppSession,
  service: AppService,
  onStartDiagnosis: () => void,
  onSignedOut: () => void = onStartDiagnosis,
  onStartCoaching: (assessmentId: string) => void = () => undefined,
): Promise<void> {
  const signOut = async (button: HTMLButtonElement) => {
    button.disabled = true;
    try {
      await service.signOut();
      onSignedOut();
    } catch {
      button.disabled = false;
      const status = root.querySelector<HTMLElement>("[data-dashboard-status]");
      if (status) {
        status.textContent =
          "로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.";
      }
    }
  };

  let assessment: AssessmentSnapshot | null;
  let plans: ActionPlanRecord[];
  try {
    [assessment, plans] = await Promise.all([
      service.getLatestAssessment(),
      service.listActionPlans(),
    ]);
  } catch {
    root.innerHTML = `<header class="work-header"><a class="work-brand" href="/" aria-label="장사네비게이션 홈"><span class="brand-symbol" aria-hidden="true">N</span><strong>장사네비게이션</strong></a>${session.mode === "live" ? '<button type="button" class="quiet-button" data-sign-out>로그아웃</button>' : ""}</header><main id="main" class="dashboard-shell error-state"><p class="eyebrow">연결 상태 확인</p><h1>정보를 불러오지 못했습니다.</h1><p>입력한 내용은 그대로 있습니다. 잠시 후 새로 진단하거나 다시 접속해 주세요.</p><button type="button" data-start-diagnosis>오늘 할 행동 찾기</button><p class="form-status" role="status" aria-live="polite" data-dashboard-status></p></main>`;
    root
      .querySelector<HTMLButtonElement>("[data-start-diagnosis]")
      ?.addEventListener("click", onStartDiagnosis);
    root
      .querySelector<HTMLButtonElement>("[data-sign-out]")
      ?.addEventListener(
        "click",
        (event) => void signOut(event.currentTarget as HTMLButtonElement),
      );
    return;
  }

  let activePlan: ActionPlanRecord | null = null;
  let checkInValues: CheckInValues = {
    beforeValue: "",
    afterValue: "",
    note: "",
  };
  let status = "";
  let saving = false;
  const coachingAssessmentId =
    assessment && isCompletedAssessment(assessment) ? assessment.id : null;

  const render = () => {
    root.innerHTML = dashboardMarkup(
      session,
      assessment,
      plans,
      activePlan,
      checkInValues,
      status,
    );
    root
      .querySelector<HTMLButtonElement>("[data-start-diagnosis]")
      ?.addEventListener("click", onStartDiagnosis);
    if (coachingAssessmentId) {
      root
        .querySelector<HTMLButtonElement>("[data-start-coaching]")
        ?.addEventListener("click", () => onStartCoaching(coachingAssessmentId));
    }
    root
      .querySelector<HTMLButtonElement>("[data-complete-plan]")
      ?.addEventListener("click", () => {
        activePlan =
          plans.find(
            (plan) =>
              plan.id ===
              root.querySelector<HTMLButtonElement>("[data-complete-plan]")
                ?.dataset.completePlan,
          ) ?? null;
        checkInValues = { beforeValue: "", afterValue: "", note: "" };
        render();
        root.querySelector<HTMLInputElement>("[name='beforeValue']")?.focus();
      });
    root
      .querySelector<HTMLFormElement>("[data-checkin-form]")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!activePlan || saving) return;
        const beforeValue = requiredText(root, "beforeValue");
        if (beforeValue === null) return;
        const afterValue = requiredText(root, "afterValue");
        if (afterValue === null) return;
        const note =
          root
            .querySelector<HTMLTextAreaElement>("[name='note']")
            ?.value.trim() ?? "";
        checkInValues = { beforeValue, afterValue, note };
        saving = true;
        const submit = root.querySelector<HTMLButtonElement>(
          "[data-submit-checkin]",
        );
        if (submit) submit.disabled = true;
        try {
          const completed = await service.completeActionPlan(
            activePlan.id,
            beforeValue,
            afterValue,
            note,
          );
          plans = plans.map((plan) =>
            plan.id === completed.id ? completed : plan,
          );
          activePlan = null;
          checkInValues = { beforeValue: "", afterValue: "", note: "" };
          status = "결과 기록 완료";
          render();
        } catch {
          saving = false;
          status = "결과를 기록하지 못했습니다. 잠시 후 다시 시도해 주세요.";
          render();
          root
            .querySelector<HTMLButtonElement>("[data-submit-checkin]")
            ?.focus();
        }
      });
    root
      .querySelector<HTMLButtonElement>("[data-sign-out]")
      ?.addEventListener(
        "click",
        (event) => void signOut(event.currentTarget as HTMLButtonElement),
      );
  };

  render();
}
