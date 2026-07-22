import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const migrationPath =
  "supabase/migrations/202607190004_goal_allocation_contract.sql";
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

test("replaces the assessment RPC with a secured allocation contract", () => {
  expect(migration).toContain(
    "drop function if exists public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, date, date);",
  );
  expect(migration).toContain("p_allocation jsonb");
  expect(migration).toContain("security definer");
  expect(migration).toContain("set search_path = public, pg_temp");
  expect(migration).toContain("newCustomerRevenue");
  expect(migration).toContain("returningCustomerRevenue");
  expect(migration).toContain("averageOrderValueRevenue");
  expect(migration).toContain(
    "grant execute on function public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, jsonb, date, date) to authenticated;",
  );
});

test("fails closed for nullable metrics and allocation JSON", () => {
  expect(migration).toContain(
    "jsonb_typeof(p_calculated_metrics) is distinct from 'object'",
  );
  expect(migration).toContain(
    "jsonb_typeof(p_calculated_metrics -> 'shortfallRevenue') is distinct from 'number'",
  );
  expect(migration).toContain(
    "jsonb_typeof(p_allocation) is distinct from 'object'",
  );
  expect(migration).toContain("v_shortfall_revenue is null");
  expect(migration).toContain("v_allocation_total is null");
});

test("rejects target revenue outside the positive finite contract", () => {
  expect(migration).toContain("p_target_revenue is null");
  expect(migration).toContain(
    "p_target_revenue::text in ('NaN', 'Infinity', '-Infinity')",
  );
  expect(migration).toContain("p_target_revenue <= 0");
});

test("makes the secured RPC the only assessment and goal write path", () => {
  expect(migration).toContain(
    "revoke insert, update, delete on public.assessments, public.goals from anon, authenticated;",
  );
  expect(migration).toContain(
    "drop policy if exists assessment_owner_insert on public.assessments;",
  );
  expect(migration).toContain(
    "drop policy if exists goal_owner_insert on public.goals;",
  );
});
