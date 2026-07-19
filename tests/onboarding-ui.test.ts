import { beforeEach, expect, test, vi } from "vitest";
import type { AppService, BuyerRegistration } from "../src/services/contracts";
import { renderOnboarding } from "../src/ui/onboarding";

const registrationCalls: BuyerRegistration[] = [];
const service = (): AppService => ({
  getSession: vi.fn(async () => ({ mode: "live" as const, profile: null })),
  registerBuyer: vi.fn(async (input) => {
    registrationCalls.push(input);
    return {
      mode: "live" as const,
      profile: {
        id: "buyer-1",
        name: input.name,
        email: input.email,
        region: input.region,
        businessName: input.businessName,
      },
    };
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

test("keeps the primary onboarding journey on instant registration", () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  renderOnboarding(root, service(), { onAuthenticated: vi.fn() }, "register");

  expect(root.querySelector("[data-registration-form]")).not.toBeNull();
  expect(root.querySelector("[data-login-form]")).toBeNull();
  expect(root.querySelector("[data-show-login]")).toBeNull();
});

test("labels every registration field as required or optional", () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  renderOnboarding(root, service(), { onAuthenticated: vi.fn() }, "register");

  expect(root.querySelectorAll(".required-label")).toHaveLength(5);
  expect(root.textContent).toContain("선택");
});

test("keeps marketing consent optional and enters immediately", async () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const onAuthenticated = vi.fn();
  renderOnboarding(root, service(), { onAuthenticated });
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
  expect(onAuthenticated).toHaveBeenCalledWith(
    expect.objectContaining({
      profile: expect.objectContaining({ id: "buyer-1" }),
    }),
  );
});

test("explains that records stay on this device", () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  renderOnboarding(root, service(), { onAuthenticated: vi.fn() });

  expect(root.textContent).toContain("이 기기에 기록이 저장됩니다");
  expect(root.textContent).toContain(
    "다른 기기에서는 이전 기록을 불러올 수 없어요",
  );
  expect(root.textContent).toContain("바로 진단 시작하기");
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
  renderOnboarding(root, fake, { onAuthenticated: vi.fn() }, "login");
  set("loginEmail", "buyer@example.com");
  document.querySelector<HTMLFormElement>("[data-login-form]")?.requestSubmit();
  await Promise.resolve();
  expect(fake.sendLoginLink).toHaveBeenCalledWith("buyer@example.com");
  expect(document.body.textContent).toContain(
    "등록된 주소라면 링크를 보냅니다",
  );
});

test.each(["not-registered", "auth-rejected"])(
  "keeps login acknowledgement the same when %s",
  async (_outcome) => {
    const fake = service();
    fake.sendLoginLink = vi.fn(async () => {
      throw new Error("authentication response");
    });
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) throw new Error("missing root");
    renderOnboarding(root, fake, { onAuthenticated: vi.fn() }, "login");
    set("loginEmail", "buyer@example.com");
    document
      .querySelector<HTMLFormElement>("[data-login-form]")
      ?.requestSubmit();
    await Promise.resolve();

    expect(document.body.textContent).toContain(
      "등록된 주소라면 링크를 보냅니다",
    );
  },
);

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
