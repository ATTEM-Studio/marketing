import { beforeEach, expect, test, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  client: {} as Record<string, unknown>,
  createClient: vi.fn(),
}));

vi.mock("../src/services/supabase-client", () => ({
  createSupabaseClient: mocked.createClient,
}));

import { createSupabaseService } from "../src/services/supabase-service";

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
  mocked.client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      })),
    },
    functions: { invoke: vi.fn() },
    rpc: vi.fn(async () => ({ error: null })),
    from: vi.fn((table: string) => {
      if (table === "stores") return stores;
      if (table === "action_plans") return plans;
      return assessment;
    }),
  };
  mocked.createClient.mockReturnValue(mocked.client);
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
      check_in: { before_value: 2, after_value: 5, note: "done" },
    },
    error: null,
  }));
  const service = createSupabaseService("https://example.supabase.co", "anon");

  await expect(
    service.completeActionPlan("plan-1", "2", "5", "done"),
  ).resolves.toMatchObject({
    status: "completed",
    beforeValue: "2",
    afterValue: "5",
  });
  expect(mocked.client.rpc).toHaveBeenCalledTimes(1);
  expect(mocked.client.rpc).toHaveBeenCalledWith("complete_action_plan", {
    p_action_plan_id: "plan-1",
    p_before_value: "2",
    p_after_value: "5",
    p_note: "done",
  });
});

test("saves the target revenue from the nested diagnosis revenue input", async () => {
  const service = createSupabaseService("https://example.supabase.co", "anon");
  await service.saveAssessment({
    inputs: { revenue: { targetMonthlyRevenue: 40_000_000 } },
    metrics: {},
    diagnosis: {},
  });

  expect(mocked.client.rpc).toHaveBeenCalledWith(
    "save_assessment_with_goal",
    expect.objectContaining({ p_target_revenue: 40_000_000 }),
  );
});
