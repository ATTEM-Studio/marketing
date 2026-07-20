import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migrationPath = "supabase/migrations/202607200010_instant_coaching.sql";

describe("instant coaching database contract", () => {
  test("creates protected coaching persistence and a server-only limiter", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create table public.coaching_sessions");
    expect(sql).toContain("create table public.coaching_messages");
    expect(sql).toContain("create table public.coaching_recommendations");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("consume_coaching_request");
    expect(sql).toMatch(/revoke all.+coaching_request_events/is);
    expect(sql).toMatch(/grant execute.+service_role/is);
  });
});
