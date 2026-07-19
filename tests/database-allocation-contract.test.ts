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
