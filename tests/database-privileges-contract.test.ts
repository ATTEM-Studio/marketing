import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migrationPath =
  "supabase/migrations/202607190005_authenticated_read_privileges.sql";

describe("authenticated database privileges", () => {
  test("grants only the table operations used by the live service", () => {
    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain(
      "grant usage on schema public to authenticated",
    );
    expect(migration).toContain(
      "grant select on table public.profiles, public.consent_events, public.stores, public.assessments, public.goals, public.action_plans, public.check_ins to authenticated",
    );
    expect(migration).toContain(
      "grant insert on table public.action_plans to authenticated",
    );
    expect(migration).not.toMatch(
      /grant\s+(?:insert|update|delete)\s+on\s+table\s+public\.(?:profiles|stores|consent_events|assessments|goals|check_ins)/i,
    );
  });

  test("verifies the intended grants with pgTAP", () => {
    const databaseTest = readFileSync(
      "supabase/tests/database/rls.test.sql",
      "utf8",
    );
    expect(databaseTest).toContain("select plan(94)");
    expect(databaseTest).toContain(
      "authenticated can read their profile through RLS",
    );
    expect(databaseTest).toContain(
      "authenticated can create a scheduled action plan through RLS",
    );
    expect(databaseTest).toContain("anon cannot read profiles");
  });
});
