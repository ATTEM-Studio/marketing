import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("migrates check-in values and the atomic RPC to text", () => {
  const migration = readFileSync(
    "supabase/migrations/202607190003_text_check_in_values.sql",
    "utf8",
  );

  expect(migration).toContain(
    "drop function if exists public.complete_action_plan(uuid, numeric, numeric, text)",
  );
  expect(migration).toContain("alter column before_value type text");
  expect(migration).toContain("alter column after_value type text");
  expect(migration).toContain("p_before_value text");
  expect(migration).toContain("p_after_value text");
  expect(migration).toContain("security definer");
  expect(migration).toContain("set search_path = public");
  expect(migration).toContain("for update");
  expect(migration).toContain("v_action.status = 'completed'");
  expect(migration).toContain(
    "revoke all on function public.complete_action_plan(uuid, text, text, text) from public, anon",
  );
  expect(migration).toContain(
    "grant execute on function public.complete_action_plan(uuid, text, text, text) to authenticated",
  );

  const databaseTest = readFileSync(
    "supabase/tests/database/rls.test.sql",
    "utf8",
  );
  expect(databaseTest).toContain("길찾기 7회");
  expect(databaseTest).toContain("길찾기 12회");
});
