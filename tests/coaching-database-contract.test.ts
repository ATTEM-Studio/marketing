import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migrationPath = "supabase/migrations/202607200010_instant_coaching.sql";
const atomicMigrationPath =
  "supabase/migrations/202607200011_coaching_atomic_transitions.sql";

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

describe("atomic coaching transitions", () => {
  test("binds one pending follow-up and caps issuance inside a locked RPC", () => {
    const sql = readFileSync(atomicMigrationPath, "utf8");

    expect(sql).toContain("pending_follow_up_key text");
    expect(sql).toContain("issue_coaching_follow_up");
    expect(sql).toMatch(/for update/is);
    expect(sql).toMatch(/follow_up_count\s*<\s*2/is);
    expect(sql).toMatch(/pending_follow_up_key\s+is\s+null/is);
    expect(sql).toMatch(/follow_up_count\s*=\s*follow_up_count\s*\+\s*1/is);
  });

  test("consumes only the exact pending key and finalizes idempotently", () => {
    const sql = readFileSync(atomicMigrationPath, "utf8");

    expect(sql).toContain("consume_coaching_follow_up");
    expect(sql).toMatch(/pending_follow_up_key\s*=\s*p_question_key/is);
    expect(sql).toContain("finalize_coaching_session");
    expect(sql).toContain("coaching_recommendations_one_per_session_idx");
    expect(sql).toMatch(/on conflict \(session_id\) do nothing/is);
    expect(sql).toMatch(/status\s*=\s*'answered'/is);
    expect(sql).toMatch(/pending_follow_up_key\s*=\s*null/is);
  });

  test("keeps all transition RPCs service-role only with fixed search paths", () => {
    const sql = readFileSync(atomicMigrationPath, "utf8");

    for (const name of [
      "issue_coaching_follow_up",
      "consume_coaching_follow_up",
      "finalize_coaching_session",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `create or replace function public\\.${name}[\\s\\S]+?security definer[\\s\\S]+?set search_path = pg_catalog, public`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${name}[\\s\\S]+?from public, anon, authenticated`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `grant execute on function public\\.${name}[\\s\\S]+?to service_role`,
          "i",
        ),
      );
    }
  });
});
