import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const databaseTest = readFileSync(
  "supabase/tests/database/rls.test.sql",
  "utf8",
);
const reusableAccessMigration = readFileSync(
  "supabase/migrations/202607190007_reusable_access_code.sql",
  "utf8",
);

describe("pgTAP database contract", () => {
  test("uses unambiguous schema table assertions", () => {
    expect(databaseTest).toContain(
      "has_table('public'::name, 'profiles'::name, 'profiles table exists')",
    );
    expect(databaseTest).not.toMatch(
      /has_table\('public',\s*'(?:profiles|invite_codes|pending_registrations|assessments)'\)/,
    );
  });

  test("uses pgTAP SQL LIKE assertions instead of a nonexistent like function", () => {
    expect(databaseTest).not.toMatch(/select\s+like\s*\(/i);
    expect(databaseTest).toMatch(/select\s+alike\s*\(/i);
  });

  test("seeds DOITNOW as reusable access without a unique pending invite constraint", () => {
    expect(reusableAccessMigration).toContain("DOITNOW");
    expect(reusableAccessMigration).toContain("is_reusable");
    expect(reusableAccessMigration).toContain(
      "drop constraint pending_registrations_invite_code_id_key",
    );
    expect(databaseTest).toContain(
      "the reusable code accepts the first reader",
    );
    expect(databaseTest).toContain("the reusable code accepts a second reader");
    expect(databaseTest).toContain(
      "the reusable code remains available after multiple reservations",
    );
  });
});
