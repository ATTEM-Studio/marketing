import { expect, test } from "vitest";

import {
  classifyDuplicates,
  createAdminDataStore,
  normalizeBusinessIdentity,
  normalizeIdentity,
} from "../api/_lib/admin-data";

function profile(
  id: string,
  email: string,
  region: string,
  businessName: string,
) {
  return { id, email, region, businessName };
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
