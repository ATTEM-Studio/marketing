import type {
  BottleneckInputs,
  Capacity,
  PrimaryConcern,
  ReturningDataStatus,
  RevenueInputs,
} from "../domain/types";
import { validateRevenueInputs } from "../domain/revenue";

export interface DiagnosisInput {
  revenue: RevenueInputs;
  bottleneck: BottleneckInputs;
  primaryConcern: PrimaryConcern;
  capacity: Capacity;
  returningDataStatus: ReturningDataStatus;
  hasConsentDb: boolean;
  canChangeMenu: boolean;
  adsRunning: boolean;
  adAttributionKnown: boolean;
}

type Step = 1 | 2 | 3;
type RenderOptions = {
  onSubmit(input: DiagnosisInput): Promise<void> | void;
};

const numberValue = (form: HTMLFormElement, name: string): number => {
  const value = form.elements.namedItem(name);
  if (!(value instanceof HTMLInputElement)) return 0;
  return Number(value.value.replaceAll(",", "").trim()) || 0;
};

const nullableNumberValue = (
  form: HTMLFormElement,
  name: string,
): number | null => {
  const value = form.elements.namedItem(name);
  if (!(value instanceof HTMLInputElement) || value.value.trim() === "") {
    return null;
  }
  const parsed = Number(value.value.replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const radioValue = (form: HTMLFormElement, name: string): string | null =>
  form.querySelector<HTMLInputElement>(`[name='${name}']:checked`)?.value ??
  null;

const comparable = (form: HTMLFormElement, name: string) => ({
  previous: nullableNumberValue(form, `${name}Previous`),
  current: nullableNumberValue(form, `${name}Current`),
});

export function readDiagnosisForm(form: HTMLFormElement): DiagnosisInput {
  const returningDataStatus = (radioValue(form, "returningDataStatus") ??
    "unknown") as ReturningDataStatus;
  const hasConnectedVisitHistory =
    radioValue(form, "hasConnectedVisitHistory") === "true";
  const revenue = {
    averageMonthlyRevenue: numberValue(form, "averageMonthlyRevenue"),
    targetMonthlyRevenue: numberValue(form, "targetMonthlyRevenue"),
    averageOrderValue: numberValue(form, "averageOrderValue"),
    operatingDays: numberValue(form, "operatingDays"),
    monthlyCustomerCount:
      radioValue(form, "monthlyCustomerCountStatus") === "known"
        ? nullableNumberValue(form, "monthlyCustomerCount")
        : null,
  };

  return {
    revenue,
    bottleneck: {
      exposure: comparable(form, "exposure"),
      click: comparable(form, "click"),
      visit: comparable(form, "visit"),
      averageOrderValue: comparable(form, "averageOrderValueMetric"),
      returning:
        returningDataStatus === "known" && hasConnectedVisitHistory
          ? comparable(form, "returning")
          : { previous: null, current: null },
      returningDataStatus,
    },
    primaryConcern: (radioValue(form, "primaryConcern") ??
      "unknown") as PrimaryConcern,
    capacity: (radioValue(form, "capacity") ?? "yes") as Capacity,
    returningDataStatus,
    hasConsentDb: radioValue(form, "hasConsentDb") === "true",
    canChangeMenu: radioValue(form, "canChangeMenu") === "true",
    adsRunning: radioValue(form, "adsRunning") === "true",
    adAttributionKnown: radioValue(form, "adAttributionKnown") === "true",
  };
}

function renderError(name: string): string {
  return `<p id="${name}-error" class="field-error" role="alert"></p>`;
}

function numberField(name: string, label: string, required = true): string {
  const requiredText = required
    ? '<span aria-hidden="true">필수</span>'
    : "선택";
  return `
    <div class="field">
      <label for="${name}">${label} <small>${requiredText}</small></label>
      <input id="${name}" name="${name}" inputmode="numeric" aria-describedby="${name}-error" />
      ${renderError(name)}
    </div>`;
}

function choice(name: string, value: string, label: string): string {
  return `<label class="choice"><input type="radio" name="${name}" value="${value}" /> ${label}</label>`;
}

function choiceGroup(
  name: string,
  legend: string,
  values: readonly [string, string][],
): string {
  return `<fieldset class="choice-group" data-choice-group="${name}"><legend>${legend}</legend>${values
    .map(([value, label]) => choice(name, value, label))
    .join(
      "",
    )}<p id="${name}-error" class="field-error" role="alert"></p></fieldset>`;
}

function detailsFields(name: string, label: string): string {
  return `<div class="detail-row"><strong>${label}</strong>${numberField(`${name}Previous`, "이전 기간", false)}${numberField(`${name}Current`, "현재 기간", false)}</div>`;
}

function showStep(root: HTMLElement, step: Step): void {
  root.querySelectorAll<HTMLElement>("[data-step]").forEach((panel) => {
    panel.hidden = Number(panel.dataset.step) !== step;
  });
  root.querySelector<HTMLElement>(`[data-step='${step}'] input`)?.focus();
}

function setError(form: HTMLFormElement, name: string, message: string): void {
  const error = form.querySelector<HTMLElement>(`#${name}-error`);
  if (error) error.textContent = message;
  const control = form.querySelector<HTMLInputElement>(`[name='${name}']`);
  control?.setAttribute("aria-invalid", "true");
}

function clearErrors(form: HTMLFormElement): void {
  form.querySelectorAll<HTMLElement>(".field-error").forEach((error) => {
    error.textContent = "";
  });
  form
    .querySelectorAll<HTMLInputElement>("[aria-invalid='true']")
    .forEach((input) => {
      input.removeAttribute("aria-invalid");
    });
}

function validateStep(form: HTMLFormElement, step: Step): boolean {
  clearErrors(form);
  const errors: { name: string; message: string }[] = [];
  if (step === 1) {
    const requiredNames = [
      "averageMonthlyRevenue",
      "targetMonthlyRevenue",
      "averageOrderValue",
      "operatingDays",
    ];
    requiredNames.forEach((name) => {
      const input = form.elements.namedItem(name);
      if (input instanceof HTMLInputElement && input.value.trim() === "") {
        errors.push({ name, message: "값을 입력해 주세요." });
      }
    });
    if (errors.length === 0) {
      validateRevenueInputs(readDiagnosisForm(form).revenue).forEach(
        (error) => {
          errors.push({ name: error.field, message: error.message });
        },
      );
    }
  }
  if (step === 2) {
    ["monthlyCustomerCountStatus", "primaryConcern"].forEach((name) => {
      if (!radioValue(form, name)) {
        errors.push({ name, message: "하나를 선택해 주세요." });
      }
    });
  }
  if (step === 3) {
    [
      "capacity",
      "returningDataStatus",
      "hasConsentDb",
      "canChangeMenu",
      "adsRunning",
    ].forEach((name) => {
      if (!radioValue(form, name)) {
        errors.push({ name, message: "하나를 선택해 주세요." });
      }
    });
  }
  errors.forEach((error) => setError(form, error.name, error.message));
  if (errors[0]) {
    form.querySelector<HTMLElement>(`[name='${errors[0].name}']`)?.focus();
    return false;
  }
  return true;
}

export function renderDiagnosis(
  root: HTMLElement,
  options: RenderOptions,
): void {
  root.innerHTML = `
    <header class="site-header"><strong>장사 방향 코치</strong></header>
    <main id="main" class="diagnosis-shell">
      <p class="eyebrow">3단계 목표 진단</p>
      <h1>숫자를 차례로 확인해 볼게요.</h1>
      <p>모르는 값은 모른다고 선택해 주세요. 모르는 값을 추정해 단정하지 않습니다.</p>
      <form data-diagnosis-form novalidate>
        <fieldset data-step="1"><legend>1. 매출 목표</legend>
          ${numberField("averageMonthlyRevenue", "최근 월평균 매출")}
          ${numberField("targetMonthlyRevenue", "목표 월매출")}
          ${numberField("averageOrderValue", "평균 객단가")}
          ${numberField("operatingDays", "월 영업일")}
          <button type="button" data-next-step>다음</button>
        </fieldset>
        <fieldset data-step="2" hidden><legend>2. 현재 고객 상황</legend>
          ${choiceGroup(
            "monthlyCustomerCountStatus",
            "월 고객 수를 알고 있나요?",
            [
              ["known", "알고 있어요"],
              ["unknown", "모르겠어요"],
            ],
          )}
          ${numberField("monthlyCustomerCount", "월 고객 수", false)}
          ${choiceGroup("primaryConcern", "지금 가장 궁금한 점은 무엇인가요?", [
            ["customers", "새 고객"],
            ["ads", "광고"],
            ["averageOrderValue", "객단가"],
            ["returning", "재방문"],
            ["unknown", "모르겠어요"],
          ])}
          <div class="button-row"><button type="button" data-prev-step>이전</button><button type="button" data-next-step>다음</button></div>
        </fieldset>
        <fieldset data-step="3" hidden><legend>3. 실행 조건</legend>
          ${choiceGroup("capacity", "추가 고객을 받을 여력이 있나요?", [
            ["yes", "있어요"],
            ["sometimes", "시간대에 따라 달라요"],
            ["no", "지금은 어려워요"],
          ])}
          ${choiceGroup("returningDataStatus", "재방문 데이터 상태", [
            ["known", "연결된 방문 이력으로 확인했어요"],
            ["sampled", "일부만 확인했어요"],
            ["unknown", "모르겠어요"],
          ])}
          ${choiceGroup(
            "hasConsentDb",
            "광고성 안내에 동의한 고객 목록이 있나요?",
            [
              ["true", "있어요"],
              ["false", "없어요"],
            ],
          )}
          ${choiceGroup("canChangeMenu", "메뉴나 가격 구성을 바꿀 수 있나요?", [
            ["true", "가능해요"],
            ["false", "지금은 어려워요"],
          ])}
          ${choiceGroup("adsRunning", "현재 광고를 하고 있나요?", [
            ["true", "하고 있어요"],
            ["false", "하지 않아요"],
          ])}
          ${choiceGroup(
            "adAttributionKnown",
            "광고를 보고 실제 방문한 고객 수를 알고 있나요?",
            [
              ["true", "알고 있어요"],
              ["false", "모르겠어요"],
            ],
          )}
          ${choiceGroup(
            "hasConnectedVisitHistory",
            "연결된 방문 이력이 있나요?",
            [
              ["true", "있어요"],
              ["false", "없어요"],
            ],
          )}
          <details><summary>비교할 수치가 있으면 더 입력하기 (선택)</summary>
            ${detailsFields("exposure", "노출")}${detailsFields("click", "클릭")}${detailsFields("visit", "방문")}${detailsFields("averageOrderValueMetric", "객단가")}${detailsFields("returning", "재방문")}
          </details>
          <div class="button-row"><button type="button" data-prev-step>이전</button><button type="submit" data-submit-diagnosis>결과 보기</button></div>
        </fieldset>
      </form>
    </main>`;

  const form = root.querySelector<HTMLFormElement>("[data-diagnosis-form]");
  if (!form) return;
  let step: Step = 1;
  form.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.hasAttribute("data-next-step") && validateStep(form, step)) {
      step = (step + 1) as Step;
      showStep(root, step);
    }
    if (target.hasAttribute("data-prev-step")) {
      step = (step - 1) as Step;
      showStep(root, step);
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateStep(form, 3)) return;
    await options.onSubmit(readDiagnosisForm(form));
  });
}
