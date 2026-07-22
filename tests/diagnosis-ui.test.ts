import { beforeEach, expect, test, vi } from "vitest";
import { createApp, readDiagnosisForm } from "../src/app";
import { createDemoService } from "../src/services/demo-service";

const text = () => document.body.textContent ?? "";
const click = (selector: string) => {
  const button = document.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`missing button ${selector}`);
  button.click();
};
const advanceQuestions = (count: number) => {
  for (let index = 0; index < count; index += 1) {
    click("[data-next-question]");
  }
};
const setValue = (name: string, value: string) => {
  const input = document.querySelector<HTMLInputElement>(`[name='${name}']`);
  if (!input) throw new Error(`missing input ${name}`);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
const choose = (name: string, value: string) => {
  const input = document.querySelector<HTMLInputElement>(
    `[name='${name}'][value='${value}']`,
  );
  if (!input) throw new Error(`missing choice ${name}:${value}`);
  input.click();
};

const openCustomerCountQuestion = async (service = createDemoService()) => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing test root");
  await createApp(root, service).start();
  click("[data-start-diagnosis]");
  setValue("averageMonthlyRevenue", "30,000,000");
  setValue("targetMonthlyRevenue", "40,000,000");
  setValue("averageOrderValue", "25,000");
  setValue("operatingDays", "20");
  advanceQuestions(4);
  return root;
};

const openStepThree = async (
  primaryConcern = "unknown",
  service = createDemoService(),
  monthlyCustomerCountStatus = "unknown",
  monthlyCustomerCount?: string,
) => {
  const root = await openCustomerCountQuestion(service);
  choose("monthlyCustomerCountStatus", monthlyCustomerCountStatus);
  if (monthlyCustomerCount !== undefined) {
    setValue("monthlyCustomerCount", monthlyCustomerCount);
  }
  choose("primaryConcern", primaryConcern);
  advanceQuestions(2);
  choose("capacity", "yes");
  choose("returningDataStatus", "unknown");
  choose("hasConsentDb", "false");
  choose("canChangeMenu", "true");
  advanceQuestions(4);
  return root;
};

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
});

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

  const feedback = root.querySelector("[data-coaching-feedback]")?.textContent;
  expect(feedback).toContain("목표까지 월 10,000,000원이 더 필요해요.");
  expect(feedback).not.toContain("추가 고객");
});

test("adds the daily customer need when all revenue inputs are valid", async () => {
  const root = document.querySelector<HTMLElement>("#app")!;
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");
  setValue("averageMonthlyRevenue", "30,000,000");
  setValue("targetMonthlyRevenue", "40,000,000");
  setValue("averageOrderValue", "25,000");
  setValue("operatingDays", "20");

  const feedback = root.querySelector("[data-coaching-feedback]")?.textContent;
  expect(feedback).toContain("목표까지 월 10,000,000원이 더 필요해요.");
  expect(feedback).toContain(
    "현재 객단가라면 하루 약 20명의 추가 고객이 필요해요.",
  );
});

test("offers exact, approximate, and unknown customer-count choices", async () => {
  const root = await openCustomerCountQuestion();
  const choices = Array.from(
    root.querySelectorAll<HTMLInputElement>(
      "[name='monthlyCustomerCountStatus']",
    ),
  ).map((input) => [input.value, input.closest("label")?.textContent?.trim()]);

  expect(choices).toEqual([
    ["exact", "정확히 알아요"],
    ["approximate", "대략 알아요"],
    ["unknown", "잘 모르겠어요"],
  ]);
});

test.each(["exact", "approximate"])(
  "shows and requires a customer count when confidence is %s",
  async (status) => {
    const root = await openCustomerCountQuestion();
    choose("monthlyCustomerCountStatus", status);
    const count = root.querySelector<HTMLInputElement>(
      "[name='monthlyCustomerCount']",
    );
    const countField = count?.closest<HTMLElement>(
      "[data-monthly-customer-count-field]",
    );

    expect(count?.disabled).toBe(false);
    expect(countField).not.toBeNull();
    expect(countField?.hidden).toBe(false);
    click("[data-next-question]");
    expect(count?.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(count);
    expect(
      root.querySelector<HTMLElement>(
        "[data-question='monthlyCustomerCountStatus']",
      )?.hidden,
    ).toBe(false);
  },
);

test("clears and disables the customer count when confidence is unknown", async () => {
  const root = await openCustomerCountQuestion();
  choose("monthlyCustomerCountStatus", "exact");
  setValue("monthlyCustomerCount", "980");
  choose("monthlyCustomerCountStatus", "unknown");
  const count = root.querySelector<HTMLInputElement>(
    "[name='monthlyCustomerCount']",
  );
  const form = root.querySelector<HTMLFormElement>("[data-diagnosis-form]")!;

  expect(count?.disabled).toBe(true);
  expect(count?.value).toBe("");
  expect(readDiagnosisForm(form).revenue).toMatchObject({
    monthlyCustomerCount: null,
    monthlyCustomerCountStatus: "unknown",
  });
});

test("shows a readable three-step progress indicator", async () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing test root");
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");

  expect(root.querySelector("[data-step-label]")?.textContent).toBe("1 / 3");
  expect(root.querySelector<HTMLElement>("[data-progress]")?.style.width).toBe(
    "33%",
  );

  setValue("averageMonthlyRevenue", "30,000,000");
  setValue("targetMonthlyRevenue", "40,000,000");
  setValue("averageOrderValue", "25,000");
  setValue("operatingDays", "20");
  advanceQuestions(4);

  expect(root.querySelector("[data-step-label]")?.textContent).toBe("2 / 3");
  expect(root.querySelector<HTMLElement>("[data-progress]")?.style.width).toBe(
    "67%",
  );
});

test("treats unknown returning data as a normal selectable card", async () => {
  const root = await openStepThree();
  const unknown = root.querySelector<HTMLInputElement>(
    "[name='returningDataStatus'][value='unknown']",
  );

  expect(unknown?.closest(".choice-card")?.textContent).toContain(
    "잘 모르겠어요",
  );
});

test("completes the three-step all-new-customer ceiling flow", async () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing test root");
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");
  expect(text()).toContain("최근 월평균 매출");
  expect(document.querySelectorAll("[data-step]")).toHaveLength(3);

  setValue("averageMonthlyRevenue", "30,000,000");
  setValue("targetMonthlyRevenue", "40,000,000");
  setValue("averageOrderValue", "25,000");
  setValue("operatingDays", "20");
  advanceQuestions(4);
  choose("monthlyCustomerCountStatus", "unknown");
  choose("primaryConcern", "unknown");
  advanceQuestions(2);
  choose("capacity", "yes");
  choose("returningDataStatus", "unknown");
  choose("hasConsentDb", "false");
  choose("canChangeMenu", "true");
  advanceQuestions(4);
  choose("adsRunning", "false");
  click("[data-submit-diagnosis]");
  await Promise.resolve();
  await Promise.resolve();

  expect(text()).toContain("최대 400명");
  expect(text()).toContain("전부 신규 고객으로 채운다고 가정");
  expect(document.querySelectorAll("[data-recommended-action]")).toHaveLength(
    1,
  );
  expect(text()).not.toContain("재방문이 문제입니다");
  expect(text()).not.toContain("광고 비용은 아직 계산하지 않았어요");
});

test("shows a linked error and moves focus when required revenue is missing", async () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing test root");
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");
  click("[data-next-question]");

  const input = document.querySelector<HTMLInputElement>(
    "[name='targetMonthlyRevenue']",
  );
  expect(input?.getAttribute("aria-describedby")).toContain(
    "targetMonthlyRevenue-error",
  );
  expect(document.activeElement).toBe(
    document.querySelector("[name='averageMonthlyRevenue']"),
  );
});

test.each(["abc", "Infinity", "1e309"])(
  "rejects malformed revenue input %s",
  async (invalidRevenue) => {
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) throw new Error("missing test root");
    await createApp(root, createDemoService()).start();
    click("[data-start-diagnosis]");
    setValue("averageMonthlyRevenue", invalidRevenue);
    setValue("targetMonthlyRevenue", "40,000,000");
    setValue("averageOrderValue", "25,000");
    setValue("operatingDays", "20");
    click("[data-next-question]");

    expect(
      document
        .querySelector("[name='averageMonthlyRevenue']")
        ?.getAttribute("aria-invalid"),
    ).toBe("true");
  },
);

test("returns to the average order value question when chapter validation rejects zero", async () => {
  const root = document.querySelector<HTMLElement>("#app")!;
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");
  setValue("averageMonthlyRevenue", "30,000,000");
  setValue("targetMonthlyRevenue", "40,000,000");
  setValue("averageOrderValue", "0");
  setValue("operatingDays", "20");
  advanceQuestions(4);

  const visibleQuestions = root.querySelectorAll<HTMLElement>(
    "[data-question]:not([hidden])",
  );
  expect(visibleQuestions).toHaveLength(1);
  expect(visibleQuestions[0]?.dataset.question).toBe("averageOrderValue");
  expect(document.activeElement).toBe(
    root.querySelector("[name='averageOrderValue']"),
  );
});

test("does not use unconnected repeat data for a repeat recommendation", async () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing test root");
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");
  setValue("averageMonthlyRevenue", "30,000,000");
  setValue("targetMonthlyRevenue", "40,000,000");
  setValue("averageOrderValue", "25,000");
  setValue("operatingDays", "20");
  advanceQuestions(4);
  choose("monthlyCustomerCountStatus", "unknown");
  choose("primaryConcern", "returning");
  advanceQuestions(2);
  choose("capacity", "yes");
  choose("returningDataStatus", "known");
  choose("hasConsentDb", "true");
  choose("canChangeMenu", "true");
  choose("adsRunning", "false");
  choose("hasConnectedVisitHistory", "false");
  advanceQuestions(4);
  click("[data-submit-diagnosis]");
  await Promise.resolve();
  await Promise.resolve();

  expect(
    document.querySelector("[data-recommended-action]")?.textContent,
  ).not.toContain("동의 고객 일부에게 다음 방문 이유를 알려주세요");
});

test("links a radio-group error to every invalid choice", async () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing test root");
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");
  setValue("averageMonthlyRevenue", "30,000,000");
  setValue("targetMonthlyRevenue", "40,000,000");
  setValue("averageOrderValue", "25,000");
  setValue("operatingDays", "20");
  advanceQuestions(4);
  click("[data-next-question]");

  const group = document.querySelector<HTMLElement>(
    "[data-choice-group='monthlyCustomerCountStatus']",
  );
  expect(group?.getAttribute("aria-describedby")).toBe(
    "monthlyCustomerCountStatus-error",
  );
  document
    .querySelectorAll<HTMLInputElement>("[name='monthlyCustomerCountStatus']")
    .forEach((radio) =>
      expect(radio.getAttribute("aria-invalid")).toBe("true"),
    );
});

test.each(["0", "-1"])(
  "keeps an exact monthly customer count of %s on step two with an error",
  async (customerCount) => {
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) throw new Error("missing test root");
    await createApp(root, createDemoService()).start();
    click("[data-start-diagnosis]");
    setValue("averageMonthlyRevenue", "30,000,000");
    setValue("targetMonthlyRevenue", "40,000,000");
    setValue("averageOrderValue", "25,000");
    setValue("operatingDays", "20");
    advanceQuestions(4);
    choose("monthlyCustomerCountStatus", "exact");
    setValue("monthlyCustomerCount", customerCount);
    choose("primaryConcern", "unknown");
    advanceQuestions(2);

    const input = document.querySelector<HTMLInputElement>(
      "[name='monthlyCustomerCount']",
    );
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input);
    expect(document.querySelector<HTMLElement>("[data-step='2']")?.hidden).toBe(
      false,
    );
    expect(document.querySelector<HTMLElement>("[data-step='3']")?.hidden).toBe(
      true,
    );
  },
);

test.each(["", "0"])(
  "returns to the customer-count question when an exact count of %j is invalid",
  async (customerCount) => {
    const root = document.querySelector<HTMLElement>("#app")!;
    await createApp(root, createDemoService()).start();
    click("[data-start-diagnosis]");
    setValue("averageMonthlyRevenue", "30,000,000");
    setValue("targetMonthlyRevenue", "40,000,000");
    setValue("averageOrderValue", "25,000");
    setValue("operatingDays", "20");
    advanceQuestions(4);
    choose("monthlyCustomerCountStatus", "exact");
    setValue("monthlyCustomerCount", customerCount);
    choose("primaryConcern", "unknown");
    advanceQuestions(2);

    const visibleQuestions = root.querySelectorAll<HTMLElement>(
      "[data-question]:not([hidden])",
    );
    expect(visibleQuestions).toHaveLength(1);
    expect(visibleQuestions[0]?.dataset.question).toBe(
      "monthlyCustomerCountStatus",
    );
    expect(document.activeElement).toBe(
      root.querySelector("[name='monthlyCustomerCount']"),
    );
  },
);

test("requires an exact direct revenue allocation before the next step", async () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing test root");
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");
  setValue("averageMonthlyRevenue", "30,000,000");
  setValue("targetMonthlyRevenue", "40,000,000");
  setValue("averageOrderValue", "25,000");
  setValue("operatingDays", "20");

  const allocation = document.querySelector<HTMLInputElement>(
    "[name='newCustomerRevenue']",
  );
  expect(allocation).not.toBeNull();
  if (!allocation) return;
  allocation.value = "9,999,999";
  allocation.dispatchEvent(new Event("input", { bubbles: true }));
  advanceQuestions(4);

  expect(allocation.getAttribute("aria-invalid")).toBe("true");
  expect(document.querySelector<HTMLElement>("[data-step='1']")?.hidden).toBe(
    false,
  );
});

test.each(
  [
    "newCustomerRevenue",
    "returningCustomerRevenue",
    "averageOrderValueRevenue",
  ].flatMap((field) =>
    ["abc", "Infinity", "1e309"].map((value) => [field, value] as const),
  ),
)("rejects malformed direct allocation %s=%s", async (field, value) => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing test root");
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");
  setValue("averageMonthlyRevenue", "30,000,000");
  setValue("targetMonthlyRevenue", "40,000,000");
  setValue("averageOrderValue", "25,000");
  setValue("operatingDays", "20");
  setValue(field, value);
  advanceQuestions(4);

  const input = document.querySelector<HTMLInputElement>(`[name='${field}']`);
  expect(input?.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(input);
  expect(document.querySelector<HTMLElement>("[data-step='1']")?.hidden).toBe(
    false,
  );
});

test("only enables and reads advertising details while ads are running", async () => {
  const root = await openStepThree();
  const fields = root.querySelector<HTMLElement>("[data-advertising-fields]");
  const costPerClick = root.querySelector<HTMLInputElement>(
    "[name='costPerClick']",
  );
  const actualAdSpend = root.querySelector<HTMLInputElement>(
    "[name='actualAdSpend']",
  );

  expect(fields?.hidden).toBe(true);
  expect(costPerClick?.disabled).toBe(true);
  expect(actualAdSpend?.disabled).toBe(true);

  choose("adsRunning", "true");
  expect(fields?.hidden).toBe(false);
  expect(costPerClick?.disabled).toBe(false);
  expect(actualAdSpend?.disabled).toBe(false);
  setValue("costPerClick", "500");
  setValue("actualAdSpend", "750000");

  choose("adsRunning", "false");
  expect(fields?.hidden).toBe(true);
  expect(costPerClick?.disabled).toBe(true);
  expect(actualAdSpend?.disabled).toBe(true);
  expect(costPerClick?.value).toBe("");
  expect(actualAdSpend?.value).toBe("");
  click("[data-submit-diagnosis]");
  await Promise.resolve();
  await Promise.resolve();

  expect(document.querySelectorAll("[data-recommended-action]")).toHaveLength(
    1,
  );
  expect(text()).not.toContain("광고 비용은 아직 계산하지 않았어요");
  expect(text()).not.toContain("7일 동안 신규 고객의 방문 경로를 기록하세요");
});

test("completes diagnosis without opening restaurant details", async () => {
  await openStepThree();
  choose("adsRunning", "false");
  click("[data-submit-diagnosis]");
  await Promise.resolve();

  expect(document.querySelector("[data-recommended-action]")).not.toBeNull();
});

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

test.each([
  ["no", "추가 고객을 받기 어려운 운영 제약", "그 제약을 먼저 해결"],
  ["sometimes", "시간대에 따른 운영 제약", "제한적으로 시험"],
] as const)(
  "does not let available seats upgrade owner-declared %s capacity",
  async (declaredCapacity, constraintCopy, priorityCopy) => {
    await openStepThree();
    choose("capacity", declaredCapacity);
    choose("restaurantPeakOccupancy", "half");
    choose("adsRunning", "false");
    click("[data-submit-diagnosis]");
    await Promise.resolve();
    await Promise.resolve();

    const insight =
      document.querySelector("[data-restaurant-insight]")?.textContent ?? "";
    expect(insight).toContain("좌석만 보면 여유가 있어 보이지만");
    expect(insight).toContain(constraintCopy);
    expect(insight).toContain(priorityCopy);
    expect(insight).not.toContain("신규 고객 확보가 먼저입니다");
  },
);

test("does not claim numeric capacity from missing operations data", async () => {
  await openStepThree();
  choose("adsRunning", "false");
  click("[data-submit-diagnosis]");
  await Promise.resolve();
  await Promise.resolve();

  const copy =
    document.querySelector("[data-restaurant-insight]")?.textContent ?? "";
  expect(document.querySelector("[data-restaurant-insight]")).toBeNull();
  expect(copy).not.toMatch(/최대 .*명.*받을 수/);
});

test.each([
  ["waiting", "no", "average-order-value"],
  ["almost_full", "sometimes", "off-peak-offer"],
] as const)(
  "uses %s peak occupancy to conservatively select %s capacity guidance",
  async (peakOccupancy, effectiveCapacity, actionKey) => {
    const service = createDemoService();
    const saveAssessment = vi.spyOn(service, "saveAssessment");
    await openStepThree("unknown", service);
    choose("restaurantPeakOccupancy", peakOccupancy);
    choose("adsRunning", "false");
    click("[data-submit-diagnosis]");
    await Promise.resolve();
    await Promise.resolve();

    expect(saveAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: expect.objectContaining({ capacity: "yes" }),
        diagnosis: expect.objectContaining({
          effectiveCapacity,
          actionKey,
        }),
      }),
    );
    expect(
      document.querySelector("[data-recommended-action]")?.textContent,
    ).not.toContain("검색한 고객이 선택할 이유 한 가지를 고치세요");
  },
);

test.each([
  ["exact", "980", 980, "actual", "입력 기준"],
  ["approximate", "980", 980, "approximate", "대략 입력 기준"],
  ["unknown", undefined, null, "estimated", "추정 기준"],
] as const)(
  "persists %s customer-count confidence and provenance",
  async (
    status,
    enteredCount,
    monthlyCustomerCount,
    customerCountSource,
    badge,
  ) => {
    const service = createDemoService();
    const saveAssessment = vi.spyOn(service, "saveAssessment");
    await openStepThree("unknown", service, status, enteredCount);
    choose("adsRunning", "false");
    click("[data-submit-diagnosis]");
    await Promise.resolve();
    await Promise.resolve();

    expect(saveAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: expect.objectContaining({
          revenue: expect.objectContaining({
            monthlyCustomerCount,
            monthlyCustomerCountStatus: status,
          }),
        }),
        metrics: expect.objectContaining({
          customerCountSource,
        }),
      }),
    );
    expect(document.querySelector(".estimate-badge")?.textContent).toBe(badge);
  },
);

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

test("validates restaurant details when leaving the capacity question", async () => {
  const root = await openStepThree();
  const details = root.querySelector<HTMLDetailsElement>(
    "[data-restaurant-details]",
  )!;
  click("[data-prev-question]");
  click("[data-prev-question]");
  click("[data-prev-question]");
  click("[data-prev-question]");
  setValue("restaurantSeats", "0");
  expect(details.open).toBe(false);
  click("[data-next-question]");

  const seats = root.querySelector<HTMLInputElement>(
    "[name='restaurantSeats']",
  );
  expect(
    root.querySelector<HTMLElement>("[data-question='capacity']")?.hidden,
  ).toBe(false);
  expect(details.open).toBe(true);
  expect(seats?.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(seats);
});

test("links a shared restaurant details channel error to all three inputs", async () => {
  const root = await openStepThree();
  const details = root.querySelector<HTMLDetailsElement>(
    "[data-restaurant-details]",
  )!;
  setValue("dineInShare", "50");
  setValue("takeoutShare", "30");
  setValue("deliveryShare", "10");
  expect(details.open).toBe(false);
  choose("adsRunning", "false");
  click("[data-submit-diagnosis]");

  const channelInputs = ["dineInShare", "takeoutShare", "deliveryShare"].map(
    (name) => root.querySelector<HTMLInputElement>(`[name='${name}']`)!,
  );
  expect(
    root.querySelector<HTMLElement>("[data-question='capacity']")?.hidden,
  ).toBe(false);
  expect(details.open).toBe(true);
  channelInputs.forEach((input) => {
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(
      "channelShares-error",
    );
  });
  expect(root.querySelector("#channelShares-error")?.textContent).not.toBe("");
  expect(document.activeElement).toBe(channelInputs[0]);
});

test("rejects malformed optional restaurant details on submit", async () => {
  const root = await openStepThree();
  setValue("restaurantHallHours", "abc");
  choose("adsRunning", "false");
  click("[data-submit-diagnosis]");

  const hallHours = root.querySelector<HTMLInputElement>(
    "[name='restaurantHallHours']",
  );
  expect(
    root.querySelector<HTMLElement>("[data-question='capacity']")?.hidden,
  ).toBe(false);
  expect(hallHours?.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(hallHours);
});

test("uses exactly one measurement action for partial live advertising data", async () => {
  await openStepThree("ads");
  choose("adsRunning", "true");
  setValue("costPerClick", "500");
  click("[data-submit-diagnosis]");
  await Promise.resolve();
  await Promise.resolve();

  expect(document.querySelectorAll("[data-recommended-action]")).toHaveLength(
    1,
  );
  expect(
    document.querySelector("[data-recommended-action]")?.textContent,
  ).toContain("7일 동안 신규 고객의 방문 경로를 기록하세요");
  expect(text()).not.toContain("예상 광고비:");
});

test("uses one measurement action and no figures when only actual ad spend is missing", async () => {
  await openStepThree("ads");
  choose("adsRunning", "true");
  setValue("visitConversionRate", "20");
  setValue("costPerClick", "500");
  setValue("actualAdNewCustomers", "50");
  click("[data-submit-diagnosis]");
  await Promise.resolve();
  await Promise.resolve();

  expect(document.querySelectorAll("[data-recommended-action]")).toHaveLength(
    1,
  );
  expect(
    document.querySelector("[data-recommended-action]")?.textContent,
  ).toContain("7일 동안 신규 고객의 방문 경로를 기록하세요");
  expect(text()).not.toContain("필요 클릭 수:");
  expect(text()).not.toContain("예상 광고비:");
  expect(text()).not.toContain("실제 기준 CAC:");
});

test("uses exactly one measurement action after target reached when actual ad spend is missing", async () => {
  await openStepThree("ads");
  setValue("averageMonthlyRevenue", "40,000,000");
  choose("adsRunning", "true");
  setValue("visitConversionRate", "20");
  setValue("costPerClick", "500");
  setValue("actualAdNewCustomers", "50");
  click("[data-submit-diagnosis]");
  await Promise.resolve();
  await Promise.resolve();

  const actions = document.querySelectorAll("[data-recommended-action]");
  expect(actions).toHaveLength(1);
  expect(actions[0]?.textContent).toContain(
    "7일 동안 신규 고객의 방문 경로를 기록하세요",
  );
  expect(actions[0]?.textContent).not.toContain(
    "추가 광고보다 남는 매출부터 확인하세요",
  );
});

test.each(["-1", "abc", "Infinity", "1e309"])(
  "links and focuses an invalid actual ad spend %s",
  async (value) => {
    const root = await openStepThree("ads");
    choose("adsRunning", "true");
    const actualAdSpend = root.querySelector<HTMLInputElement>(
      "[name='actualAdSpend']",
    );
    expect(actualAdSpend).not.toBeNull();
    if (!actualAdSpend) return;
    setValue("actualAdSpend", value);
    click("[data-submit-diagnosis]");

    expect(actualAdSpend.getAttribute("aria-describedby")).toContain(
      "actualAdSpend-error",
    );
    expect(actualAdSpend.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(actualAdSpend);
  },
);

test("shows advertising estimates only after all actual advertising values are entered", async () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing test root");
  const service = createDemoService();
  const saveAssessment = vi.spyOn(service, "saveAssessment");
  await createApp(root, service).start();
  click("[data-start-diagnosis]");
  setValue("averageMonthlyRevenue", "30,000,000");
  setValue("targetMonthlyRevenue", "40,000,000");
  setValue("averageOrderValue", "25,000");
  setValue("operatingDays", "20");
  advanceQuestions(4);
  choose("monthlyCustomerCountStatus", "unknown");
  choose("primaryConcern", "ads");
  advanceQuestions(2);
  choose("capacity", "yes");
  choose("returningDataStatus", "unknown");
  choose("hasConsentDb", "false");
  choose("canChangeMenu", "true");
  advanceQuestions(4);
  choose("adsRunning", "true");
  setValue("visitConversionRate", "20");
  setValue("costPerClick", "500");
  setValue("actualAdNewCustomers", "50");
  setValue("actualAdSpend", "750000");
  click("[data-submit-diagnosis]");
  await Promise.resolve();
  await Promise.resolve();

  expect(text()).toContain("실제 입력값을 전제로 한 광고 추정");
  expect(text()).toContain("필요 클릭 수: 2,000회");
  expect(text()).toContain("예상 광고비: 1,000,000원");
  expect(text()).toContain("실제 기준 CAC: 15,000원");
  expect(text()).toContain(
    "실제 방문 전환율 20%, 평균 클릭 비용 500원, 광고 유입 실제 신규 고객 50명, 실제 집행 광고비 750,000원",
  );
  expect(text()).toContain("확정 비용이나 성과 보장이 아닙니다");
  expect(saveAssessment).toHaveBeenCalledWith(
    expect.objectContaining({
      inputs: expect.objectContaining({
        advertising: {
          visitConversionRate: 0.2,
          costPerClick: 500,
          actualAdNewCustomers: 50,
          actualAdSpend: 750_000,
        },
      }),
    }),
  );
});
