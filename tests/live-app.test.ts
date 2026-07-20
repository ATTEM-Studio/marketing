import { expect, test, vi } from "vitest";
import { createApp } from "../src/app";
import type { AppService } from "../src/services/contracts";

function liveService(signOut = vi.fn(async () => undefined)): AppService {
  return {
    getSession: vi.fn(async () => ({
      mode: "live" as const,
      profile: {
        id: "buyer-1",
        name: "구매자",
        email: "buyer@example.com",
        region: "서울",
        businessName: "구매자 식당",
      },
    })),
    registerBuyer: vi.fn(async () => ({
      mode: "live" as const,
      profile: null,
    })),
    sendLoginLink: vi.fn(async () => undefined),
    finalizeRegistration: vi.fn(async () => ({
      mode: "live" as const,
      profile: null,
    })),
    signOut,
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
    askCoach: vi.fn(async () => {
      throw new Error("unused");
    }),
    rateCoaching: vi.fn(async () => undefined),
  };
}

test("shows the landing page before onboarding for a signed-out live visitor", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const fake = liveService();
  fake.getSession = vi.fn(async () => ({
    mode: "live" as const,
    profile: null,
  }));

  await createApp(root, fake, { isLive: true }).start();

  expect(root.querySelector("[data-start-registration]")).not.toBeNull();
  expect(root.querySelector("[data-registration-form]")).toBeNull();
  root.querySelector<HTMLButtonElement>("[data-start-registration]")?.click();
  expect(root.querySelector("[data-registration-form]")).not.toBeNull();
});

test("lets an active live buyer sign out accessibly", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const signOut = vi.fn(async () => undefined);
  await createApp(root, liveService(signOut), { isLive: true }).start();

  const button = root.querySelector<HTMLButtonElement>("[data-sign-out]");
  expect(button?.textContent).toContain("로그아웃");
  button?.click();
  await Promise.resolve();

  expect(signOut).toHaveBeenCalledTimes(1);
  expect(root.querySelector("[data-start-diagnosis]")).toBeNull();
});

test("keeps the sign-out control available with a general error", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  await createApp(
    root,
    liveService(
      vi.fn(async () => {
        throw new Error("network");
      }),
    ),
    { isLive: true },
  ).start();

  const button = root.querySelector<HTMLButtonElement>("[data-sign-out]");
  button?.click();
  await Promise.resolve();

  expect(root.textContent).toContain("로그아웃하지 못했습니다");
  expect(button?.disabled).toBe(false);
});

test("keeps the diagnosis visible when saving fails", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const fake = liveService();
  fake.saveAssessment = vi.fn(async () => {
    throw new Error("network");
  });
  await createApp(root, fake, { isLive: true }).start();
  root.querySelector<HTMLButtonElement>("[data-start-diagnosis]")?.click();
  const set = (name: string, value: string) => {
    const input = root.querySelector<HTMLInputElement>(`[name='${name}']`);
    if (!input) throw new Error(`missing ${name}`);
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const choose = (name: string, value: string) =>
    root
      .querySelector<HTMLInputElement>(`[name='${name}'][value='${value}']`)
      ?.click();
  const click = (selector: string) =>
    root.querySelector<HTMLButtonElement>(selector)?.click();
  set("averageMonthlyRevenue", "30000000");
  set("targetMonthlyRevenue", "40000000");
  set("averageOrderValue", "25000");
  set("operatingDays", "20");
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

  expect(root.querySelector("[data-diagnosis-form]")).not.toBeNull();
  expect(root.textContent).toContain("저장하지 못했습니다");
  expect(document.activeElement).toBe(
    root.querySelector("[data-submit-diagnosis]"),
  );
});

test("consumes only the auth callback flag before logout and a later reload", async () => {
  window.history.replaceState({}, "", "/?auth=callback&keep=1#magic-link");
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const signedIn = liveService();
  await createApp(root, signedIn, { isLive: true, authCallback: true }).start();

  expect(window.location.search).toBe("?keep=1");
  expect(window.location.hash).toBe("#magic-link");
  root.querySelector<HTMLButtonElement>("[data-sign-out]")?.click();
  await Promise.resolve();

  const signedOut = liveService();
  signedOut.getSession = vi.fn(async () => ({
    mode: "live" as const,
    profile: null,
  }));
  await createApp(root, signedOut, {
    isLive: true,
    authCallback:
      new URLSearchParams(window.location.search).get("auth") === "callback",
  }).start();

  expect(root.querySelector("[data-confirm-registration]")).toBeNull();
  expect(root.querySelector("[data-start-registration]")).not.toBeNull();
});

test("consumes the callback after explicit new-buyer finalization", async () => {
  window.history.replaceState({}, "", "/?auth=callback&keep=1#magic-link");
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const fake = liveService();
  fake.getSession = vi.fn(async () => ({
    mode: "live" as const,
    profile: null,
  }));
  fake.finalizeRegistration = vi.fn(async () => ({
    mode: "live" as const,
    profile: {
      id: "buyer-1",
      name: "구매자",
      email: "buyer@example.com",
      region: "서울",
      businessName: "구매자 식당",
    },
  }));
  await createApp(root, fake, { isLive: true, authCallback: true }).start();
  expect(fake.finalizeRegistration).not.toHaveBeenCalled();

  root.querySelector<HTMLButtonElement>("[data-confirm-registration]")?.click();
  await Promise.resolve();

  expect(fake.finalizeRegistration).toHaveBeenCalledTimes(1);
  expect(window.location.search).toBe("?keep=1");
  expect(window.location.hash).toBe("#magic-link");
});
