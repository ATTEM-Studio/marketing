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
