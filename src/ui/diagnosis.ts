import type {
  AdvertisingInputs,
  BottleneckInputs,
  Capacity,
  GoalAllocationInput,
  AverageStayBand,
  PeakOccupancy,
  PrimaryConcern,
  RestaurantOperationsInput,
  ReturningDataStatus,
  RevenueInputs,
} from "../domain/types";
import { validateRestaurantOperations } from "../domain/restaurant";
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
  restaurant: RestaurantOperationsInput;
  primaryConcern: PrimaryConcern;
  capacity: Capacity;
  returningDataStatus: ReturningDataStatus;
  hasConsentDb: boolean;
  canChangeMenu: boolean;
  adsRunning: boolean;
  adAttributionKnown: boolean;
}

type Step = 1 | 2 | 3;
type QuestionId =
  | "averageMonthlyRevenue"
  | "targetMonthlyRevenue"
  | "averageOrderValue"
  | "operatingDays"
  | "monthlyCustomerCountStatus"
  | "primaryConcern"
  | "capacity"
  | "returningDataStatus"
  | "hasConsentDb"
  | "canChangeMenu"
  | "adsRunning";
type RenderOptions = {
  onSubmit(input: DiagnosisInput): Promise<void> | void;
};

const questions: readonly { id: QuestionId; step: Step }[] = [
  { id: "averageMonthlyRevenue", step: 1 },
  { id: "targetMonthlyRevenue", step: 1 },
  { id: "averageOrderValue", step: 1 },
  { id: "operatingDays", step: 1 },
  { id: "monthlyCustomerCountStatus", step: 2 },
  { id: "primaryConcern", step: 2 },
  { id: "capacity", step: 3 },
  { id: "returningDataStatus", step: 3 },
  { id: "hasConsentDb", step: 3 },
  { id: "canChangeMenu", step: 3 },
  { id: "adsRunning", step: 3 },
];

const chapterTitles: Record<Step, string> = {
  1: "매출 목표",
  2: "현재 고객 상황",
  3: "실행 조건",
};

const questionByErrorField: Readonly<Record<string, QuestionId>> = {
  averageMonthlyRevenue: "averageMonthlyRevenue",
  targetMonthlyRevenue: "targetMonthlyRevenue",
  averageOrderValue: "averageOrderValue",
  operatingDays: "operatingDays",
  newCustomerRevenue: "operatingDays",
  returningCustomerRevenue: "operatingDays",
  averageOrderValueRevenue: "operatingDays",
  allocation: "operatingDays",
  monthlyCustomerCountStatus: "monthlyCustomerCountStatus",
  monthlyCustomerCount: "monthlyCustomerCountStatus",
  primaryConcern: "primaryConcern",
  capacity: "capacity",
  returningDataStatus: "returningDataStatus",
  hasConsentDb: "hasConsentDb",
  canChangeMenu: "canChangeMenu",
  adsRunning: "adsRunning",
  visitConversionRate: "adsRunning",
  costPerClick: "adsRunning",
  actualAdNewCustomers: "adsRunning",
  actualAdSpend: "adsRunning",
  restaurantSeats: "capacity",
  restaurantHallHours: "capacity",
  restaurantPeakOccupancy: "capacity",
  restaurantAveragePartySize: "capacity",
  restaurantAverageStayBand: "capacity",
  dineInShare: "capacity",
  takeoutShare: "capacity",
  deliveryShare: "capacity",
  channelShares: "capacity",
};

const restaurantErrorField: Readonly<Record<string, string>> = {
  seats: "restaurantSeats",
  hallHours: "restaurantHallHours",
  peakOccupancy: "restaurantPeakOccupancy",
  averagePartySize: "restaurantAveragePartySize",
  averageStayBand: "restaurantAverageStayBand",
  dineIn: "dineInShare",
  takeout: "takeoutShare",
  delivery: "deliveryShare",
  channelShares: "channelShares",
};

const restaurantErrorNames = new Set(Object.values(restaurantErrorField));

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
        actualAdSpend: nullableNumberValue(form, "actualAdSpend"),
      }
    : {
        visitConversionRate: null,
        costPerClick: null,
        actualAdNewCustomers: null,
        actualAdSpend: null,
      };
  const adAttributionKnown =
    validateAdvertisingInputs(advertising).length === 0 &&
    advertising.visitConversionRate !== null &&
    advertising.costPerClick !== null &&
    advertising.actualAdNewCustomers !== null &&
    advertising.actualAdSpend !== null;
  const restaurant: RestaurantOperationsInput = {
    seats: nullableNumberValue(form, "restaurantSeats"),
    hallHours: nullableNumberValue(form, "restaurantHallHours"),
    peakOccupancy: radioValue(
      form,
      "restaurantPeakOccupancy",
    ) as PeakOccupancy | null,
    averagePartySize: nullableNumberValue(form, "restaurantAveragePartySize"),
    averageStayBand: radioValue(
      form,
      "restaurantAverageStayBand",
    ) as AverageStayBand | null,
    channelShares: {
      dineIn: nullableNumberValue(form, "dineInShare"),
      takeout: nullableNumberValue(form, "takeoutShare"),
      delivery: nullableNumberValue(form, "deliveryShare"),
    },
  };

  return {
    revenue,
    allocation,
    advertising,
    restaurant,
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
  const unit = name.toLowerCase().includes("day")
    ? "일"
    : name.toLowerCase().includes("rate")
      ? "%"
      : name.toLowerCase().includes("count") ||
          name.toLowerCase().includes("customer")
        ? "명"
        : "원";
  return `
    <div class="field">
      <label for="${name}">${label} <small>${requiredText}</small></label>
      <div class="input-with-unit"><input id="${name}" name="${name}" inputmode="numeric" aria-describedby="${name}-error" /><span class="field-unit" aria-hidden="true">${unit}</span></div>
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
      <p>네 값을 모두 실제 기록으로 입력한 경우에만 광고 추정치와 실제 기준 CAC를 보여 드립니다.</p>
      ${numberField("visitConversionRate", "실제 방문 전환율 (%)", false)}
      ${numberField("costPerClick", "실제 평균 클릭 비용", false)}
      ${numberField("actualAdNewCustomers", "광고 유입 실제 신규 고객 수", false)}
      ${numberField("actualAdSpend", "실제 집행 광고비", false)}
    </details>
  </section>`;
}

function restaurantNumberField(
  name: string,
  label: string,
  unit: string,
  sharedErrorName?: string,
): string {
  const describedBy = [
    `${name}-error`,
    sharedErrorName && `${sharedErrorName}-error`,
  ]
    .filter(Boolean)
    .join(" ");
  return `<div class="field">
    <label for="${name}">${label} <small>선택</small></label>
    <div class="input-with-unit"><input id="${name}" name="${name}" inputmode="decimal" aria-describedby="${describedBy}" /><span class="field-unit" aria-hidden="true">${unit}</span></div>
    ${renderError(name)}
  </div>`;
}

function restaurantDetails(): string {
  return `<details class="optional-details restaurant-details" data-restaurant-details>
    <summary>우리 가게 운영 정보로 더 정확히 계산하기 <span>선택</span></summary>
    <p>알고 있는 내용만 입력해도 괜찮아요. 비워두면 기본 결과를 볼 수 있습니다.</p>
    ${restaurantNumberField("restaurantSeats", "좌석 수", "석")}
    ${restaurantNumberField("restaurantHallHours", "하루 홀 운영 시간", "시간")}
    ${choiceGroup("restaurantPeakOccupancy", "가장 붐비는 시간의 좌석 상황", [
      ["spacious", "여유 있어요"],
      ["half", "절반 정도 차요"],
      ["almost_full", "거의 차요"],
      ["waiting", "대기가 생겨요"],
    ])}
    ${restaurantNumberField("restaurantAveragePartySize", "평균 일행 수", "명")}
    ${choiceGroup("restaurantAverageStayBand", "평균 체류 시간", [
      ["under_30", "30분 미만"],
      ["30_60", "30~60분"],
      ["60_90", "60~90분"],
      ["over_90", "90분 이상"],
      ["unknown", "잘 모르겠어요"],
    ])}
    ${restaurantNumberField("dineInShare", "매장 식사 비중", "%", "channelShares")}
    ${restaurantNumberField("takeoutShare", "포장 비중", "%", "channelShares")}
    ${restaurantNumberField("deliveryShare", "배달 비중", "%", "channelShares")}
    <p id="channelShares-error" class="field-error" role="alert"></p>
  </details>`;
}

function choice(name: string, value: string, label: string): string {
  return `<label class="choice choice-card"><input type="radio" name="${name}" value="${value}" aria-describedby="${name}-error" /><span>${label}</span></label>`;
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

function showQuestion(root: HTMLElement, index: number): void {
  const current = questions[index];
  if (!current) return;
  root.querySelectorAll<HTMLElement>("[data-step]").forEach((panel) => {
    panel.hidden = Number(panel.dataset.step) !== current.step;
  });
  root.querySelectorAll<HTMLElement>("[data-question]").forEach((panel) => {
    panel.hidden = panel.dataset.question !== current.id;
  });
  const chapterQuestions = questions.filter(
    (item) => item.step === current.step,
  );
  const questionNumber =
    chapterQuestions.findIndex((item) => item.id === current.id) + 1;
  const questionLabel = root.querySelector<HTMLElement>(
    "[data-question-label]",
  );
  const chapterTitle = root.querySelector<HTMLElement>("[data-chapter-title]");
  const stepLabel = root.querySelector<HTMLElement>("[data-step-label]");
  const progress = root.querySelector<HTMLElement>("[data-progress]");
  const previousButton = root.querySelector<HTMLButtonElement>(
    "[data-prev-question]",
  );
  const nextButton = root.querySelector<HTMLButtonElement>(
    "[data-next-question]",
  );
  const submitButton = root.querySelector<HTMLButtonElement>(
    "[data-submit-diagnosis]",
  );
  if (questionLabel) {
    questionLabel.textContent = `질문 ${questionNumber} / ${chapterQuestions.length}`;
  }
  if (chapterTitle) chapterTitle.textContent = chapterTitles[current.step];
  if (stepLabel) stepLabel.textContent = `${current.step} / 3`;
  if (progress) {
    progress.style.width = `${Math.round((current.step / 3) * 100)}%`;
  }
  if (previousButton) previousButton.hidden = index === 0;
  if (nextButton) nextButton.hidden = index === questions.length - 1;
  if (submitButton) submitButton.hidden = index !== questions.length - 1;
  root
    .querySelector<HTMLElement>(`[data-question='${current.id}'] h2`)
    ?.focus();
}

function restaurantValidationErrors(form: HTMLFormElement) {
  const errors: { name: string; message: string }[] = [];
  [
    "restaurantSeats",
    "restaurantHallHours",
    "restaurantAveragePartySize",
    "dineInShare",
    "takeoutShare",
    "deliveryShare",
  ].forEach((name) => {
    if (hasInvalidNumber(form, name)) {
      errors.push({ name, message: "숫자만 입력해주세요." });
    }
  });
  validateRestaurantOperations(readDiagnosisForm(form).restaurant).forEach(
    (error) => {
      errors.push({
        name: restaurantErrorField[error.field] ?? error.field,
        message: error.message,
      });
    },
  );
  return errors;
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
      : name === "channelShares"
        ? ["dineInShare", "takeoutShare", "deliveryShare"]
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

function presentValidationErrors(
  form: HTMLFormElement,
  errors: readonly { name: string; message: string }[],
  revealErrorQuestion?: (field: string) => void,
): boolean {
  const firstError = errors[0];
  if (!firstError) return true;

  revealErrorQuestion?.(firstError.name);
  if (restaurantErrorNames.has(firstError.name)) {
    const details = form.querySelector<HTMLDetailsElement>(
      "[data-restaurant-details]",
    );
    if (details) details.open = true;
  }
  errors.forEach((error) => setError(form, error.name, error.message));
  const focusName =
    firstError.name === "allocation"
      ? "newCustomerRevenue"
      : firstError.name === "channelShares"
        ? "dineInShare"
        : firstError.name;
  form.querySelector<HTMLElement>(`[name='${focusName}']`)?.focus();
  return false;
}

function validateQuestion(form: HTMLFormElement, id: QuestionId): boolean {
  clearErrors(form);
  if (
    [
      "averageMonthlyRevenue",
      "targetMonthlyRevenue",
      "averageOrderValue",
      "operatingDays",
    ].includes(id)
  ) {
    const input = form.elements.namedItem(id);
    if (!(input instanceof HTMLInputElement) || input.value.trim() === "") {
      setError(form, id, "값을 입력해주세요.");
      if (input instanceof HTMLInputElement) input.focus();
      return false;
    }
    if (hasInvalidNumber(form, id)) {
      setError(form, id, "숫자만 입력해주세요.");
      input.focus();
      return false;
    }
  }
  if (
    [
      "monthlyCustomerCountStatus",
      "primaryConcern",
      "capacity",
      "returningDataStatus",
      "hasConsentDb",
      "canChangeMenu",
      "adsRunning",
    ].includes(id) &&
    !radioValue(form, id)
  ) {
    setError(form, id, "하나를 선택해주세요.");
    form.querySelector<HTMLInputElement>(`[name='${id}']`)?.focus();
    return false;
  }
  if (id === "capacity") {
    const errors = restaurantValidationErrors(form);
    return presentValidationErrors(form, errors);
  }
  return true;
}

function updateCoachingFeedback(form: HTMLFormElement): void {
  const feedback = form.querySelector<HTMLElement>("[data-coaching-feedback]");
  if (!feedback) return;
  const current = numberValue(form, "averageMonthlyRevenue");
  const target = numberValue(form, "targetMonthlyRevenue");
  feedback.textContent =
    current > 0 && target > current
      ? `목표까지 월 ${new Intl.NumberFormat("ko-KR").format(target - current)}원이 더 필요해요.`
      : "";
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

function validateStep(
  form: HTMLFormElement,
  step: Step,
  revealErrorQuestion?: (field: string) => void,
): boolean {
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
      [
        "visitConversionRate",
        "costPerClick",
        "actualAdNewCustomers",
        "actualAdSpend",
      ].forEach((name) => {
        if (hasInvalidNumber(form, name)) {
          errors.push({ name, message: "숫자만 입력해 주세요." });
        }
      });
    }
    if (errors.length === 0 && radioValue(form, "adsRunning") === "true") {
      validateAdvertisingInputs(readDiagnosisForm(form).advertising).forEach(
        (error) => {
          errors.push({ name: error.field, message: error.message });
        },
      );
    }
    restaurantValidationErrors(form).forEach((error) => errors.push(error));
  }
  return presentValidationErrors(form, errors, revealErrorQuestion);
}

export function renderDiagnosis(
  root: HTMLElement,
  options: RenderOptions,
): void {
  root.innerHTML = `
    <header class="work-header">
      <a class="work-brand" href="/" aria-label="장사네비게이션 홈"><span class="brand-symbol" aria-hidden="true">N</span><strong>장사네비게이션</strong></a>
      <div class="progress-area">
        <div class="progress-copy"><span data-chapter-title>매출 목표</span><strong data-step-label>1 / 3</strong><span data-question-label>질문 1 / 4</span></div>
        <div class="progress-track" aria-hidden="true"><span data-progress style="width: 33%"></span></div>
      </div>
    </header>
    <main id="main" class="diagnosis-shell">
      <p class="eyebrow">내 가게 숫자 점검</p>
      <h1>아는 수치부터 차례로 확인해 볼게요.</h1>
      <p class="page-description">모르는 값은 편하게 모른다고 선택해 주세요. 확인되지 않은 값은 추정해 단정하지 않습니다.</p>
      <form class="diagnosis-stage" data-diagnosis-form novalidate>
        <fieldset class="step-panel" data-step="1"><legend><span>1단계</span> 매출 목표</legend>
          <p class="step-description">현재 위치와 목표를 입력하면 필요한 고객 수의 기준을 계산합니다.</p>
          <section class="question-card" data-question="averageMonthlyRevenue">
            <p class="question-number">질문 1</p>
            <h2 tabindex="-1">최근 한 달 평균 매출은 어느 정도인가요?</h2>
            <p class="question-help">정확하지 않아도 괜찮아요. 가장 가까운 금액을 적어주세요.</p>
            ${numberField("averageMonthlyRevenue", "최근 월평균 매출")}
          </section>
          <section class="question-card" data-question="targetMonthlyRevenue" hidden>
            <p class="question-number">질문 2</p>
            <h2 tabindex="-1">목표로 하는 한 달 매출은 얼마인가요?</h2>
            <p class="question-help">지금 달성하고 싶은 현실적인 목표 금액을 적어주세요.</p>
            ${numberField("targetMonthlyRevenue", "목표 월매출")}
          </section>
          <section class="question-card" data-question="averageOrderValue" hidden>
            <p class="question-number">질문 3</p>
            <h2 tabindex="-1">평균 객단가는 얼마인가요?</h2>
            <p class="question-help">고객 한 명이 한 번 방문해 결제하는 평균 금액을 적어주세요.</p>
            ${numberField("averageOrderValue", "평균 객단가")}
          </section>
          <section class="question-card" data-question="operatingDays" hidden>
            <p class="question-number">질문 4</p>
            <h2 tabindex="-1">한 달에 며칠 영업하나요?</h2>
            <p class="question-help">평균적인 한 달을 기준으로 영업일을 적어주세요.</p>
            ${numberField("operatingDays", "월 영업일")}
            ${allocationFields()}
          </section>
        </fieldset>
        <fieldset class="step-panel" data-step="2" hidden><legend><span>2단계</span> 현재 고객 상황</legend>
          <p class="step-description">알고 있는 고객 수와 지금 가장 궁금한 지점을 선택해 주세요.</p>
          <section class="question-card" data-question="monthlyCustomerCountStatus" hidden>
            <p class="question-number">질문 1</p>
            <h2 tabindex="-1">월 고객 수를 알고 있나요?</h2>
            <p class="question-help">모른다면 모른다고 선택해도 기본 진단을 계속할 수 있어요.</p>
            ${choiceGroup(
              "monthlyCustomerCountStatus",
              "월 고객 수를 알고 있나요?",
              [
                ["known", "알고 있어요"],
                ["unknown", "모르겠어요"],
              ],
            )}
            ${numberField("monthlyCustomerCount", "월 고객 수", false)}
          </section>
          <section class="question-card" data-question="primaryConcern" hidden>
            <p class="question-number">질문 2</p>
            <h2 tabindex="-1">지금 가장 궁금한 점은 무엇인가요?</h2>
            <p class="question-help">가장 먼저 확인하고 싶은 한 가지를 골라주세요.</p>
            ${choiceGroup(
              "primaryConcern",
              "지금 가장 궁금한 점은 무엇인가요?",
              [
                ["customers", "새 고객"],
                ["ads", "광고"],
                ["averageOrderValue", "객단가"],
                ["returning", "재방문"],
                ["unknown", "모르겠어요"],
              ],
            )}
          </section>
        </fieldset>
        <fieldset class="step-panel" data-step="3" hidden><legend><span>3단계</span> 실행 조건</legend>
          <p class="step-description">지금 실제로 바꿀 수 있는 범위를 확인해 실행 가능한 행동을 고릅니다.</p>
          <section class="question-card" data-question="capacity" hidden>
            <p class="question-number">질문 1</p>
            <h2 tabindex="-1">추가 고객을 받을 여력이 있나요?</h2>
            <p class="question-help">가장 붐비는 시간대를 기준으로 골라주세요.</p>
            ${choiceGroup("capacity", "추가 고객을 받을 여력이 있나요?", [
              ["yes", "있어요"],
              ["sometimes", "시간대에 따라 달라요"],
              ["no", "지금은 어려워요"],
            ])}
            ${restaurantDetails()}
          </section>
          <section class="question-card" data-question="returningDataStatus" hidden>
            <p class="question-number">질문 2</p>
            <h2 tabindex="-1">재방문 데이터를 어느 정도 알고 있나요?</h2>
            <p class="question-help">확인된 범위만 선택하면 돼요.</p>
            ${choiceGroup("returningDataStatus", "재방문 데이터 상태", [
              ["known", "연결된 방문 이력으로 확인했어요"],
              ["sampled", "일부만 확인했어요"],
              ["unknown", "잘 모르겠어요 — 신규 고객 기준으로 계산할게요"],
            ])}
            ${choiceGroup(
              "hasConnectedVisitHistory",
              "연결된 방문 이력이 있나요?",
              [
                ["true", "있어요"],
                ["false", "없어요"],
              ],
            )}
          </section>
          <section class="question-card" data-question="hasConsentDb" hidden>
            <p class="question-number">질문 3</p>
            <h2 tabindex="-1">광고성 안내에 동의한 고객 목록이 있나요?</h2>
            <p class="question-help">문자나 알림을 보낼 수 있는 동의 고객 목록을 기준으로 답해주세요.</p>
            ${choiceGroup(
              "hasConsentDb",
              "광고성 안내에 동의한 고객 목록이 있나요?",
              [
                ["true", "있어요"],
                ["false", "없어요"],
              ],
            )}
          </section>
          <section class="question-card" data-question="canChangeMenu" hidden>
            <p class="question-number">질문 4</p>
            <h2 tabindex="-1">메뉴나 가격 구성을 바꿀 수 있나요?</h2>
            <p class="question-help">지금 바로 시험할 수 있는 범위를 기준으로 골라주세요.</p>
            ${choiceGroup(
              "canChangeMenu",
              "메뉴나 가격 구성을 바꿀 수 있나요?",
              [
                ["true", "가능해요"],
                ["false", "지금은 어려워요"],
              ],
            )}
          </section>
          <section class="question-card" data-question="adsRunning" hidden>
            <p class="question-number">질문 5</p>
            <h2 tabindex="-1">현재 광고를 하고 있나요?</h2>
            <p class="question-help">현재 비용을 지출해 운영 중인 광고를 기준으로 답해주세요.</p>
            ${choiceGroup("adsRunning", "현재 광고를 하고 있나요?", [
              ["true", "하고 있어요"],
              ["false", "하지 않아요"],
            ])}
            ${advertisingFields()}
            <details><summary>비교할 수치가 있으면 더 입력하기 (선택)</summary>
              ${detailsFields("exposure", "노출")}${detailsFields("click", "클릭")}${detailsFields("visit", "방문")}${detailsFields("averageOrderValueMetric", "객단가")}${detailsFields("returning", "재방문")}
            </details>
          </section>
        </fieldset>
        <aside class="coaching-feedback" data-coaching-feedback aria-live="polite"></aside>
        <div class="question-actions">
          <button type="button" class="secondary-action" data-prev-question hidden>이전</button>
          <button type="button" data-next-question>다음</button>
          <button type="submit" data-submit-diagnosis hidden>내 가게 결과 보기</button>
        </div>
        <p data-save-status class="form-status" role="status" aria-live="polite"></p>
      </form>
    </main>`;

  const form = root.querySelector<HTMLFormElement>("[data-diagnosis-form]");
  if (!form) return;
  syncAdvertisingFields(form);
  let questionIndex = 0;
  const revealErrorQuestion = (field: string) => {
    const questionId = questionByErrorField[field];
    const errorQuestionIndex = questions.findIndex(
      (question) => question.id === questionId,
    );
    if (errorQuestionIndex < 0) return;
    questionIndex = errorQuestionIndex;
    showQuestion(root, questionIndex);
  };
  showQuestion(root, questionIndex);
  form.addEventListener("input", () => {
    updateCoachingFeedback(form);
  });
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
    if (target.hasAttribute("data-next-question")) {
      const current = questions[questionIndex];
      const next = questions[questionIndex + 1];
      if (!current || !validateQuestion(form, current.id)) return;
      if (
        (!next || next.step !== current.step) &&
        !validateStep(form, current.step, revealErrorQuestion)
      ) {
        return;
      }
      questionIndex += 1;
      showQuestion(root, questionIndex);
    }
    if (target.hasAttribute("data-prev-question") && questionIndex > 0) {
      questionIndex -= 1;
      showQuestion(root, questionIndex);
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (
      !validateStep(form, 1, revealErrorQuestion) ||
      !validateStep(form, 2, revealErrorQuestion) ||
      !validateStep(form, 3, revealErrorQuestion)
    ) {
      return;
    }
    await options.onSubmit(readDiagnosisForm(form));
  });
}
