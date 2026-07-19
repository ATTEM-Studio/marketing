import type {
  AdvertisingInputs,
  BottleneckInputs,
  Capacity,
  GoalAllocationInput,
  PrimaryConcern,
  ReturningDataStatus,
  RevenueInputs,
} from "../domain/types";
import {
  calculateRevenueMetrics,
  validateAdvertisingInputs,
  validateGoalAllocation,
  validateRevenueInputs,
} from "../domain/revenue";

export interface DiagnosisInput {
  revenue: RevenueInputs;
  allocation: GoalAllocationInput;
  advertising: AdvertisingInputs;
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
  const parsed = Number(value.value.replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

function hasInvalidNumber(form: HTMLFormElement, name: string): boolean {
  const value = form.elements.namedItem(name);
  if (!(value instanceof HTMLInputElement)) return true;
  const normalized = value.value.replaceAll(",", "").trim();
  return normalized !== "" && !Number.isFinite(Number(normalized));
}

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

const percentageValue = (
  form: HTMLFormElement,
  name: string,
): number | null => {
  const value = nullableNumberValue(form, name);
  return value === null ? null : value / 100;
};

const radioValue = (form: HTMLFormElement, name: string): string | null =>
  form.querySelector<HTMLInputElement>(`[name='${name}']:checked`)?.value ??
  null;

const comparable = (form: HTMLFormElement, name: string) => ({
  previous: nullableNumberValue(form, `${name}Previous`),
  current: nullableNumberValue(form, `${name}Current`),
});

export function readDiagnosisForm(form: HTMLFormElement): DiagnosisInput {
  const selectedReturningDataStatus = (radioValue(
    form,
    "returningDataStatus",
  ) ?? "unknown") as ReturningDataStatus;
  const hasConnectedVisitHistory =
    radioValue(form, "hasConnectedVisitHistory") === "true";
  const returningDataStatus =
    selectedReturningDataStatus === "known" && !hasConnectedVisitHistory
      ? "unknown"
      : selectedReturningDataStatus;
  const adsRunning = radioValue(form, "adsRunning") === "true";
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
  const allocation = {
    newCustomerRevenue: nullableNumberValue(form, "newCustomerRevenue"),
    returningCustomerRevenue: nullableNumberValue(
      form,
      "returningCustomerRevenue",
    ),
    averageOrderValueRevenue: nullableNumberValue(
      form,
      "averageOrderValueRevenue",
    ),
  };
  const advertising = adsRunning
    ? {
        visitConversionRate: percentageValue(form, "visitConversionRate"),
        costPerClick: nullableNumberValue(form, "costPerClick"),
        actualAdNewCustomers: nullableNumberValue(form, "actualAdNewCustomers"),
      }
    : {
        visitConversionRate: null,
        costPerClick: null,
        actualAdNewCustomers: null,
      };
  const adAttributionKnown =
    validateAdvertisingInputs(advertising).length === 0 &&
    advertising.visitConversionRate !== null &&
    advertising.costPerClick !== null &&
    advertising.actualAdNewCustomers !== null;

  return {
    revenue,
    allocation,
    advertising,
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
    adsRunning,
    adAttributionKnown,
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

function allocationFields(): string {
  return `<details class="optional-details"><summary>부족 매출을 직접 나눠 보기 (선택)</summary>
    <p>입력하지 않으면 전원 신규 고객 상한선만 계산합니다. 비율이나 추천 분배는 제시하지 않습니다.</p>
    ${numberField("newCustomerRevenue", "신규 고객 증가로 채울 매출", false)}
    ${numberField("returningCustomerRevenue", "재방문 증가로 채울 매출", false)}
    ${numberField("averageOrderValueRevenue", "객단가 상승으로 채울 매출", false)}
    ${renderError("allocation")}
  </details>`;
}

function advertisingFields(): string {
  return `<section data-advertising-fields hidden>
    <details class="optional-details"><summary>실제 광고 데이터를 입력하기 (선택)</summary>
      <p>세 값을 모두 실제 기록으로 입력한 경우에만 광고 추정치를 보여 드립니다.</p>
      ${numberField("visitConversionRate", "실제 방문 전환율 (%)", false)}
      ${numberField("costPerClick", "실제 평균 클릭 비용", false)}
      ${numberField("actualAdNewCustomers", "광고 유입 실제 신규 고객 수", false)}
    </details>
  </section>`;
}

function choice(name: string, value: string, label: string): string {
  return `<label class="choice"><input type="radio" name="${name}" value="${value}" aria-describedby="${name}-error" /> ${label}</label>`;
}

function choiceGroup(
  name: string,
  legend: string,
  values: readonly [string, string][],
): string {
  return `<fieldset class="choice-group" data-choice-group="${name}" aria-describedby="${name}-error"><legend>${legend}</legend>${values
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
  const controlNames =
    name === "allocation"
      ? [
          "newCustomerRevenue",
          "returningCustomerRevenue",
          "averageOrderValueRevenue",
        ]
      : [name];
  controlNames.forEach((controlName) => {
    form
      .querySelectorAll<HTMLInputElement>(`[name='${controlName}']`)
      .forEach((control) => {
        control.setAttribute("aria-invalid", "true");
      });
  });
  form
    .querySelector<HTMLElement>(`[data-choice-group='${name}']`)
    ?.setAttribute("aria-invalid", "true");
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
  form
    .querySelectorAll<HTMLElement>("[data-choice-group][aria-invalid='true']")
    .forEach((group) => {
      group.removeAttribute("aria-invalid");
    });
}

function syncAdvertisingFields(
  form: HTMLFormElement,
  enabled = radioValue(form, "adsRunning") === "true",
): void {
  const fields = form.querySelector<HTMLElement>("[data-advertising-fields]");
  if (!fields) return;
  fields.hidden = !enabled;
  fields.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
    input.disabled = !enabled;
    if (!enabled) {
      input.value = "";
      input.removeAttribute("aria-invalid");
    }
  });
  if (!enabled) {
    fields.querySelectorAll<HTMLElement>(".field-error").forEach((error) => {
      error.textContent = "";
    });
  }
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
      if (hasInvalidNumber(form, name)) {
        errors.push({ name, message: "숫자만 입력해 주세요." });
      }
    });
    [
      "newCustomerRevenue",
      "returningCustomerRevenue",
      "averageOrderValueRevenue",
    ].forEach((name) => {
      if (hasInvalidNumber(form, name)) {
        errors.push({ name, message: "숫자만 입력해 주세요." });
      }
    });
    if (errors.length === 0) {
      validateRevenueInputs(readDiagnosisForm(form).revenue).forEach(
        (error) => {
          errors.push({ name: error.field, message: error.message });
        },
      );
    }
    if (errors.length === 0) {
      const input = readDiagnosisForm(form);
      const metrics = calculateRevenueMetrics(input.revenue);
      validateGoalAllocation(
        input.allocation,
        metrics.shortfallRevenue,
      ).forEach((error) => {
        errors.push({ name: error.field, message: error.message });
      });
    }
  }
  if (step === 2) {
    ["monthlyCustomerCountStatus", "primaryConcern"].forEach((name) => {
      if (!radioValue(form, name)) {
        errors.push({ name, message: "하나를 선택해 주세요." });
      }
    });
    if (radioValue(form, "monthlyCustomerCountStatus") === "known") {
      const customerCount = form.elements.namedItem("monthlyCustomerCount");
      if (
        customerCount instanceof HTMLInputElement &&
        customerCount.value.trim() === ""
      ) {
        errors.push({
          name: "monthlyCustomerCount",
          message: "값을 입력해 주세요.",
        });
      } else if (hasInvalidNumber(form, "monthlyCustomerCount")) {
        errors.push({
          name: "monthlyCustomerCount",
          message: "숫자만 입력해 주세요.",
        });
      } else if (numberValue(form, "monthlyCustomerCount") < 1) {
        errors.push({
          name: "monthlyCustomerCount",
          message: "월 고객 수는 1명 이상 입력해 주세요.",
        });
      }
    }
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
    if (radioValue(form, "adsRunning") === "true") {
      ["visitConversionRate", "costPerClick", "actualAdNewCustomers"].forEach(
        (name) => {
          if (hasInvalidNumber(form, name)) {
            errors.push({ name, message: "숫자만 입력해 주세요." });
          }
        },
      );
    }
    if (errors.length === 0 && radioValue(form, "adsRunning") === "true") {
      validateAdvertisingInputs(readDiagnosisForm(form).advertising).forEach(
        (error) => {
          errors.push({ name: error.field, message: error.message });
        },
      );
    }
  }
  errors.forEach((error) => setError(form, error.name, error.message));
  if (errors[0]) {
    const focusName =
      errors[0].name === "allocation" ? "newCustomerRevenue" : errors[0].name;
    form.querySelector<HTMLElement>(`[name='${focusName}']`)?.focus();
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
          ${allocationFields()}
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
            "hasConnectedVisitHistory",
            "연결된 방문 이력이 있나요?",
            [
              ["true", "있어요"],
              ["false", "없어요"],
            ],
          )}
          ${advertisingFields()}
          <details><summary>비교할 수치가 있으면 더 입력하기 (선택)</summary>
            ${detailsFields("exposure", "노출")}${detailsFields("click", "클릭")}${detailsFields("visit", "방문")}${detailsFields("averageOrderValueMetric", "객단가")}${detailsFields("returning", "재방문")}
          </details>
          <div class="button-row"><button type="button" data-prev-step>이전</button><button type="submit" data-submit-diagnosis>결과 보기</button></div>
          <p data-save-status class="form-status" role="status" aria-live="polite"></p>
        </fieldset>
      </form>
    </main>`;

  const form = root.querySelector<HTMLFormElement>("[data-diagnosis-form]");
  if (!form) return;
  syncAdvertisingFields(form);
  let step: Step = 1;
  form.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.name === "adsRunning") {
      syncAdvertisingFields(form, target.value === "true");
    }
  });
  form
    .querySelectorAll<HTMLInputElement>("[name='adsRunning']")
    .forEach((input) => {
      input.addEventListener("click", () =>
        syncAdvertisingFields(form, input.value === "true"),
      );
    });
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
