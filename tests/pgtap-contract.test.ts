import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const databaseTest = readFileSync(
  "supabase/tests/database/rls.test.sql",
  "utf8",
);
const reusableAccessMigration = readFileSync(
  "supabase/migrations/202607190008_reusable_access_code.sql",
  "utf8",
);
const anonymousActivationMigration = readFileSync(
  "supabase/migrations/202607190009_anonymous_reader_activation.sql",
  "utf8",
);
const adminLoginMigration = readFileSync(
  "supabase/migrations/202607280012_admin_login_rate_limit.sql",
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

  test("uses Supabase's pgcrypto extension schema explicitly", () => {
    expect(reusableAccessMigration).toContain("extensions.digest(");
    expect(databaseTest).toContain("extensions.digest(");
  });

  test("keeps every Supabase migration version unique", () => {
    const versions = readdirSync("supabase/migrations")
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.split("_")[0]);
    expect(new Set(versions).size).toBe(versions.length);
  });

  test("uses the unambiguous four-argument pgTAP column assertion", () => {
    expect(databaseTest).toMatch(
      /has_column\(\s*'public'::name,\s*'invite_codes'::name,\s*'is_reusable'::name,\s*'invite codes support reusable access'\s*\)/s,
    );
  });

  test("activates anonymous readers without treating lead email as identity", () => {
    expect(anonymousActivationMigration).toContain("activate_anonymous_reader");
    expect(anonymousActivationMigration).toContain("is_anonymous");
    expect(anonymousActivationMigration).toContain(
      "drop constraint profiles_email_key",
    );
    expect(databaseTest).toContain(
      "duplicate lead emails remain isolated by auth user id",
    );
  });

  test("indexes the global administrator-attempt cleanup by timestamp", () => {
    expect(adminLoginMigration).toMatch(
      /create index admin_login_attempts_attempted_at_idx\s+on public\.admin_login_attempts \(attempted_at\)/u,
    );
    expect(databaseTest).toContain(
      "administrator login cleanup has an attempted-at-leading index",
    );
  });
});
