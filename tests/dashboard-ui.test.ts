import { expect, test, vi } from "vitest";
import { createApp } from "../src/app";
import { checkInDueDate, renderResult } from "../src/ui/result";
import type { ActionPlanRecord, AppService } from "../src/services/contracts";
import { renderDashboard } from "../src/ui/dashboard";

test("shows the next action and saves before-after results", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const planned: ActionPlanRecord = {
    id: "plan-1",
    assessmentId: "assessment-1",
    actionKey: "local-discovery",
    metric: "길찾기 수",
    checkInDueAt: "2026-07-26",
    status: "planned",
    beforeValue: null,
    afterValue: null,
    note: null,
  };
  const saved: string[] = [];
  const fake = {
    getSession: vi.fn(async () => ({
      mode: "demo" as const,
      profile: {
        id: "demo",
        name: "샘플 사장님",
        email: "demo@example.invalid",
        region: "샘플",
        businessName: "샘플 식당",
      },
    })),
    registerBuyer: vi.fn(),
    sendLoginLink: vi.fn(),
    finalizeRegistration: vi.fn(),
    signOut: vi.fn(),
    saveAssessment: vi.fn(),
    getLatestAssessment: vi.fn(async () => ({
      id: "assessment-1",
      inputs: { averageMonthlyRevenue: 30_000_000 },
      metrics: { maxNewCustomers: 400 },
      diagnosis: {},
      createdAt: "2026-07-19T00:00:00.000Z",
    })),
    saveActionPlan: vi.fn(),
    listActionPlans: vi.fn(async () => [planned]),
    completeActionPlan: vi.fn(
      async (_id: string, before: string, after: string, note: string) => {
        saved.push(before, after, note);
        return {
          ...planned,
          status: "completed" as const,
          beforeValue: before,
          afterValue: after,
          note,
        };
      },
    ),
  } as unknown as AppService;

  await renderDashboard(root, await fake.getSession(), fake, vi.fn());
  expect(document.body.textContent).toContain("오늘 할 행동 찾기");
  expect(document.body.textContent).toContain("결과 확인 예정");
  document
    .querySelector<HTMLButtonElement>("[data-complete-plan='plan-1']")
    ?.click();
  const set = (name: string, value: string) => {
    const input = document.querySelector<
      HTMLInputElement | HTMLTextAreaElement
    >(`[name='${name}']`);
    if (!input) throw new Error(`missing ${name}`);
    input.value = value;
  };
  set("beforeValue", "길찾기 7회");
  set("afterValue", "길찾기 12회");
  set("note", "대표사진 변경");
  document
    .querySelector<HTMLFormElement>("[data-checkin-form]")
    ?.requestSubmit();
  await Promise.resolve();
  expect(saved).toEqual(["길찾기 7회", "길찾기 12회", "대표사진 변경"]);
  expect(document.body.textContent).toContain("결과 기록 완료");
  expect(window.location.href).not.toContain("30000000");
});

test("schedules the one result action seven calendar days after assessment", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const saveAction = vi.fn(async () => undefined);

  renderResult(
    root,
    {
      metrics: {
        shortfallRevenue: 10_000_000,
        maxNewCustomers: 400,
        maxNewCustomersPerDay: 20,
        monthlyCustomerCount: 1200,
        customerCountSource: "estimated",
        targetReached: false,
      },
      bottleneck: {
        key: null,
        status: "insufficient",
        changeRate: null,
        reason: "수치가 부족합니다.",
      },
      action: {
        key: "local-discovery",
        title: "대표 사진을 확인해요",
        reason: "지금 할 수 있어요.",
        steps: ["사진을 봐요", "한 장을 바꿔요", "길찾기를 적어요"],
        metric: "길찾기 수",
        avoid: "광고비를 먼저 늘리지 마세요.",
        minutes: 15,
        coachingKey: "revenue-before-ranking",
      },
    },
    { onSaveAction: saveAction },
  );

  expect(checkInDueDate("2026-07-19T23:00:00.000-09:00")).toBe("2026-07-27");
  root.querySelector<HTMLButtonElement>("[data-save-action]")?.click();
  await Promise.resolve();
  expect(saveAction).toHaveBeenCalledTimes(1);
});

test("keeps written check-in values after a save failure", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const planned: ActionPlanRecord = {
    id: "plan-1",
    assessmentId: "assessment-1",
    actionKey: "local-discovery",
    metric: "길찾기 수",
    checkInDueAt: "2026-07-26",
    status: "planned",
    beforeValue: null,
    afterValue: null,
    note: null,
  };
  const failing = {
    getLatestAssessment: vi.fn(async () => null),
    listActionPlans: vi.fn(async () => [planned]),
    completeActionPlan: vi.fn(async () => {
      throw new Error("network");
    }),
    signOut: vi.fn(),
  } as unknown as AppService;

  await renderDashboard(
    root,
    { mode: "demo", profile: null },
    failing,
    vi.fn(),
  );
  root.querySelector<HTMLButtonElement>("[data-complete-plan]")?.click();
  const before = root.querySelector<HTMLInputElement>("[name='beforeValue']");
  const after = root.querySelector<HTMLInputElement>("[name='afterValue']");
  const note = root.querySelector<HTMLTextAreaElement>("[name='note']");
  if (!before || !after || !note) throw new Error("missing check-in fields");
  before.value = "길찾기 7회";
  after.value = "길찾기 12회";
  note.value = "대표사진 변경";
  root.querySelector<HTMLFormElement>("[data-checkin-form]")?.requestSubmit();
  await Promise.resolve();

  expect(root.textContent).toContain("기록하지 못했습니다");
  expect(
    root.querySelector<HTMLInputElement>("[name='beforeValue']")?.value,
  ).toBe("길찾기 7회");
  expect(
    root.querySelector<HTMLInputElement>("[name='afterValue']")?.value,
  ).toBe("길찾기 12회");
  expect(root.querySelector<HTMLTextAreaElement>("[name='note']")?.value).toBe(
    "대표사진 변경",
  );
});

test("keeps live sign-out available when dashboard data cannot load", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const signOut = vi.fn(async () => undefined);
  const failing = {
    getLatestAssessment: vi.fn(async () => {
      throw new Error("network");
    }),
    listActionPlans: vi.fn(async () => []),
    signOut,
  } as unknown as AppService;

  await renderDashboard(
    root,
    {
      mode: "live",
      profile: {
        id: "buyer-1",
        name: "구매자",
        email: "buyer@example.com",
        region: "서울",
        businessName: "구매자 식당",
      },
    },
    failing,
    vi.fn(),
  );
  root.querySelector<HTMLButtonElement>("[data-sign-out]")?.click();
  await Promise.resolve();

  expect(signOut).toHaveBeenCalledTimes(1);
});

test("shows the business summary, nearest plan, and completed history", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const plans: ActionPlanRecord[] = [
    {
      id: "late",
      assessmentId: "assessment-1",
      actionKey: "local-discovery",
      metric: "전화 수",
      checkInDueAt: "2026-07-30",
      status: "planned",
      beforeValue: null,
      afterValue: null,
      note: null,
    },
    {
      id: "early",
      assessmentId: "assessment-1",
      actionKey: "local-discovery",
      metric: "길찾기 수",
      checkInDueAt: "2026-07-26",
      status: "planned",
      beforeValue: null,
      afterValue: null,
      note: null,
    },
    {
      id: "done",
      assessmentId: "assessment-1",
      actionKey: "local-discovery",
      metric: "예약 수",
      checkInDueAt: "2026-07-20",
      status: "completed",
      beforeValue: "2회",
      afterValue: "5회",
      note: "사진을 바꿨어요",
    },
  ];
  const fake = {
    getLatestAssessment: vi.fn(async () => ({
      id: "assessment-1",
      inputs: { revenue: { targetMonthlyRevenue: 40_000_000 } },
      metrics: { maxNewCustomers: 400 },
      diagnosis: {},
      createdAt: "2026-07-19T00:00:00.000Z",
    })),
    listActionPlans: vi.fn(async () => plans),
    signOut: vi.fn(),
  } as unknown as AppService;

  await renderDashboard(
    root,
    {
      mode: "demo",
      profile: {
        id: "demo",
        name: "샘플 사장님",
        email: "demo@example.invalid",
        region: "서울",
        businessName: "샘플 식당",
      },
    },
    fake,
    vi.fn(),
  );

  expect(root.textContent).toContain("샘플 식당");
  expect(root.textContent).toContain("40,000,000원");
  expect(root.textContent).toContain("최대 400명");
  expect(root.querySelector(".current-action")?.textContent).toContain(
    "길찾기 수",
  );
  expect(root.querySelector(".upcoming-actions")?.textContent).toContain(
    "전화 수",
  );
  expect(root.textContent).toContain("실행 전 2회 · 실행 후 5회");
  expect(root.textContent).toContain("사진을 바꿨어요");
});

test("uses gentle empty states and blocks an incomplete check-in", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const empty = {
    getLatestAssessment: vi.fn(async () => null),
    listActionPlans: vi.fn(async () => []),
    signOut: vi.fn(),
  } as unknown as AppService;
  await renderDashboard(root, { mode: "demo", profile: null }, empty, vi.fn());
  expect(root.textContent).toContain("아직 진단한 내용이 없어요");
  expect(root.textContent).toContain("오늘 할 행동을 정해 볼까요");
  expect(root.textContent).toContain("아직 기록이 없습니다");

  const planned: ActionPlanRecord = {
    id: "plan-1",
    assessmentId: "assessment-1",
    actionKey: "local-discovery",
    metric: "길찾기 수",
    checkInDueAt: "2026-07-26",
    status: "planned",
    beforeValue: null,
    afterValue: null,
    note: null,
  };
  const save = vi.fn();
  const withPlan = {
    getLatestAssessment: vi.fn(async () => null),
    listActionPlans: vi.fn(async () => [planned]),
    completeActionPlan: save,
    signOut: vi.fn(),
  } as unknown as AppService;
  await renderDashboard(
    root,
    { mode: "demo", profile: null },
    withPlan,
    vi.fn(),
  );
  root.querySelector<HTMLButtonElement>("[data-complete-plan]")?.click();
  root.querySelector<HTMLFormElement>("[data-checkin-form]")?.requestSubmit();

  expect(save).not.toHaveBeenCalled();
  expect(
    root.querySelector("[name='beforeValue']")?.getAttribute("aria-invalid"),
  ).toBe("true");
});

test("saves the result action through AppService with its assessment date", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const saveActionPlan = vi.fn(async () => ({
    id: "plan-1",
    assessmentId: "assessment-1",
    actionKey: "local-discovery" as const,
    metric: "길찾기 수",
    checkInDueAt: "2026-07-26",
    status: "planned" as const,
    beforeValue: null,
    afterValue: null,
    note: null,
  }));
  const fake: AppService = {
    getSession: vi.fn(async () => ({ mode: "demo" as const, profile: null })),
    registerBuyer: vi.fn(async () => undefined),
    sendLoginLink: vi.fn(async () => undefined),
    finalizeRegistration: vi.fn(async () => ({
      mode: "demo" as const,
      profile: null,
    })),
    signOut: vi.fn(async () => undefined),
    saveAssessment: vi.fn(async (snapshot) => ({
      ...snapshot,
      id: "assessment-1",
      createdAt: "2026-07-19T00:00:00.000Z",
    })),
    getLatestAssessment: vi.fn(async () => null),
    saveActionPlan,
    listActionPlans: vi.fn(async () => []),
    completeActionPlan: vi.fn(async () => {
      throw new Error("unused");
    }),
  };
  await createApp(root, fake).start();
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
  set("averageMonthlyRevenue", "30000000");
  set("targetMonthlyRevenue", "40000000");
  set("averageOrderValue", "25000");
  set("operatingDays", "20");
  root.querySelector<HTMLButtonElement>("[data-next-step]")?.click();
  choose("monthlyCustomerCountStatus", "unknown");
  choose("primaryConcern", "unknown");
  root.querySelector<HTMLButtonElement>("[data-next-step]")?.click();
  choose("capacity", "yes");
  choose("returningDataStatus", "unknown");
  choose("hasConsentDb", "false");
  choose("canChangeMenu", "true");
  choose("adsRunning", "false");
  root.querySelector<HTMLButtonElement>("[data-submit-diagnosis]")?.click();
  await Promise.resolve();
  await Promise.resolve();
  root.querySelector<HTMLButtonElement>("[data-save-action]")?.click();
  await Promise.resolve();
  await Promise.resolve();

  expect(saveActionPlan).toHaveBeenCalledWith({
    assessmentId: "assessment-1",
    actionKey: "local-discovery",
    metric: "7일간 전화·길찾기·예약 수",
    checkInDueAt: "2026-07-26",
  });
});
