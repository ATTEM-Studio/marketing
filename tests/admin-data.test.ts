import { expect, test } from "vitest";

import {
  classifyDuplicates,
  createAdminDataStore,
  normalizeBusinessIdentity,
  normalizeIdentity,
} from "../api/_lib/admin-data";
import { createAuthenticAssessment } from "./fixtures/authentic-assessment";

function profile(
  id: string,
  email: string,
  region: string,
  businessName: string,
) {
  return { id, email, region, businessName };
}

function reportingClient(rows: Record<string, Array<Record<string, unknown>>>) {
  return {
    rpc: async () => ({ data: true, error: null }),
    from(table: string) {
      let head = false;
      let from = 0;
      let to = Number.MAX_SAFE_INTEGER;
      const query = {
        select(_columns: string, options?: { head?: boolean }) {
          head = options?.head === true;
          return query;
        },
        eq: () => query,
        gte: () => query,
        lt: () => query,
        in: () => query,
        order: () => query,
        range(start: number, end: number) {
          from = start;
          to = end;
          return query;
        },
        limit(count: number) {
          to = from + count - 1;
          return query;
        },
        maybeSingle: async () => ({
          data: rows[table]?.[0] ?? null,
          error: null,
        }),
        then: <TResult1 = unknown, TResult2 = never>(
          onfulfilled?:
            ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?:
            ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) =>
          Promise.resolve({
            data: head ? null : (rows[table] ?? []).slice(from, to + 1),
            error: null,
            count: head ? (rows[table]?.length ?? 0) : null,
          }).then(onfulfilled, onrejected),
      };
      return query;
    },
  };
}

test("same normalized email wins over matching store and region", () => {
  const groups = classifyDuplicates([
    profile("a", " Owner@Example.com ", "서울 마포구", "우리 식당"),
    profile("b", "owner@example.com", "서울 마포구", "우리식당"),
  ]);

  expect(groups.get("a")?.severity).toBe("high");
  expect(groups.get("b")?.peerIds).toEqual(["a"]);
});

test("same normalized region and business is review severity", () => {
  const groups = classifyDuplicates([
    profile("a", "a@example.com", "서울  마포구", "우리 식당"),
    profile("b", "b@example.com", "서울 마포구", "우리식당"),
  ]);

  expect(groups.get("a")?.severity).toBe("review");
});

test("high severity retains peers found through the review rule", () => {
  const groups = classifyDuplicates([
    profile("a", "owner@example.com", "서울", "우리 식당"),
    profile("b", "owner@example.com", "부산", "다른 식당"),
    profile("c", "other@example.com", "서울", "우리식당"),
  ]);

  expect(groups.get("a")).toEqual({ severity: "high", peerIds: ["b", "c"] });
});

test("identity normalization canonicalizes case and whitespace without treating names as duplicates", () => {
  expect(normalizeIdentity("  Ｏｗｎｅｒ@Example.COM  ")).toBe(
    "owner@example.com",
  );
  expect(normalizeBusinessIdentity("우리- 식당 (본점)")).toBe("우리식당본점");
  expect(
    classifyDuplicates([
      profile("a", "a@example.com", "서울", "서로 다른 가게"),
      profile("b", "b@example.com", "부산", "다른 가게"),
    ]).size,
  ).toBe(0);
});

test("member reporting requests only coaching count and latest timestamp", async () => {
  const calls: Array<{ table: string; columns: string; head: boolean }> = [];
  const rows: Record<string, Array<Record<string, unknown>>> = {
    profiles: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "사장님",
        email: "owner@example.com",
        region: "서울",
        business_name: "우리 식당",
        created_at: "2026-07-28T00:00:00.000Z",
      },
    ],
    consent_events: [],
    assessments: [],
    action_plans: [],
    coaching_sessions: [{ created_at: "2026-07-28T01:00:00.000Z" }],
  };
  const client = {
    rpc: async () => ({ data: true, error: null }),
    from(table: string) {
      let head = false;
      const query = {
        select(columns: string, options?: { head?: boolean }) {
          head = options?.head === true;
          calls.push({ table, columns, head });
          return query;
        },
        eq: () => query,
        gte: () => query,
        lt: () => query,
        in: () => query,
        order: () => query,
        range: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data: rows[table]?.[0] ?? null,
          error: null,
        }),
        then: <TResult1 = unknown, TResult2 = never>(
          onfulfilled?:
            ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?:
            ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) =>
          Promise.resolve({
            data: head ? null : (rows[table] ?? []),
            error: null,
            count: head ? (rows[table]?.length ?? 0) : null,
          }).then(onfulfilled, onrejected),
      };
      return query;
    },
  };

  const detail = await createAdminDataStore(client as never).member(
    "11111111-1111-4111-8111-111111111111",
  );

  expect(detail?.coachingUsage).toEqual({
    count: 1,
    latestAt: "2026-07-28T01:00:00.000Z",
  });
  expect(calls.filter((call) => call.table === "coaching_sessions")).toEqual([
    { table: "coaching_sessions", columns: "id", head: true },
    { table: "coaching_sessions", columns: "created_at", head: false },
  ]);
  expect(calls.some((call) => call.table === "coaching_messages")).toBe(false);
});

test("overview refuses a truncated duplicate scan instead of silently omitting members", async () => {
  const client = {
    rpc: async () => ({ data: true, error: null }),
    from(table: string) {
      let head = false;
      let offset = 0;
      const query = {
        select(_columns: string, options?: { head?: boolean }) {
          head = options?.head === true;
          return query;
        },
        eq: () => query,
        gte: () => query,
        lt: () => query,
        in: () => query,
        order: () => query,
        range(from: number) {
          offset = from;
          return query;
        },
        limit: () => query,
        maybeSingle: async () => ({ data: null, error: null }),
        then: <TResult1 = unknown, TResult2 = never>(
          onfulfilled?:
            ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?:
            ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) => {
          const data =
            table === "profiles" && !head
              ? Array.from({ length: 200 }, (_, index) => ({
                  id: `${offset + index}`,
                  name: "name",
                  email: `${offset + index}@example.com`,
                  region: "서울",
                  business_name: `가게 ${offset + index}`,
                  created_at: "2026-07-28T00:00:00.000Z",
                }))
              : null;
          return Promise.resolve({
            data,
            error: null,
            count: head ? 0 : null,
          }).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
  };

  await expect(
    createAdminDataStore(client as never).overview({
      search: "",
      duplicate: "all",
      page: 1,
      pageSize: 25,
    }),
  ).rejects.toThrow("ADMIN_DATA_LIMIT_EXCEEDED");
});

test("overview returns 30 Korean join days and membership join totals", async () => {
  const now = new Date();
  const rows = {
    profiles: [
      {
        id: "today",
        name: "today",
        email: "today@example.com",
        region: "서울",
        business_name: "오늘",
        created_at: now.toISOString(),
      },
      {
        id: "week",
        name: "week",
        email: "week@example.com",
        region: "서울",
        business_name: "이번 주",
        created_at: new Date(now.getTime() - 6 * 86_400_000).toISOString(),
      },
      {
        id: "month",
        name: "month",
        email: "month@example.com",
        region: "서울",
        business_name: "이번 달",
        created_at: new Date(now.getTime() - 29 * 86_400_000).toISOString(),
      },
      {
        id: "old",
        name: "old",
        email: "old@example.com",
        region: "서울",
        business_name: "지난 달",
        created_at: new Date(now.getTime() - 31 * 86_400_000).toISOString(),
      },
    ],
    assessments: [],
    coaching_sessions: [],
  };

  const overview = await createAdminDataStore(
    reportingClient(rows) as never,
  ).overview({
    search: "",
    duplicate: "all",
    page: 1,
    pageSize: 25,
  });

  expect(overview.totals).toEqual({
    total: 4,
    today: 1,
    last7Days: 2,
    last30Days: 3,
  });
  expect(overview.daily).toHaveLength(30);
  expect(overview.daily.reduce((sum, day) => sum + day.count, 0)).toBe(3);
});

test("member detail selects the newest completed assessment and its verification payload", async () => {
  const completed = createAuthenticAssessment("completed");
  const incomplete = { ...completed, id: "incomplete", diagnosis: {} };
  const detail = await createAdminDataStore(
    reportingClient({
      profiles: [
        {
          id: "member",
          name: "owner",
          email: "owner@example.com",
          region: "서울",
          business_name: "가게",
          created_at: "2026-07-01T00:00:00.000Z",
        },
      ],
      consent_events: [],
      assessments: [
        {
          id: incomplete.id,
          input_data: incomplete.inputs,
          calculated_metrics: incomplete.metrics,
          diagnosis: incomplete.diagnosis,
          created_at: "2026-07-29T00:00:00.000Z",
        },
        {
          id: completed.id,
          input_data: completed.inputs,
          calculated_metrics: completed.metrics,
          diagnosis: completed.diagnosis,
          created_at: completed.createdAt,
        },
      ],
      goals: [
        {
          assessment_id: incomplete.id,
          target_revenue: incomplete.goalTargetRevenue,
        },
        {
          assessment_id: completed.id,
          target_revenue: completed.goalTargetRevenue,
          allocation: completed.inputs.allocation,
          period_start: "2026-07-01",
          period_end: "2026-07-31",
        },
      ],
      action_plans: [
        {
          id: "plan",
          assessment_id: completed.id,
          action_key: "local-discovery",
          action_snapshot: { metric: "exposure" },
          status: "scheduled",
          scheduled_for: "2026-07-30",
          check_in_due_at: "2026-08-06T00:00:00.000Z",
          created_at: "2026-07-20T00:00:00.000Z",
          updated_at: "2026-07-20T00:00:00.000Z",
        },
      ],
      coaching_sessions: [],
    }) as never,
  ).member("member");

  expect(detail?.latestAssessment).toMatchObject({
    id: completed.id,
    inputData: completed.inputs,
    calculatedMetrics: completed.metrics,
    diagnosis: completed.diagnosis,
    goal: { targetRevenue: completed.goalTargetRevenue },
  });
  expect(detail?.assessmentHistory).toMatchObject({
    totalCount: 1,
    entries: [{ id: completed.id }],
  });
  expect(detail?.actionPlans[0]).toMatchObject({
    actionKey: "local-discovery",
    actionSnapshot: { metric: "exposure" },
    checkInDueAt: "2026-08-06T00:00:00.000Z",
  });
});

test("member detail labels an intentionally bounded duplicate peer list", async () => {
  const memberId = "member";
  const profiles = Array.from({ length: 52 }, (_, index) => ({
    id: index === 0 ? memberId : `peer-${index}`,
    name: `name-${index}`,
    email: "same@example.com",
    region: "서울",
    business_name: `가게-${index}`,
    created_at: "2026-07-01T00:00:00.000Z",
  }));
  const detail = await createAdminDataStore(
    reportingClient({
      profiles,
      consent_events: [],
      assessments: [],
      goals: [],
      action_plans: [],
      coaching_sessions: [],
    }) as never,
  ).member(memberId);

  expect(detail?.duplicatePeers).toMatchObject({
    totalCount: 51,
    truncated: true,
  });
  expect(detail?.duplicatePeers.members).toHaveLength(50);
});

test("member detail rejects a bounded assessment history overflow", async () => {
  const client = overflowingMemberClient("assessments");

  await expect(
    createAdminDataStore(client as never).member("member"),
  ).rejects.toThrow("ADMIN_DATA_LIMIT_EXCEEDED");
});

test("member detail rejects a bounded action plan history overflow", async () => {
  const client = overflowingMemberClient("action_plans");

  await expect(
    createAdminDataStore(client as never).member("member"),
  ).rejects.toThrow("ADMIN_DATA_LIMIT_EXCEEDED");
});

function overflowingMemberClient(
  overflowTable: "assessments" | "action_plans",
) {
  return {
    rpc: async () => ({ data: true, error: null }),
    from(table: string) {
      let head = false;
      let offset = 0;
      const query = {
        select(_columns: string, options?: { head?: boolean }) {
          head = options?.head === true;
          return query;
        },
        eq: () => query,
        gte: () => query,
        lt: () => query,
        in: () => query,
        order: () => query,
        range(from: number) {
          offset = from;
          return query;
        },
        limit: () => query,
        maybeSingle: async () => ({
          data:
            table === "profiles"
              ? {
                  id: "member",
                  name: "owner",
                  email: "owner@example.com",
                  region: "서울",
                  business_name: "가게",
                  created_at: "2026-07-01T00:00:00.000Z",
                }
              : null,
          error: null,
        }),
        then: <TResult1 = unknown, TResult2 = never>(
          onfulfilled?:
            ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?:
            ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) => {
          const data =
            table === overflowTable && !head
              ? Array.from({ length: 200 }, (_, index) => ({
                  id: `${table}-${offset + index}`,
                  created_at: "2026-07-01T00:00:00.000Z",
                }))
              : table === "profiles" && !head
                ? [
                    {
                      id: "member",
                      name: "owner",
                      email: "owner@example.com",
                      region: "서울",
                      business_name: "가게",
                      created_at: "2026-07-01T00:00:00.000Z",
                    },
                  ]
                : [];
          return Promise.resolve({
            data,
            error: null,
            count: head ? 1 : null,
          }).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
  };
}
