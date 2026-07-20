# Focused Diagnosis Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the three-chapter diagnosis into a one-question-at-a-time responsive coaching flow and add optional restaurant operations inputs that distinguish customer acquisition needs from store-capacity constraints.

**Architecture:** Keep the existing assessment form and persistence shape, but add a small question controller inside `src/ui/diagnosis.ts`. Put restaurant calculations in a new pure domain module so UI copy and calculations remain independently testable. Pass the resulting operations insight through `src/app.ts` to `src/ui/result.ts`; no database migration is required because assessments already store JSON records.

**Tech Stack:** TypeScript 7, Vite 8, Vitest 4, happy-dom, plain DOM rendering, CSS media queries, Supabase JSON assessment persistence.

## Global Constraints

- Keep exactly three chapters: 목표 매출, 현재 고객 상황, 실행 조건.
- Show one primary question at a time and preserve every answer when moving backward.
- Every restaurant operations field is optional; the base diagnosis must complete without it.
- Never state a numeric customer capacity when the necessary operating inputs are missing.
- Treat seat turnover as a theoretical reference range, not a customer forecast or sales guarantee.
- Keep Korean words intact, provide at least 44px touch targets, and disable transition motion under `prefers-reduced-motion: reduce`.
- Do not change authentication, invitation-code behavior, database schema, or the number of chapters.

---

## File Structure

- Create `src/domain/restaurant.ts`: validate optional restaurant inputs and calculate capacity status, daily team requirement, and theoretical seat-turnover range.
- Create `tests/restaurant.test.ts`: pure domain coverage for missing, partial, valid, and invalid restaurant information.
- Modify `src/domain/types.ts`: shared restaurant input and insight types.
- Modify `src/ui/diagnosis.ts`: conversational question markup, question navigation, coaching feedback, optional restaurant input parsing, and validation.
- Modify `tests/diagnosis-ui.test.ts`: question visibility, navigation, persistence, optional-detail, and accessibility behavior.
- Modify `src/styles.css`: hidden-state fix, focused card, responsive navigation, touch targets, transitions, and Korean wrapping.
- Modify `tests/responsive-styles.test.ts`: style contracts for hidden panels, question animation, mobile layout, and reduced motion.
- Modify `src/app.ts`: calculate restaurant insight and persist it with assessment metrics.
- Modify `src/ui/result.ts`: show an evidence-qualified restaurant operations result.
- Modify `tests/live-app.test.ts` and `tests/diagnosis-ui.test.ts`: end-to-end result and saved JSON assertions.

---

### Task 1: Restaurant Operations Domain

**Files:**

- Create: `src/domain/restaurant.ts`
- Modify: `src/domain/types.ts`
- Test: `tests/restaurant.test.ts`

**Interfaces:**

- Produces: `RestaurantOperationsInput`, `RestaurantCapacityStatus`, `RestaurantOperationsInsight`, `validateRestaurantOperations(input)`, and `analyzeRestaurantOperations(input, requiredCustomersPerDay)`.
- Consumes: only primitive values and `FieldError`; no DOM or service dependency.

- [ ] **Step 1: Write the failing domain tests**

```ts
import { describe, expect, test } from "vitest";
import {
  analyzeRestaurantOperations,
  validateRestaurantOperations,
} from "../src/domain/restaurant";
import type { RestaurantOperationsInput } from "../src/domain/types";

const empty: RestaurantOperationsInput = {
  seats: null,
  hallHours: null,
  peakOccupancy: null,
  averagePartySize: null,
  averageStayBand: null,
  channelShares: { dineIn: null, takeout: null, delivery: null },
};

test("keeps an empty optional restaurant profile insufficient but valid", () => {
  expect(validateRestaurantOperations(empty)).toEqual([]);
  expect(analyzeRestaurantOperations(empty, 12)).toEqual({
    status: "insufficient",
    requiredPartiesPerDay: null,
    theoreticalTurns: null,
  });
});

test("classifies a half-full restaurant as available and converts people to teams", () => {
  const input: RestaurantOperationsInput = {
    ...empty,
    seats: 32,
    hallHours: 8,
    peakOccupancy: "half",
    averagePartySize: 4,
    averageStayBand: "60_90",
  };
  expect(analyzeRestaurantOperations(input, 12)).toEqual({
    status: "available",
    requiredPartiesPerDay: 3,
    theoreticalTurns: { min: 5.3, max: 8 },
  });
});

test("classifies waiting as saturated", () => {
  expect(
    analyzeRestaurantOperations({ ...empty, peakOccupancy: "waiting" }, 10)
      .status,
  ).toBe("saturated");
});

describe("channel share validation", () => {
  test("validates the 100 percent total only when all three shares exist", () => {
    expect(
      validateRestaurantOperations({
        ...empty,
        channelShares: { dineIn: 60, takeout: 20, delivery: 10 },
      }),
    ).toContainEqual({
      field: "channelShares",
      message: "홀·포장·배달 비중의 합계를 100%로 맞춰주세요.",
    });
    expect(
      validateRestaurantOperations({
        ...empty,
        channelShares: { dineIn: 60, takeout: null, delivery: null },
      }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run: `pnpm test tests/restaurant.test.ts`

Expected: FAIL because `src/domain/restaurant.ts` and the restaurant types do not exist.

- [ ] **Step 3: Add the shared types**

```ts
export type PeakOccupancy = "spacious" | "half" | "almost_full" | "waiting";
export type AverageStayBand =
  "under_30" | "30_60" | "60_90" | "over_90" | "unknown";
export type RestaurantCapacityStatus =
  "available" | "time_limited" | "saturated" | "insufficient";

export interface RestaurantOperationsInput {
  seats: number | null;
  hallHours: number | null;
  peakOccupancy: PeakOccupancy | null;
  averagePartySize: number | null;
  averageStayBand: AverageStayBand | null;
  channelShares: {
    dineIn: number | null;
    takeout: number | null;
    delivery: number | null;
  };
}

export interface RestaurantOperationsInsight {
  status: RestaurantCapacityStatus;
  requiredPartiesPerDay: number | null;
  theoreticalTurns: { min: number; max: number } | null;
}
```

- [ ] **Step 4: Implement the pure validation and analysis functions**

```ts
import type {
  FieldError,
  RestaurantOperationsInput,
  RestaurantOperationsInsight,
} from "./types";

const stayMinutes = {
  under_30: { min: 20, max: 30 },
  "30_60": { min: 30, max: 60 },
  "60_90": { min: 60, max: 90 },
  over_90: { min: 90, max: 120 },
} as const;

const oneDecimal = (value: number) => Math.round(value * 10) / 10;

export function validateRestaurantOperations(
  input: RestaurantOperationsInput,
): FieldError[] {
  const errors: FieldError[] = [];
  (["seats", "hallHours", "averagePartySize"] as const).forEach((field) => {
    const value = input[field];
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      errors.push({ field, message: "0보다 큰 숫자를 입력해주세요." });
    }
  });
  const shares = Object.values(input.channelShares);
  shares.forEach((value) => {
    if (
      value !== null &&
      (!Number.isFinite(value) || value < 0 || value > 100)
    ) {
      errors.push({
        field: "channelShares",
        message: "비중은 0~100 사이로 입력해주세요.",
      });
    }
  });
  if (shares.every((value): value is number => value !== null)) {
    const total = shares.reduce((sum, value) => sum + value, 0);
    if (total !== 100) {
      errors.push({
        field: "channelShares",
        message: "홀·포장·배달 비중의 합계를 100%로 맞춰주세요.",
      });
    }
  }
  return errors;
}

export function analyzeRestaurantOperations(
  input: RestaurantOperationsInput,
  requiredCustomersPerDay: number,
): RestaurantOperationsInsight {
  const status =
    input.peakOccupancy === "waiting"
      ? "saturated"
      : input.peakOccupancy === "almost_full"
        ? "time_limited"
        : input.peakOccupancy === "spacious" || input.peakOccupancy === "half"
          ? "available"
          : "insufficient";
  const requiredPartiesPerDay =
    input.averagePartySize && input.averagePartySize > 0
      ? Math.ceil(requiredCustomersPerDay / input.averagePartySize)
      : null;
  const range =
    input.averageStayBand && input.averageStayBand !== "unknown"
      ? stayMinutes[input.averageStayBand]
      : null;
  const theoreticalTurns =
    input.hallHours && range
      ? {
          min: oneDecimal((input.hallHours * 60) / range.max),
          max: oneDecimal((input.hallHours * 60) / range.min),
        }
      : null;
  return { status, requiredPartiesPerDay, theoreticalTurns };
}
```

- [ ] **Step 5: Verify GREEN and commit**

Run: `pnpm test tests/restaurant.test.ts && pnpm typecheck`

Expected: all restaurant tests PASS and TypeScript exits with code 0.

Commit: `git add src/domain/types.ts src/domain/restaurant.ts tests/restaurant.test.ts && git commit -m "feat: analyze optional restaurant capacity"`

---

### Task 2: One-Question Coaching Controller

**Files:**

- Modify: `src/ui/diagnosis.ts`
- Test: `tests/diagnosis-ui.test.ts`

**Interfaces:**

- Consumes: existing `validateRevenueInputs`, `validateGoalAllocation`, and form helpers.
- Produces: `readDiagnosisForm(form).restaurant`, question-level navigation attributes, `data-question-label`, `data-chapter-title`, and `data-coaching-feedback`.

- [ ] **Step 1: Add failing interaction tests**

```ts
test("shows only the current chapter and current question", async () => {
  const root = document.querySelector<HTMLElement>("#app")!;
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");

  expect(root.querySelectorAll("[data-step]:not([hidden])")).toHaveLength(1);
  expect(root.querySelectorAll("[data-question]:not([hidden])")).toHaveLength(
    1,
  );
  expect(root.querySelector("[data-chapter-title]")?.textContent).toBe(
    "매출 목표",
  );
  expect(root.querySelector("[data-question-label]")?.textContent).toBe(
    "질문 1 / 4",
  );
});

test("keeps a revenue answer when moving backward", async () => {
  const root = document.querySelector<HTMLElement>("#app")!;
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");
  setValue("averageMonthlyRevenue", "30,000,000");
  click("[data-next-question]");
  click("[data-prev-question]");

  expect(
    document.querySelector<HTMLInputElement>("[name='averageMonthlyRevenue']")
      ?.value,
  ).toBe("30,000,000");
  expect(root.querySelectorAll("[data-question]:not([hidden])")).toHaveLength(
    1,
  );
});

test("summarizes the gap immediately after the target revenue answer", async () => {
  const root = document.querySelector<HTMLElement>("#app")!;
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");
  setValue("averageMonthlyRevenue", "30,000,000");
  click("[data-next-question]");
  setValue("targetMonthlyRevenue", "40,000,000");
  expect(root.querySelector("[data-coaching-feedback]")?.textContent).toContain(
    "목표까지 월 10,000,000원이 더 필요해요",
  );
});
```

- [ ] **Step 2: Run the focused UI tests and verify RED**

Run: `pnpm test tests/diagnosis-ui.test.ts -t "current chapter|moving backward|summarizes the gap"`

Expected: FAIL because question-level markup and navigation do not exist.

- [ ] **Step 3: Add typed question metadata and visibility control**

```ts
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

function showQuestion(root: HTMLElement, index: number): void {
  const current = questions[index];
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
  root.querySelector<HTMLElement>("[data-question-label]")!.textContent =
    `질문 ${questionNumber} / ${chapterQuestions.length}`;
  root
    .querySelector<HTMLElement>(`[data-question='${current.id}'] h2`)
    ?.focus();
}
```

- [ ] **Step 4: Wrap each primary prompt in a question card and use one navigation footer**

Use this exact shape for every question; keep conditional fields such as known customer count and advertising details inside their parent question.

```html
<section class="question-card" data-question="averageMonthlyRevenue">
  <p class="question-number">질문 1</p>
  <h2 tabindex="-1">최근 한 달 평균 매출은 어느 정도인가요?</h2>
  <p class="question-help">
    정확하지 않아도 괜찮아요. 가장 가까운 금액을 적어주세요.
  </p>
  <!-- existing number input and linked error -->
</section>
<aside
  class="coaching-feedback"
  data-coaching-feedback
  aria-live="polite"
></aside>
<div class="question-actions">
  <button type="button" class="secondary-action" data-prev-question>
    이전
  </button>
  <button type="button" data-next-question>다음</button>
</div>
```

- [ ] **Step 5: Validate the current question before advancing**

Extract the existing validation branches into `validateQuestion(form, questionId)`. Required numeric questions call the existing revenue validator after the last revenue question; radio questions require one checked value. Preserve `setError`, `clearErrors`, and first-invalid focus behavior.

```ts
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
      input instanceof HTMLInputElement && input.focus();
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
  return true;
}
```

On the final question in a chapter, also call the existing full chapter validation so allocation, conditional customer count, and advertising validation remain enforced.

- [ ] **Step 6: Add live coaching feedback**

```ts
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
```

Call it from the form `input` event and keep the existing advertising-field synchronization in the `change` event.

- [ ] **Step 7: Verify GREEN and commit**

Run: `pnpm test tests/diagnosis-ui.test.ts`

Expected: all diagnosis UI tests PASS, including existing validation and submission flows.

Commit: `git add src/ui/diagnosis.ts tests/diagnosis-ui.test.ts && git commit -m "feat: guide diagnosis one question at a time"`

---

### Task 3: Optional Restaurant Detail Inputs

**Files:**

- Modify: `src/ui/diagnosis.ts`
- Test: `tests/diagnosis-ui.test.ts`

**Interfaces:**

- Consumes: `RestaurantOperationsInput` and `validateRestaurantOperations`.
- Produces: `DiagnosisInput.restaurant: RestaurantOperationsInput` and `[data-restaurant-details]` progressive disclosure.

- [ ] **Step 1: Add failing optional-input tests**

```ts
test("completes diagnosis without opening restaurant details", async () => {
  await openStepThree();
  choose("adsRunning", "false");
  click("[data-submit-diagnosis]");
  await Promise.resolve();
  expect(document.querySelector("[data-recommended-action]")).not.toBeNull();
});

test("reads only the restaurant details the owner knows", async () => {
  const root = await openStepThree();
  const details = root.querySelector<HTMLDetailsElement>(
    "[data-restaurant-details]",
  )!;
  details.open = true;
  setValue("restaurantSeats", "32");
  setValue("restaurantAveragePartySize", "4");
  choose("restaurantPeakOccupancy", "half");
  const form = root.querySelector<HTMLFormElement>("[data-diagnosis-form]")!;
  expect(readDiagnosisForm(form).restaurant).toEqual(
    expect.objectContaining({
      seats: 32,
      hallHours: null,
      peakOccupancy: "half",
      averagePartySize: 4,
    }),
  );
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm test tests/diagnosis-ui.test.ts -t "restaurant details"`

Expected: FAIL because restaurant details and `DiagnosisInput.restaurant` do not exist.

- [ ] **Step 3: Add the progressive disclosure markup**

Place it in the capacity question after the required capacity choices.

```html
<details class="optional-details restaurant-details" data-restaurant-details>
  <summary>우리 가게 운영 정보로 더 정확히 계산하기 <span>선택</span></summary>
  <p>알고 있는 내용만 입력해도 괜찮아요. 비워도 기본 결과를 볼 수 있습니다.</p>
  <!-- restaurantSeats, restaurantHallHours, restaurantPeakOccupancy,
       restaurantAveragePartySize, restaurantAverageStayBand,
       dineInShare, takeoutShare, deliveryShare -->
  <p id="channelShares-error" class="field-error" role="alert"></p>
</details>
```

Use select cards for occupancy and stay bands; use numeric inputs for seats, hall hours, average party size, and channel shares. Include `잘 모르겠어요` for the stay band.

- [ ] **Step 4: Parse and validate optional data**

```ts
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
```

Run `validateRestaurantOperations(readDiagnosisForm(form).restaurant)` only when leaving the capacity question or submitting. Link every returned error to the relevant field; map `channelShares` to the shared error and all three channel inputs.

- [ ] **Step 5: Verify GREEN and commit**

Run: `pnpm test tests/restaurant.test.ts tests/diagnosis-ui.test.ts && pnpm typecheck`

Expected: both suites PASS and TypeScript exits with code 0.

Commit: `git add src/ui/diagnosis.ts tests/diagnosis-ui.test.ts && git commit -m "feat: collect optional restaurant operating details"`

---

### Task 4: Focused Responsive Presentation

**Files:**

- Modify: `src/styles.css`
- Modify: `tests/responsive-styles.test.ts`

**Interfaces:**

- Consumes: `.step-panel`, `.question-card`, `.question-actions`, `.coaching-feedback`, and `.restaurant-details` markup.
- Produces: one-visible-panel contract, centered desktop reading width, mobile single-column layout, touch-safe controls, and reduced-motion fallback.

- [ ] **Step 1: Add failing CSS contract tests**

```ts
test("never lets grid declarations override hidden diagnosis content", () => {
  expect(css).toMatch(
    /\.step-panel\[hidden\],[^{]*\.question-card\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s,
  );
});

test("defines a focused diagnosis stage and mobile action layout", () => {
  expect(css).toContain(".diagnosis-stage");
  expect(css).toContain(".question-card");
  expect(css).toContain(".question-actions");
  expect(css).toMatch(/@media \(max-width: 720px\)[\s\S]*\.question-actions/s);
  expect(css).toMatch(/\.choice-card[^{]*\{[^}]*min-height:\s*44px/s);
});

test("removes question transitions when reduced motion is requested", () => {
  expect(css).toMatch(
    /prefers-reduced-motion:\s*reduce[\s\S]*\.question-card/s,
  );
});
```

- [ ] **Step 2: Run the style tests and verify RED**

Run: `pnpm test tests/responsive-styles.test.ts`

Expected: FAIL because the focused-stage selectors do not exist.

- [ ] **Step 3: Add the hidden-state and stage styles**

```css
.step-panel[hidden],
.question-card[hidden] {
  display: none !important;
}

.diagnosis-shell {
  max-width: 820px;
}

.diagnosis-stage {
  display: grid;
  min-height: clamp(500px, 68vh, 720px);
  grid-template-rows: auto 1fr auto;
}

.question-card {
  display: grid;
  align-content: start;
  gap: 1rem;
  animation: question-enter 180ms ease-out both;
}

.question-card h2,
.question-card p,
.choice-card span {
  word-break: keep-all;
  text-wrap: pretty;
}

.choice-card {
  min-height: 44px;
}

.coaching-feedback:empty {
  display: none;
}
```

- [ ] **Step 4: Add desktop/mobile navigation and motion safeguards**

```css
.question-actions {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--line);
}

@media (max-width: 720px) {
  .diagnosis-shell {
    width: min(calc(100% - 16px), var(--work-content));
    padding: 1rem;
  }
  .diagnosis-stage {
    min-height: calc(100svh - 150px);
  }
  .question-actions {
    position: sticky;
    bottom: 0;
    padding: 0.75rem 0 max(0.75rem, env(safe-area-inset-bottom));
    background: var(--surface);
  }
  .question-actions button {
    min-height: 48px;
    flex: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .question-card {
    animation: none;
  }
}
```

- [ ] **Step 5: Verify GREEN and commit**

Run: `pnpm test tests/responsive-styles.test.ts && pnpm format:check`

Expected: tests PASS and Prettier reports all files formatted.

Commit: `git add src/styles.css tests/responsive-styles.test.ts && git commit -m "feat: focus responsive diagnosis presentation"`

---

### Task 5: Result Integration and Honest Capacity Guidance

**Files:**

- Modify: `src/app.ts`
- Modify: `src/ui/result.ts`
- Modify: `tests/diagnosis-ui.test.ts`
- Modify: `tests/live-app.test.ts`

**Interfaces:**

- Consumes: `analyzeRestaurantOperations(input.restaurant, metrics.maxNewCustomersPerDay)`.
- Produces: `ResultViewModel.restaurant?: RestaurantOperationsInsight` and a `[data-restaurant-insight]` result section.

- [ ] **Step 1: Add failing result and persistence tests**

```ts
test("shows acquisition guidance when the restaurant reports spare peak capacity", async () => {
  const root = await openStepThree();
  root.querySelector<HTMLDetailsElement>("[data-restaurant-details]")!.open =
    true;
  setValue("restaurantSeats", "32");
  setValue("restaurantHallHours", "8");
  setValue("restaurantAveragePartySize", "4");
  choose("restaurantPeakOccupancy", "half");
  choose("restaurantAverageStayBand", "60_90");
  choose("adsRunning", "false");
  click("[data-submit-diagnosis]");
  await Promise.resolve();
  await Promise.resolve();
  expect(
    document.querySelector("[data-restaurant-insight]")?.textContent,
  ).toContain("하루 약 5팀이 더 필요해요");
  expect(
    document.querySelector("[data-restaurant-insight]")?.textContent,
  ).toContain("신규 고객 확보가 먼저입니다");
});

test("does not claim numeric capacity from missing operations data", async () => {
  await openStepThree();
  choose("adsRunning", "false");
  click("[data-submit-diagnosis]");
  await Promise.resolve();
  await Promise.resolve();
  const copy =
    document.querySelector("[data-restaurant-insight]")?.textContent ?? "";
  expect(copy).not.toMatch(/최대 .*명.*받을 수/);
});

test("persists restaurant input and derived insight in assessment JSON", async () => {
  const service = createDemoService();
  const saveAssessment = vi.spyOn(service, "saveAssessment");
  const root = await openStepThree("unknown", service);
  root.querySelector<HTMLDetailsElement>("[data-restaurant-details]")!.open =
    true;
  choose("restaurantPeakOccupancy", "half");
  choose("adsRunning", "false");
  click("[data-submit-diagnosis]");
  await Promise.resolve();
  await Promise.resolve();
  expect(saveAssessment).toHaveBeenCalledWith(
    expect.objectContaining({
      inputs: expect.objectContaining({
        restaurant: expect.objectContaining({ peakOccupancy: "half" }),
      }),
      metrics: expect.objectContaining({
        restaurant: expect.objectContaining({ status: "available" }),
      }),
    }),
  );
});
```

Change the existing helper signature from `openStepThree(primaryConcern = "unknown")` to `openStepThree(primaryConcern = "unknown", service = createDemoService())`, and pass that service to `createApp`. Existing callers remain unchanged.

- [ ] **Step 2: Run the focused integration tests and verify RED**

Run: `pnpm test tests/diagnosis-ui.test.ts tests/live-app.test.ts -t "restaurant|numeric capacity"`

Expected: FAIL because app calculation, result view model, and result section are missing.

- [ ] **Step 3: Calculate and persist the insight in the app**

```ts
const restaurant = analyzeRestaurantOperations(
  input.restaurant,
  metrics.maxNewCustomersPerDay,
);

const assessment = await service.saveAssessment({
  inputs: { ...input, allocation } as unknown as Record<string, unknown>,
  metrics: {
    ...metrics,
    newCustomerTarget,
    advertising,
    restaurant,
  } as unknown as Record<string, unknown>,
  diagnosis: { bottleneck, actionKey: action.key },
});

renderResult(
  root,
  {
    metrics,
    allocation,
    ...advertisingResult,
    restaurant,
    bottleneck,
    action,
  },
  callbacks,
);
```

- [ ] **Step 4: Render qualified restaurant guidance**

Add `restaurant?: RestaurantOperationsInsight` to `ResultViewModel`. Render nothing when the entire optional profile is empty. Otherwise render one of these exact status messages:

```ts
const statusCopy = {
  available:
    "가장 붐비는 시간에도 좌석 여유가 있어, 지금은 좌석 확대보다 신규 고객 확보가 먼저입니다.",
  time_limited:
    "붐비는 시간에는 좌석이 거의 찹니다. 광고 확대와 함께 한산한 시간대 유입 또는 포장·배달 전환을 먼저 시험해보세요.",
  saturated:
    "웨이팅이 발생하고 있어 고객을 더 모으기 전에 체류시간, 주문 처리 또는 포장·배달 구조를 먼저 점검해야 합니다.",
  insufficient:
    "운영 정보가 충분하지 않아 매장 수용 여력은 단정하지 않았습니다.",
} as const;
```

When `requiredPartiesPerDay` exists, prepend `목표 달성에는 하루 약 N팀이 더 필요해요.` When `theoreticalTurns` exists, show `이론상 좌석 회전 참고 범위: 하루 X~Y회` followed by `실제 고객 수 예측이나 매출 보장이 아닙니다.` Never produce a numeric “additional capacity” claim.

- [ ] **Step 5: Verify GREEN and commit**

Run: `pnpm test tests/restaurant.test.ts tests/diagnosis-ui.test.ts tests/live-app.test.ts && pnpm typecheck`

Expected: all focused suites PASS and TypeScript exits with code 0.

Commit: `git add src/app.ts src/ui/result.ts tests/diagnosis-ui.test.ts tests/live-app.test.ts && git commit -m "feat: explain restaurant capacity in diagnosis results"`

---

### Task 6: Full Verification and Production Delivery

**Files:**

- Modify only if verification uncovers a regression in the files already listed above.

**Interfaces:**

- Consumes: the completed diagnosis, restaurant analysis, styles, existing live authentication, and assessment persistence.
- Produces: a verified commit suitable for the existing Vercel production project.

- [ ] **Step 1: Run the complete repository verification**

Run: `pnpm verify`

Expected: formatting, typecheck, every Vitest suite, security scan, and Vite production build all exit with code 0.

- [ ] **Step 2: Run a desktop browser flow**

At a viewport near `1440x900`, verify only one chapter and one question are visible, progress changes correctly, backward navigation preserves input, optional restaurant details open, and the result uses the entered capacity evidence.

- [ ] **Step 3: Run a mobile browser flow**

At a viewport near `390x844`, verify there is no horizontal overflow, Korean words do not split awkwardly, choices and buttons are at least 44px tall, the navigation remains reachable, and reduced content keeps the current question in focus.

- [ ] **Step 4: Confirm the final diff is scoped and clean**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only intentional implementation files before the final commit; clean status after committing fixes.

- [ ] **Step 5: Push and deploy the verified branch**

Run the existing repository push workflow, then deploy the linked Vercel project to production. Confirm the production URL returns the new focused diagnosis and repeat the desktop/mobile smoke checks against production.

Expected: branch push succeeds, Vercel production deployment is READY, and the production flow completes without console or network errors.
