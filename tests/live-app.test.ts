import { expect, test, vi } from "vitest";
import { createApp } from "../src/app";
import { AdminApiError } from "../src/admin/api";
import type { AdminOverview } from "../src/admin/types";
import type { AppService } from "../src/services/contracts";
import { createAuthenticAssessment } from "./fixtures/authentic-assessment";

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

test("returns from coaching to a freshly loaded dashboard", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const service = liveService();
  service.getLatestAssessment = vi.fn(async () => createAuthenticAssessment());

  await createApp(root, service, { isLive: true }).start();
  root.querySelector<HTMLButtonElement>("[data-start-coaching]")?.click();

  expect(root.querySelector(".coaching-shell")).not.toBeNull();
  root.querySelector<HTMLButtonElement>("[data-coaching-back]")?.click();
  await vi.waitFor(() => {
    expect(root.querySelector(".dashboard-shell")).not.toBeNull();
  });
  expect(service.getLatestAssessment).toHaveBeenCalledTimes(2);
});

test("reopens the latest diagnosis as a read-only result and returns", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const service = liveService();
  service.getLatestAssessment = vi.fn(async () => createAuthenticAssessment());

  await createApp(root, service, { isLive: true }).start();
  root.querySelector<HTMLButtonElement>("[data-view-latest-result]")?.click();

  expect(root.querySelector(".result-shell")).not.toBeNull();
  expect(root.querySelector("[data-save-action]")).toBeNull();
  expect(root.textContent).toContain("최대 100명");
  expect(root.textContent).toContain("하루 최대");

  root.querySelector<HTMLButtonElement>("[data-result-back]")?.click();
  await vi.waitFor(() => {
    expect(root.querySelector(".dashboard-shell")).not.toBeNull();
  });
  expect(service.getLatestAssessment).toHaveBeenCalledTimes(2);
});

test("starts only one dashboard reload after rapid coaching back attempts", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const service = liveService();
  let resolveReload:
    | ((value: Awaited<ReturnType<AppService["getSession"]>>) => void)
    | undefined;
  const reload = new Promise<Awaited<ReturnType<AppService["getSession"]>>>(
    (resolve) => {
      resolveReload = resolve;
    },
  );
  let sessionCalls = 0;
  service.getSession = vi.fn(async () => {
    sessionCalls += 1;
    if (sessionCalls <= 2) {
      return {
        mode: "live" as const,
        profile: {
          id: "buyer-1",
          name: "buyer",
          email: "buyer@example.com",
          region: "서울",
          businessName: "buyer restaurant",
        },
      };
    }
    return reload;
  });
  service.getLatestAssessment = vi.fn(async () => createAuthenticAssessment());

  await createApp(root, service, { isLive: true }).start();
  root.querySelector<HTMLButtonElement>("[data-start-coaching]")?.click();
  const coachingBack = root.querySelector<HTMLButtonElement>(
    "[data-coaching-back]",
  );
  coachingBack?.click();
  coachingBack?.click();

  expect(service.getSession).toHaveBeenCalledTimes(3);
  expect(coachingBack?.disabled).toBe(true);

  resolveReload?.({
    mode: "live",
    profile: {
      id: "buyer-1",
      name: "buyer",
      email: "buyer@example.com",
      region: "서울",
      businessName: "buyer restaurant",
    },
  });
  await vi.waitFor(() => {
    expect(root.querySelector(".dashboard-shell")).not.toBeNull();
  });
});

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

const adminOverview: AdminOverview = {
  totals: { total: 128, today: 3, last7Days: 18, last30Days: 61 },
  daily: [{ date: "2026-07-29", count: 3 }],
  members: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      name: "관리 대상 회원",
      email: "private-member@example.com",
      region: "서울",
      businessName: "관리 대상 식당",
      joinedAt: "2026-07-29T01:00:00.000Z",
      duplicate: null,
    },
  ],
  page: 1,
  pageSize: 25,
  totalRows: 1,
};

function adminClient(
  options: {
    session?: () => Promise<{ authenticated: true }>;
    overview?: () => Promise<AdminOverview>;
  } = {},
) {
  return {
    login: vi.fn(async () => undefined),
    session: vi.fn(
      options.session ??
        (async () => {
          throw new AdminApiError("unauthorized");
        }),
    ),
    logout: vi.fn(async () => undefined),
    overview: vi.fn(
      options.overview ?? (async () => structuredClone(adminOverview)),
    ),
    member: vi.fn(async () => {
      throw new Error("unused");
    }),
  };
}

function pressAdminLogo(root: HTMLElement, times = 10): void {
  for (let index = 0; index < times; index += 1) {
    root.querySelector<HTMLButtonElement>("[data-admin-trigger]")?.click();
  }
}

test("installs one delegated secret entry and opens the dashboard after login", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const admin = adminClient();
  await createApp(root, liveService(), {
    isLive: true,
    adminApi: admin,
  }).start();

  pressAdminLogo(root, 9);
  expect(root.querySelector("[data-admin-login-overlay]")).toBeNull();
  pressAdminLogo(root, 1);
  await vi.waitFor(() => {
    expect(root.querySelector("[data-admin-login-overlay]")).not.toBeNull();
  });
  expect(admin.session).toHaveBeenCalledTimes(1);

  const password = root.querySelector<HTMLInputElement>("[name='password']");
  if (!password) throw new Error("missing admin password");
  password.value = "correct";
  root
    .querySelector<HTMLFormElement>("[data-admin-login-form]")
    ?.requestSubmit();
  await vi.waitFor(() => {
    expect(root.querySelector("[data-admin-dashboard]")).not.toBeNull();
  });

  expect(admin.login).toHaveBeenCalledWith("correct");
  expect(root.textContent).toContain("관리 대상 회원");
});

test("opens the dashboard directly when the administrator session is valid", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const admin = adminClient({
    session: async () => ({ authenticated: true }),
  });
  await createApp(root, liveService(), {
    isLive: true,
    adminApi: admin,
  }).start();

  pressAdminLogo(root);
  await vi.waitFor(() => {
    expect(root.querySelector("[data-admin-dashboard]")).not.toBeNull();
  });

  expect(admin.login).not.toHaveBeenCalled();
  expect(admin.overview).toHaveBeenCalledTimes(1);
});

test("clears administrator PII and returns to login when the session expires", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  let requests = 0;
  const admin = adminClient({
    session: async () => ({ authenticated: true }),
    overview: async () => {
      requests += 1;
      if (requests === 1) return structuredClone(adminOverview);
      throw new AdminApiError("unauthorized");
    },
  });
  await createApp(root, liveService(), {
    isLive: true,
    adminApi: admin,
  }).start();
  pressAdminLogo(root);
  await vi.waitFor(() => {
    expect(root.textContent).toContain("private-member@example.com");
  });

  root
    .querySelector<HTMLButtonElement>("[data-duplicate-filter='review']")
    ?.click();
  await vi.waitFor(() => {
    expect(root.querySelector("[data-admin-login-overlay]")).not.toBeNull();
  });

  expect(root.textContent).not.toContain("private-member@example.com");
  expect(root.textContent).not.toContain("관리 대상 식당");
});

test("administrator logout clears PII and restores the prior usable normal view", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const admin = adminClient({
    session: async () => ({ authenticated: true }),
  });
  await createApp(root, liveService(), {
    isLive: true,
    adminApi: admin,
  }).start();
  const priorDashboard = root.querySelector<HTMLElement>(".dashboard-shell");
  pressAdminLogo(root);
  await vi.waitFor(() => {
    expect(root.querySelector("[data-admin-dashboard]")).not.toBeNull();
  });

  root.querySelector<HTMLButtonElement>("[data-admin-logout]")?.click();
  await vi.waitFor(() => {
    expect(root.querySelector(".dashboard-shell")).not.toBeNull();
  });

  expect(admin.logout).toHaveBeenCalledTimes(1);
  expect(root.querySelector(".dashboard-shell")).toBe(priorDashboard);
  expect(root.textContent).not.toContain("private-member@example.com");
  root.querySelector<HTMLButtonElement>("[data-start-diagnosis]")?.click();
  expect(root.querySelector("[data-diagnosis-form]")).not.toBeNull();
});

test("restores focus to the delegated logo trigger when administrator login closes", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  await createApp(root, liveService(), {
    isLive: true,
    adminApi: adminClient(),
  }).start();
  const trigger = root.querySelector<HTMLButtonElement>("[data-admin-trigger]");

  pressAdminLogo(root);
  await vi.waitFor(() => {
    expect(root.querySelector("[data-admin-login-overlay]")).not.toBeNull();
  });
  root.querySelector<HTMLButtonElement>("[data-admin-login-close]")?.click();

  expect(document.activeElement).toBe(trigger);
});
