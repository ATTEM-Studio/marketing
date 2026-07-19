import { beforeEach, expect, test, vi } from "vitest";
import { AuthSessionMissingError } from "@supabase/supabase-js";

type MockClient = {
  auth: Record<
    "getUser" | "signInAnonymously" | "signOut",
    ReturnType<typeof vi.fn>
  >;
  functions: Record<"invoke", ReturnType<typeof vi.fn>>;
  rpc: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
};

const mocked = vi.hoisted(() => ({
  client: {} as MockClient,
  createClient: vi.fn(),
}));

vi.mock("../src/services/supabase-client", () => ({
  createSupabaseClient: mocked.createClient,
}));

import {
  createSupabaseService,
  koreaBusinessMonthPeriod,
} from "../src/services/supabase-service";

const assessment = {
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  maybeSingle: vi.fn(),
};
const stores = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
};
const plans = {
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
};
const profiles = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  assessment.select.mockReturnValue(assessment);
  assessment.eq.mockReturnValue(assessment);
  assessment.order.mockReturnValue(assessment);
  assessment.limit.mockReturnValue(assessment);
  assessment.maybeSingle.mockResolvedValue({
    data: {
      id: "assessment-1",
      input_data: {},
      calculated_metrics: {},
      diagnosis: {},
      created_at: "2026-07-19T00:00:00.000Z",
    },
    error: null,
  });
  stores.select.mockReturnValue(stores);
  stores.eq.mockReturnValue(stores);
  stores.maybeSingle.mockResolvedValue({
    data: { id: "store-1" },
    error: null,
  });
  plans.select.mockReturnValue(plans);
  plans.eq.mockReturnValue(plans);
  plans.order.mockReturnValue(plans);
  plans.limit.mockReturnValue(plans);
  profiles.select.mockReturnValue(profiles);
  profiles.eq.mockReturnValue(profiles);
  profiles.maybeSingle.mockResolvedValue({
    data: {
      id: "user-1",
      name: "Buyer",
      email: "buyer@example.com",
      region: "Seoul",
      business_name: "Buyer Store",
    },
    error: null,
  });
  mocked.client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1", is_anonymous: true } },
        error: null,
      })),
      signInAnonymously: vi.fn(async () => ({
        data: { user: { id: "user-1", is_anonymous: true } },
        error: null,
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    functions: {
      invoke: vi.fn(async () => ({ data: { active: true }, error: null })),
    },
    rpc: vi.fn(async () => ({ error: null })),
    from: vi.fn((table: string) => {
      if (table === "profiles") return profiles;
      if (table === "stores") return stores;
      if (table === "action_plans") return plans;
      return assessment;
    }),
  };
  mocked.createClient.mockReturnValue(mocked.client);
});

test("creates an anonymous session, activates the invite, and returns the live profile", async () => {
  mocked.client.auth.getUser = vi
    .fn()
    .mockResolvedValueOnce({
      data: { user: null },
      error: new AuthSessionMissingError(),
    })
    .mockResolvedValue({
      data: { user: { id: "user-1", is_anonymous: true } },
      error: null,
    });
  const service = createSupabaseService("https://example.supabase.co", "anon");

  await expect(
    service.registerBuyer({
      name: "Buyer",
      email: "buyer@example.com",
      region: "Seoul",
      businessName: "Buyer Store",
      inviteCode: "DOITNOW",
      serviceConsent: true,
      marketingConsent: false,
    }),
  ).resolves.toMatchObject({
    mode: "live",
    profile: { id: "user-1", email: "buyer@example.com" },
  });

  expect(mocked.client.auth.signInAnonymously).toHaveBeenCalledTimes(1);
  expect(mocked.client.functions.invoke).toHaveBeenCalledWith(
    "redeem-invite",
    expect.objectContaining({
      body: expect.objectContaining({ inviteCode: "DOITNOW" }),
    }),
  );
});

test("clears the anonymous session when invite activation fails", async () => {
  mocked.client.auth.getUser = vi.fn(async () => ({
    data: { user: null },
    error: null,
  }));
  mocked.client.functions.invoke = vi.fn(async () => ({
    data: null,
    error: new Error("invalid"),
  }));
  const service = createSupabaseService("https://example.supabase.co", "anon");

  await expect(
    service.registerBuyer({
      name: "Buyer",
      email: "buyer@example.com",
      region: "Seoul",
      businessName: "Buyer Store",
      inviteCode: "WRONG",
      serviceConsent: true,
      marketingConsent: false,
    }),
  ).rejects.toThrow();
  expect(mocked.client.auth.signOut).toHaveBeenCalledTimes(1);
});

test("maps the latest related check-in when action plans are loaded again", async () => {
  plans.order.mockReturnValueOnce(plans).mockResolvedValueOnce({
    data: [
      {
        id: "plan-1",
        assessment_id: "assessment-1",
        action_key: "local-discovery",
        action_snapshot: { metric: "calls" },
        status: "completed",
        check_in_due_at: "2026-07-26",
        check_ins: [
          { before_value: 2, after_value: 5, note: "latest" },
          { before_value: 1, after_value: 2, note: "old" },
        ],
      },
    ],
    error: null,
  });
  const service = createSupabaseService("https://example.supabase.co", "anon");

  await expect(service.listActionPlans()).resolves.toMatchObject([
    { beforeValue: "2", afterValue: "5", note: "latest" },
  ]);
  expect(plans.order).toHaveBeenCalledWith("recorded_at", {
    referencedTable: "check_ins",
    ascending: false,
  });
  expect(plans.limit).toHaveBeenCalledWith(1, { referencedTable: "check_ins" });
});

test("completes an action with one atomic RPC call", async () => {
  mocked.client.rpc = vi.fn(async () => ({
    data: {
      id: "plan-1",
      assessment_id: "assessment-1",
      action_key: "local-discovery",
      action_snapshot: { metric: "calls" },
      status: "completed",
      check_in_due_at: "2026-07-26",
      check_in: {
        before_value: "길찾기 7회",
        after_value: "길찾기 12회",
        note: "done",
      },
    },
    error: null,
  }));
  const service = createSupabaseService("https://example.supabase.co", "anon");

  await expect(
    service.completeActionPlan("plan-1", "길찾기 7회", "길찾기 12회", "done"),
  ).resolves.toMatchObject({
    status: "completed",
    beforeValue: "길찾기 7회",
    afterValue: "길찾기 12회",
  });
  expect(mocked.client.rpc).toHaveBeenCalledTimes(1);
  expect(mocked.client.rpc).toHaveBeenCalledWith("complete_action_plan", {
    p_action_plan_id: "plan-1",
    p_before_value: "길찾기 7회",
    p_after_value: "길찾기 12회",
    p_note: "done",
  });
});

test("saves the target revenue from the nested diagnosis revenue input", async () => {
  const service = createSupabaseService("https://example.supabase.co", "anon");
  await service.saveAssessment({
    inputs: {
      revenue: { targetMonthlyRevenue: 40_000_000 },
      allocation: {
        newCustomerRevenue: 6_000_000,
        returningCustomerRevenue: 2_000_000,
        averageOrderValueRevenue: 2_000_000,
      },
    },
    metrics: {},
    diagnosis: {},
  });

  expect(mocked.client.rpc).toHaveBeenCalledWith(
    "save_assessment_with_goal",
    expect.objectContaining({
      p_target_revenue: 40_000_000,
      p_allocation: {
        newCustomerRevenue: 6_000_000,
        returningCustomerRevenue: 2_000_000,
        averageOrderValueRevenue: 2_000_000,
      },
    }),
  );
});

test("uses the Korea business month at a UTC month boundary", () => {
  expect(
    koreaBusinessMonthPeriod(new Date("2026-07-31T14:59:59.999Z")),
  ).toEqual({
    start: "2026-07-01",
    end: "2026-07-31",
  });
  expect(
    koreaBusinessMonthPeriod(new Date("2026-07-31T15:00:00.000Z")),
  ).toEqual({
    start: "2026-08-01",
    end: "2026-08-31",
  });
});
