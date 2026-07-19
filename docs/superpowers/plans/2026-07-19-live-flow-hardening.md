# Live Flow Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the live buyer onboarding and action-plan flow, verify the deployed Supabase project, and redeploy the fixes.

**Architecture:** Keep the existing service-role-only registration RPC boundary and browser-side RLS reads. Add one additive migration for idempotent finalization and a stricter scheduled-action insert policy, then cover both behaviors with pgTAP and source contracts. Keep Supabase runtime secrets outside the repository; local smoke-test URLs remain replaceable when a public frontend URL is chosen.

**Tech Stack:** Supabase Postgres migrations, pgTAP, Supabase Edge Functions, TypeScript, Vitest, Vite.

## Global Constraints

- Never commit service-role keys, access tokens, or invite pepper values.
- Keep `finalize_buyer_registration` callable only by `service_role`.
- Keep client writes to assessments and goals behind `save_assessment_with_goal`.
- Keep action-plan completion behind `complete_action_plan`.
- Verify locally before `supabase db push` and Edge Function deployment.

---

### Task 1: Add failing contracts for retry-safe finalization and scheduled actions

**Files:**

- Modify: `tests/database-privileges-contract.test.ts`
- Modify: `supabase/tests/database/rls.test.sql`

- [x] **Step 1: Write the failing assertions**

Assert that the database test contains an idempotent finalization case and an action-plan insert policy requiring `scheduled` status.

- [x] **Step 2: Run the focused tests**

Run: `vitest run tests/database-privileges-contract.test.ts tests/pgtap-contract.test.ts --reporter=dot`

Expected: FAIL because the new migration and pgTAP assertions do not exist yet.

### Task 2: Implement the database hardening migration

**Files:**

- Create: `supabase/migrations/202607190006_live_flow_hardening.sql`

- [x] **Step 1: Make finalization idempotent**

Before requiring a pending registration, return the existing store id when the authenticated user already has an active profile with the same normalized email and an owned store.

- [x] **Step 2: Restrict direct action-plan creation**

Replace `action_owner_insert` with a policy whose `with check` additionally requires `status = 'scheduled'`.

- [x] **Step 3: Add pgTAP assertions**

Assert that the finalizer source contains the existing-profile retry branch and that an authenticated direct action insert with `status = 'completed'` is rejected.

### Task 3: Verify and deploy

**Files:**

- No source files beyond Tasks 1–2.

- [x] **Step 1: Run focused and full local verification**

Run: `pnpm verify`

Expected: all Vitest files pass, typecheck passes, security scan passes, and Vite build succeeds.

- [x] **Step 2: Push the migration to Supabase**

Run: `supabase db push` against project `ezicpacjcvofzlugflwa`, then `supabase migration list`.

Expected: local and remote migration `202607190006` match.

- [x] **Step 3: Redeploy both Edge Functions**

Run: `supabase functions deploy redeem-invite` and `supabase functions deploy finalize-registration`.

- [x] **Step 4: Smoke-test the live endpoints**

Verify `OPTIONS` returns 204, malformed `redeem-invite` returns the expected 400 validation response, and `finalize-registration` without explicit confirmation returns 400.

- [x] **Step 5: Commit and report residual configuration**

Commit the code changes. Report that `SITE_URL` and `ALLOWED_ORIGIN` are currently local-test URLs until the public frontend URL is selected.
