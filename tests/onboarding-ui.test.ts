import { beforeEach, expect, test, vi } from "vitest";
import type { AppService, BuyerRegistration } from "../src/services/contracts";
import { renderOnboarding } from "../src/ui/onboarding";

const registrationCalls: BuyerRegistration[] = [];
const service = (): AppService => ({
  getSession: vi.fn(async () => ({ mode: "live" as const, profile: null })),
  registerBuyer: vi.fn(async (input) => {
    registrationCalls.push(input);
  }),
  sendLoginLink: vi.fn(async () => undefined),
  finalizeRegistration: vi.fn(async () => ({
    mode: "live" as const,
    profile: null,
  })),
  signOut: vi.fn(async () => undefined),
  saveAssessment: vi.fn(async () => {
    throw new Error("unused");
  }),
  getLatestAssessment: vi.fn(async () => null),
  saveActionPlan: vi.fn(async () => {
    throw new Error("unused");
  }),
  listActionPlans: vi.fn(async () => []),
  completeActionPlan: vi.fn(async () => {
    throw new Error("unused");
  }),
});

const set = (name: string, value: string) => {
  const input = document.querySelector<HTMLInputElement>(`[name='${name}']`);
  if (!input) throw new Error(`missing ${name}`);
  input.value = value;
};

beforeEach(() => {
  registrationCalls.length = 0;
  document.body.innerHTML = '<div id="app"></div>';
});

test("keeps marketing consent optional", async () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  renderOnboarding(root, service(), { onAuthenticated: vi.fn() });
  set("name", "구매자");
  set("email", "buyer@example.com");
  set("region", "서울");
  set("businessName", "구매자 식당");
  set("inviteCode", "BUYER-001");
  document.querySelector<HTMLInputElement>("[name='serviceConsent']")?.click();
  document
    .querySelector<HTMLFormElement>("[data-registration-form]")
    ?.requestSubmit();
  await Promise.resolve();
  expect(registrationCalls[0]).toMatchObject({
    serviceConsent: true,
    marketingConsent: false,
  });
  expect(document.body.textContent).toContain("이메일을 확인해 주세요");
});

test("requires service consent", () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  renderOnboarding(root, service(), { onAuthenticated: vi.fn() });
  const button = document.querySelector<HTMLButtonElement>(
    "[data-register-submit]",
  );
  expect(button?.disabled).toBe(true);
});

test("shows a generic invite failure", async () => {
  const failing = service();
  failing.registerBuyer = vi.fn(async () => {
    throw new Error(
      "코드를 확인할 수 없습니다. 입력 내용을 다시 확인해 주세요.",
    );
  });
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  renderOnboarding(root, failing, { onAuthenticated: vi.fn() });
  set("name", "구매자");
  set("email", "buyer@example.com");
  set("region", "서울");
  set("businessName", "구매자 식당");
  set("inviteCode", "WRONG");
  document.querySelector<HTMLInputElement>("[name='serviceConsent']")?.click();
  document
    .querySelector<HTMLFormElement>("[data-registration-form]")
    ?.requestSubmit();
  await Promise.resolve();
  await Promise.resolve();
  expect(document.body.textContent).toContain("코드를 확인할 수 없습니다");
});

test("sends an existing buyer login link", async () => {
  const fake = service();
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  renderOnboarding(root, fake, { onAuthenticated: vi.fn() });
  set("loginEmail", "buyer@example.com");
  document.querySelector<HTMLFormElement>("[data-login-form]")?.requestSubmit();
  await Promise.resolve();
  expect(fake.sendLoginLink).toHaveBeenCalledWith("buyer@example.com");
  expect(document.body.textContent).toContain("로그인 링크를 보냈습니다");
});

test("does not finalize after an auth callback until the user confirms", async () => {
  const fake = service();
  const onAuthenticated = vi.fn();
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  renderOnboarding(root, fake, { onAuthenticated, authCallback: true });

  expect(fake.finalizeRegistration).not.toHaveBeenCalled();
  document
    .querySelector<HTMLButtonElement>("[data-confirm-registration]")
    ?.click();
  await Promise.resolve();

  expect(fake.finalizeRegistration).toHaveBeenCalledTimes(1);
  expect(onAuthenticated).toHaveBeenCalledTimes(1);
});
