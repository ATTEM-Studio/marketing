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
