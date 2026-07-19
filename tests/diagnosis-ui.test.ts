import { beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app";
import { createDemoService } from "../src/services/demo-service";

const text = () => document.body.textContent ?? "";
const click = (selector: string) => {
  const button = document.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`missing button ${selector}`);
  button.click();
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

const openStepThree = async (primaryConcern = "unknown") => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing test root");
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");
  setValue("averageMonthlyRevenue", "30,000,000");
  setValue("targetMonthlyRevenue", "40,000,000");
  setValue("averageOrderValue", "25,000");
  setValue("operatingDays", "20");
  click("[data-next-step]");
  choose("monthlyCustomerCountStatus", "unknown");
  choose("primaryConcern", primaryConcern);
  click("[data-next-step]");
  choose("capacity", "yes");
  choose("returningDataStatus", "unknown");
  choose("hasConsentDb", "false");
  choose("canChangeMenu", "true");
  return root;
};

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
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
  click("[data-next-step]");
  choose("monthlyCustomerCountStatus", "unknown");
  choose("primaryConcern", "unknown");
  click("[data-next-step]");
  choose("capacity", "yes");
  choose("returningDataStatus", "unknown");
  choose("hasConsentDb", "false");
  choose("canChangeMenu", "true");
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
  click("[data-next-step]");

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
    click("[data-next-step]");

    expect(
      document
        .querySelector("[name='averageMonthlyRevenue']")
        ?.getAttribute("aria-invalid"),
    ).toBe("true");
  },
);

test("does not use unconnected repeat data for a repeat recommendation", async () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing test root");
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");
  setValue("averageMonthlyRevenue", "30,000,000");
  setValue("targetMonthlyRevenue", "40,000,000");
  setValue("averageOrderValue", "25,000");
  setValue("operatingDays", "20");
  click("[data-next-step]");
  choose("monthlyCustomerCountStatus", "unknown");
  choose("primaryConcern", "returning");
  click("[data-next-step]");
  choose("capacity", "yes");
  choose("returningDataStatus", "known");
  choose("hasConsentDb", "true");
  choose("canChangeMenu", "true");
  choose("adsRunning", "false");
  choose("hasConnectedVisitHistory", "false");
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
  click("[data-next-step]");
  click("[data-next-step]");

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
  "keeps a known monthly customer count of %s on step two with an error",
  async (customerCount) => {
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) throw new Error("missing test root");
    await createApp(root, createDemoService()).start();
    click("[data-start-diagnosis]");
    setValue("averageMonthlyRevenue", "30,000,000");
    setValue("targetMonthlyRevenue", "40,000,000");
    setValue("averageOrderValue", "25,000");
    setValue("operatingDays", "20");
    click("[data-next-step]");
    choose("monthlyCustomerCountStatus", "known");
    setValue("monthlyCustomerCount", customerCount);
    choose("primaryConcern", "unknown");
    click("[data-next-step]");

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
  click("[data-next-step]");

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
  click("[data-next-step]");

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

  expect(fields?.hidden).toBe(true);
  expect(costPerClick?.disabled).toBe(true);

  choose("adsRunning", "true");
  expect(fields?.hidden).toBe(false);
  expect(costPerClick?.disabled).toBe(false);
  setValue("costPerClick", "500");

  choose("adsRunning", "false");
  expect(fields?.hidden).toBe(true);
  expect(costPerClick?.disabled).toBe(true);
  expect(costPerClick?.value).toBe("");
  click("[data-submit-diagnosis]");
  await Promise.resolve();
  await Promise.resolve();

  expect(document.querySelectorAll("[data-recommended-action]")).toHaveLength(
    1,
  );
  expect(text()).not.toContain("광고 비용은 아직 계산하지 않았어요");
  expect(text()).not.toContain("7일 동안 신규 고객의 방문 경로를 기록하세요");
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

test("shows advertising estimates only after all actual advertising values are entered", async () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing test root");
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");
  setValue("averageMonthlyRevenue", "30,000,000");
  setValue("targetMonthlyRevenue", "40,000,000");
  setValue("averageOrderValue", "25,000");
  setValue("operatingDays", "20");
  click("[data-next-step]");
  choose("monthlyCustomerCountStatus", "unknown");
  choose("primaryConcern", "ads");
  click("[data-next-step]");
  choose("capacity", "yes");
  choose("returningDataStatus", "unknown");
  choose("hasConsentDb", "false");
  choose("canChangeMenu", "true");
  choose("adsRunning", "true");
  setValue("visitConversionRate", "20");
  setValue("costPerClick", "500");
  setValue("actualAdNewCustomers", "50");
  click("[data-submit-diagnosis]");
  await Promise.resolve();
  await Promise.resolve();

  expect(text()).toContain("실제 입력값을 전제로 한 광고 추정");
  expect(text()).toContain("필요 클릭 수: 2,000회");
  expect(text()).toContain("예상 광고비: 1,000,000원");
  expect(text()).toContain(
    "실제 방문 전환율 20%, 평균 클릭 비용 500원, 광고 유입 실제 신규 고객 50명",
  );
  expect(text()).toContain("확정 비용이나 성과 보장이 아닙니다");
});
