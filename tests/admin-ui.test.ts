import { beforeEach, expect, test, vi } from "vitest";
import { AdminApiError } from "../src/admin/api";
import type {
  AdminMemberDetail,
  AdminOverview,
  AdminOverviewQuery,
} from "../src/admin/types";
import { renderAdminDashboard } from "../src/ui/admin-dashboard";
import { renderAdminLogin } from "../src/ui/admin-login";

const MEMBER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";

const overviewFixture: AdminOverview = {
  totals: {
    total: 128,
    today: 3,
    last7Days: 18,
    last30Days: 61,
  },
  daily: [
    { date: "2026-07-28", count: 2 },
    { date: "2026-07-29", count: 3 },
  ],
  members: [
    {
      id: MEMBER_ID,
      name: "김대표",
      email: "kim@example.com",
      region: "서울 마포구",
      businessName: "김대표 식당",
      joinedAt: "2026-07-28T15:30:00.000Z",
      duplicate: { severity: "high", peerCount: 2 },
    },
  ],
  page: 1,
  pageSize: 25,
  totalRows: 40,
};

const detailFixture: AdminMemberDetail = {
  profile: {
    id: MEMBER_ID,
    name: "김대표",
    email: "kim@example.com",
    region: "서울 마포구",
    businessName: "김대표 식당",
    joinedAt: "2026-07-28T15:30:00.000Z",
    consents: { serviceTerms: true, marketing: false },
  },
  duplicatePeers: {
    members: [
      {
        id: OTHER_ID,
        name: "김대표 2",
        email: "kim@example.com",
        region: "서울 마포구",
        businessName: "김대표 식당",
        joinedAt: "2026-07-27T15:30:00.000Z",
        duplicate: { severity: "high", peerCount: 1 },
      },
    ],
    totalCount: 1,
    truncated: false,
  },
  latestAssessment: {
    id: "assessment-1",
    createdAt: "2026-07-28T00:00:00.000Z",
    inputData: {
      revenue: {
        averageMonthlyRevenue: 30_000_000,
        targetMonthlyRevenue: 40_000_000,
        averageOrderValue: 25_000,
        operatingDays: 20,
        monthlyCustomerCount: 1200,
        monthlyCustomerCountStatus: "exact",
      },
      primaryConcern: "customers",
      capacity: "yes",
      returningDataStatus: "known",
      hasConsentDb: true,
      canChangeMenu: true,
      adsRunning: false,
      advertising: {},
      restaurant: {},
      hiddenConversation: "coaching message payload",
    },
    calculatedMetrics: {
      shortfallRevenue: 10_000_000,
      maxNewCustomers: 400,
      maxNewCustomersPerDay: 20,
      monthlyCustomerCount: 1200,
      customerCountSource: "actual",
      targetReached: false,
      advertising: {},
      restaurant: {},
    },
    diagnosis: {
      bottleneck: {
        key: "exposure",
        status: "known",
        changeRate: 0.1,
        reason: "노출이 부족합니다.",
      },
      actionKey: "local-discovery",
      effectiveCapacity: "yes",
    },
    goal: {
      targetRevenue: 40_000_000,
      allocation: {
        newCustomerRevenue: 5_000_000,
        returningCustomerRevenue: 3_000_000,
        averageOrderValueRevenue: 2_000_000,
      },
      periodStart: "2026-07-28",
      periodEnd: "2026-08-28",
      createdAt: "2026-07-28T00:00:00.000Z",
    },
  },
  assessmentHistory: {
    entries: [{ id: "assessment-1", createdAt: "2026-07-28T00:00:00.000Z" }],
    totalCount: 1,
  },
  actionPlans: [],
  coachingUsage: { count: 1, latestAt: "2026-07-28T03:00:00.000Z" },
};

function createApi(
  options: {
    overview?: (query: AdminOverviewQuery) => Promise<AdminOverview>;
    member?: (id: string) => Promise<AdminMemberDetail>;
  } = {},
) {
  return {
    overview: vi.fn(
      options.overview ?? (async () => structuredClone(overviewFixture)),
    ),
    member: vi.fn(
      options.member ?? (async () => structuredClone(detailFixture)),
    ),
    logout: vi.fn(async () => undefined),
  };
}

function getRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing app root");
  return root;
}

function callbacks(root: HTMLElement) {
  return {
    onUnauthorized() {
      renderAdminLogin(
        root,
        { login: vi.fn(async () => undefined) },
        { onAuthenticated: vi.fn(), onClose: vi.fn() },
      );
    },
    onLogout: vi.fn(),
  };
}

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

beforeEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '<div id="app"></div>';
});

test("shows four totals, an accessible 30-day trend, newest members, and duplicate badges", async () => {
  const root = getRoot();
  await renderAdminDashboard(root, createApi(), callbacks(root));

  expect(root.querySelectorAll("[data-admin-summary-card]")).toHaveLength(4);
  expect(root.querySelector("[data-total-members]")?.textContent).toContain(
    "128",
  );
  expect(root.querySelector("[data-period='today']")?.textContent).toContain(
    "오늘",
  );
  expect(
    root.querySelector("[data-admin-trend]")?.getAttribute("aria-label"),
  ).toContain("최근 30일");
  expect(root.querySelector("[data-admin-trend]")?.textContent).toContain(
    "2026년 7월 29일",
  );
  expect(root.textContent).toContain("김대표");
  expect(root.textContent).toContain("중복 가능성 높음");
  expect(root.textContent).toContain("2026년 7월 29일 00:30");
  expect(root.textContent).not.toContain("2026-07-28T15:30:00.000Z");
});

test("exposes every trend date and count outside the visual role", async () => {
  const root = getRoot();
  await renderAdminDashboard(root, createApi(), callbacks(root));

  const visual = root.querySelector<HTMLElement>(
    "[role='img'][aria-label*='최근 30일']",
  );
  const table = root.querySelector<HTMLTableElement>(
    "[data-admin-trend-values]",
  );
  expect(visual).not.toBeNull();
  expect(table).not.toBeNull();
  expect(visual?.contains(table)).toBe(false);
  expect(table?.rows).toHaveLength(3);
  expect(table?.textContent).toContain("2026년 7월 28일");
  expect(table?.textContent).toContain("2명");
  expect(table?.textContent).toContain("2026년 7월 29일");
  expect(table?.textContent).toContain("3명");
});

test("debounces search for 300ms and protects the newest result from stale requests", async () => {
  vi.useFakeTimers();
  const root = getRoot();
  let resolveFirst: ((overview: AdminOverview) => void) | undefined;
  const first = new Promise<AdminOverview>((resolve) => {
    resolveFirst = resolve;
  });
  const api = createApi({
    overview: async (query) => {
      if (!query.search) return structuredClone(overviewFixture);
      if (query.search === "마포") {
        return first;
      }
      return {
        ...structuredClone(overviewFixture),
        members: [
          {
            ...structuredClone(overviewFixture.members[0]!),
            name: "최신 결과",
          },
        ],
      };
    },
  });
  await renderAdminDashboard(root, api, callbacks(root));
  const search = root.querySelector<HTMLInputElement>("[data-admin-search]");
  if (!search) throw new Error("missing search");

  search.value = "마포";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  vi.advanceTimersByTime(299);
  expect(api.overview).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  await flush();
  expect(api.overview).toHaveBeenLastCalledWith(
    expect.objectContaining({ search: "마포" }),
  );

  search.value = "서울";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  vi.advanceTimersByTime(300);
  await flush();
  expect(root.textContent).toContain("최신 결과");
  resolveFirst?.({
    ...structuredClone(overviewFixture),
    members: [
      {
        ...structuredClone(overviewFixture.members[0]!),
        name: "오래된 결과",
      },
    ],
  });
  await flush();

  expect(root.textContent).toContain("최신 결과");
  expect(root.textContent).not.toContain("오래된 결과");
});

test("applies duplicate filters and pages through server queries", async () => {
  const root = getRoot();
  const api = createApi();
  await renderAdminDashboard(root, api, callbacks(root));

  root
    .querySelector<HTMLButtonElement>("[data-duplicate-filter='review']")
    ?.click();
  await flush();
  expect(api.overview).toHaveBeenLastCalledWith(
    expect.objectContaining({ duplicate: "review", page: 1 }),
  );

  root.querySelector<HTMLButtonElement>("[data-admin-next-page]")?.click();
  await flush();
  expect(api.overview).toHaveBeenLastCalledWith(
    expect.objectContaining({ duplicate: "review", page: 2 }),
  );
});

test("shows an explicit empty result instead of an empty table", async () => {
  const root = getRoot();
  await renderAdminDashboard(
    root,
    createApi({
      overview: async () => ({
        ...structuredClone(overviewFixture),
        members: [],
        totalRows: 0,
      }),
    }),
    callbacks(root),
  );

  expect(root.textContent).toContain("조건에 맞는 회원이 없습니다.");
  expect(root.querySelector("[data-admin-list-retry]")).toBeNull();
});

test("keeps overview failures scoped to the list and retries them", async () => {
  const root = getRoot();
  let attempts = 0;
  const api = createApi({
    overview: async () => {
      attempts += 1;
      if (attempts === 1) throw new AdminApiError("network");
      return structuredClone(overviewFixture);
    },
  });
  await renderAdminDashboard(root, api, callbacks(root));

  expect(root.textContent).toContain("회원 목록을 불러오지 못했습니다.");
  root.querySelector<HTMLButtonElement>("[data-admin-list-retry]")?.click();
  await flush();

  expect(root.textContent).toContain("김대표");
  expect(api.overview).toHaveBeenCalledTimes(2);
});

test("opens a labelled lazy member detail drawer with exactly six safe label sections", async () => {
  const root = getRoot();
  const api = createApi({
    overview: async () => ({
      ...structuredClone(overviewFixture),
      members: [
        {
          ...structuredClone(overviewFixture.members[0]!),
          name: '<img src=x onerror="alert(1)">',
        },
      ],
    }),
  });
  await renderAdminDashboard(root, api, callbacks(root));

  expect(api.member).not.toHaveBeenCalled();
  root
    .querySelector<HTMLButtonElement>(`[data-member-id='${MEMBER_ID}']`)
    ?.click();
  await flush();

  const dialog = root.querySelector<HTMLElement>("[role='dialog']");
  expect(dialog?.getAttribute("aria-label")).toBe("회원 상세 정보");
  expect(dialog?.querySelectorAll("[data-detail-section]")).toHaveLength(6);
  expect(dialog?.textContent).toContain("최근 월평균 매출");
  expect(dialog?.textContent).not.toContain("coaching message payload");
  expect(root.querySelector("img")).toBeNull();
  expect(api.member).toHaveBeenCalledWith(MEMBER_ID);
});

test("formats duplicate-member dates in Korean time after crossing midnight", async () => {
  const root = getRoot();
  await renderAdminDashboard(root, createApi(), callbacks(root));

  root
    .querySelector<HTMLButtonElement>(`[data-member-id='${MEMBER_ID}']`)
    ?.click();
  await flush();

  const duplicatePeers = root.querySelector<HTMLElement>(
    ".admin-duplicate-peers",
  );
  expect(duplicatePeers?.textContent).toContain("2026년 7월 28일 00:30");
  expect(duplicatePeers?.textContent).not.toContain("2026-07-27T15:30:00.000Z");
});

test("keeps the member list visible when detail loading fails and retries only detail", async () => {
  const root = getRoot();
  let attempts = 0;
  const api = createApi({
    member: async () => {
      attempts += 1;
      if (attempts === 1) throw new AdminApiError("network");
      return structuredClone(detailFixture);
    },
  });
  await renderAdminDashboard(root, api, callbacks(root));
  root
    .querySelector<HTMLButtonElement>(`[data-member-id='${MEMBER_ID}']`)
    ?.click();
  await flush();

  expect(root.textContent).toContain("김대표 식당");
  expect(root.textContent).toContain("회원 상세 정보를 불러오지 못했습니다.");
  root.querySelector<HTMLButtonElement>("[data-admin-detail-retry]")?.click();
  await flush();

  expect(root.querySelectorAll("[data-detail-section]")).toHaveLength(6);
  expect(api.overview).toHaveBeenCalledTimes(1);
  expect(api.member).toHaveBeenCalledTimes(2);
});

test("clears all member PII and returns to login after a 401", async () => {
  const root = getRoot();
  const api = createApi({
    member: async () => {
      throw new AdminApiError("unauthorized");
    },
  });
  await renderAdminDashboard(root, api, callbacks(root));
  root
    .querySelector<HTMLButtonElement>(`[data-member-id='${MEMBER_ID}']`)
    ?.click();
  await flush();

  expect(root.textContent).not.toContain("kim@example.com");
  expect(root.textContent).not.toContain("김대표 식당");
  expect(
    root.querySelector("[role='dialog']")?.getAttribute("aria-label"),
  ).toBe("관리자 로그인");
});

test("lets a closed stale detail 401 expire the active dashboard", async () => {
  const root = getRoot();
  let rejectDetail: ((error: unknown) => void) | undefined;
  const api = createApi({
    member: () =>
      new Promise<AdminMemberDetail>((_resolve, reject) => {
        rejectDetail = reject;
      }),
  });
  await renderAdminDashboard(root, api, callbacks(root));
  root
    .querySelector<HTMLButtonElement>(`[data-member-id='${MEMBER_ID}']`)
    ?.click();
  root.querySelector<HTMLButtonElement>("[data-admin-detail-close]")?.click();

  rejectDetail?.(new AdminApiError("unauthorized"));
  await flush();

  expect(root.textContent).not.toContain("kim@example.com");
  expect(
    root.querySelector("[role='dialog']")?.getAttribute("aria-label"),
  ).toBe("관리자 로그인");
});

test("lets a superseded overview 401 expire the active dashboard", async () => {
  vi.useFakeTimers();
  const root = getRoot();
  let rejectStale: ((error: unknown) => void) | undefined;
  const api = createApi({
    overview: async (query) => {
      if (!query.search) return structuredClone(overviewFixture);
      if (query.search === "첫 검색") {
        return new Promise<AdminOverview>((_resolve, reject) => {
          rejectStale = reject;
        });
      }
      return structuredClone(overviewFixture);
    },
  });
  await renderAdminDashboard(root, api, callbacks(root));
  const search = root.querySelector<HTMLInputElement>("[data-admin-search]");
  if (!search) throw new Error("missing search");
  search.value = "첫 검색";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  vi.advanceTimersByTime(300);
  await flush();
  search.value = "둘째 검색";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  vi.advanceTimersByTime(300);
  await flush();

  rejectStale?.(new AdminApiError("unauthorized"));
  await flush();

  expect(root.textContent).not.toContain("kim@example.com");
  expect(root.querySelector("[data-admin-login-overlay]")).not.toBeNull();
});

test("closes detail on Escape and restores focus to the selected member", async () => {
  const root = getRoot();
  await renderAdminDashboard(root, createApi(), callbacks(root));
  const member = root.querySelector<HTMLButtonElement>(
    `[data-member-id='${MEMBER_ID}']`,
  );
  member?.focus();
  member?.click();
  await flush();

  root
    .querySelector<HTMLElement>("[role='dialog']")
    ?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

  expect(root.querySelector("[role='dialog']")).toBeNull();
  expect(document.activeElement).toBe(member);
});

test("restores focus by member ID after an overview refresh replaces the row", async () => {
  const root = getRoot();
  await renderAdminDashboard(root, createApi(), callbacks(root));
  const original = root.querySelector<HTMLButtonElement>(
    `[data-member-id='${MEMBER_ID}']`,
  );
  original?.click();
  await flush();
  root
    .querySelector<HTMLButtonElement>("[data-duplicate-filter='review']")
    ?.click();
  await flush();
  const replacement = root.querySelector<HTMLButtonElement>(
    `[data-member-id='${MEMBER_ID}']`,
  );
  expect(replacement).not.toBe(original);

  root.querySelector<HTMLButtonElement>("[data-admin-detail-close]")?.click();

  expect(document.activeElement).toBe(replacement);
});

test("moves focus to the dashboard heading when refresh removes the selected member", async () => {
  const root = getRoot();
  let overviewCalls = 0;
  const api = createApi({
    overview: async () => {
      overviewCalls += 1;
      if (overviewCalls === 1) return structuredClone(overviewFixture);
      return {
        ...structuredClone(overviewFixture),
        members: [],
        totalRows: 0,
      };
    },
  });
  await renderAdminDashboard(root, api, callbacks(root));
  root
    .querySelector<HTMLButtonElement>(`[data-member-id='${MEMBER_ID}']`)
    ?.click();
  await flush();
  root
    .querySelector<HTMLButtonElement>("[data-duplicate-filter='review']")
    ?.click();
  await flush();
  expect(root.querySelector(`[data-member-id='${MEMBER_ID}']`)).toBeNull();

  root.querySelector<HTMLButtonElement>("[data-admin-detail-close]")?.click();

  expect(root.querySelector("[role='dialog']")).toBeNull();
  expect(document.activeElement).toBe(
    root.querySelector("[data-admin-dashboard-heading]"),
  );
});

test("logs out through the API before notifying the app", async () => {
  const root = getRoot();
  const api = createApi();
  const handlers = callbacks(root);
  await renderAdminDashboard(root, api, handlers);

  root.querySelector<HTMLButtonElement>("[data-admin-logout]")?.click();
  await flush();

  expect(api.logout).toHaveBeenCalledOnce();
  expect(handlers.onLogout).toHaveBeenCalledOnce();
});

test("cancels a queued debounced search as soon as logout begins", async () => {
  vi.useFakeTimers();
  const root = getRoot();
  const api = createApi();
  await renderAdminDashboard(root, api, callbacks(root));
  const search = root.querySelector<HTMLInputElement>("[data-admin-search]");
  if (!search) throw new Error("missing search");
  search.value = "로그아웃 뒤 실행되면 안 됨";
  search.dispatchEvent(new Event("input", { bubbles: true }));

  root.querySelector<HTMLButtonElement>("[data-admin-logout]")?.click();
  vi.advanceTimersByTime(300);
  await flush();

  expect(api.overview).toHaveBeenCalledTimes(1);
});
