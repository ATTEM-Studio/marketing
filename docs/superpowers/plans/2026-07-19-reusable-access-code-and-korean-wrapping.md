# Reusable Access Code and Korean Wrapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept the shared ebook code `DOITNOW` for multiple reader accounts and prevent awkward Korean word fragmentation across responsive layouts.

**Architecture:** Extend the existing invite record with a reusable mode while preserving single-use reservation behavior. Seed `DOITNOW` as a normalized SHA-256 campaign hash, let the Edge Function try the reusable hash before the peppered single-use hash, and keep email confirmation, RLS, and IP rate limiting unchanged. Replace global arbitrary wrapping with Korean-aware wrapping and isolate forced wrapping to machine-like values.

**Tech Stack:** PostgreSQL/Supabase migrations and pgTAP, Supabase Edge Functions/Deno TypeScript, Vite TypeScript, CSS, Vitest, Vercel.

## Global Constraints

- Normalize access input with `trim().toUpperCase()`.
- `DOITNOW` is reusable and does not become reserved or redeemed.
- Existing single-use invite records remain supported.
- Email confirmation, generic invite errors, IP rate limiting, and RLS remain mandatory.
- Korean text uses word-level wrapping; only long machine tokens may break anywhere.
- Verify at 375 px, 768 px, and 1440 px without horizontal overflow.
- Never expose service-role keys or the invite pepper to the Vite bundle.

---

### Task 1: Reusable access-code database contract

**Files:**
- Create: `supabase/migrations/202607190007_reusable_access_code.sql`
- Modify: `supabase/tests/database/rls.test.sql`
- Modify: `tests/pgtap-contract.test.ts`

**Interfaces:**
- Consumes: `public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean)` and `public.finalize_buyer_registration(uuid, text)`.
- Produces: `invite_codes.is_reusable boolean`, a reusable `DOITNOW` hash row, and reusable-aware versions of both RPCs.

- [ ] **Step 1: Write failing database contract tests**

Add pgTAP assertions that require the new column and function branches:

```sql
select has_column('public', 'invite_codes', 'is_reusable');
select alike(
  (select prosrc from pg_proc where oid = 'public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean)'::regprocedure),
  '%v_invite.is_reusable%',
  'registration supports reusable access codes'
);
select alike(
  (select prosrc from pg_proc where oid = 'public.finalize_buyer_registration(uuid, text)'::regprocedure),
  '%if not v_invite.is_reusable then%',
  'finalization does not redeem reusable access codes'
);
select is(
  (select count(*) from public.invite_codes where is_reusable and code_hash = encode(digest('DOITNOW', 'sha256'), 'hex')),
  1::bigint,
  'DOITNOW is seeded once as a reusable normalized hash'
);
select ok(
  public.reserve_buyer_registration(encode(digest('DOITNOW', 'sha256'), 'hex'), 'reader-one@example.test', 'reader one', 'seoul', 'store one', true, false),
  'the reusable code accepts the first reader'
);
select ok(
  public.reserve_buyer_registration(encode(digest('DOITNOW', 'sha256'), 'hex'), 'reader-two@example.test', 'reader two', 'busan', 'store two', true, false),
  'the reusable code accepts a second reader'
);
select is(
  (select status from public.invite_codes where is_reusable and code_hash = encode(digest('DOITNOW', 'sha256'), 'hex')),
  'available',
  'the reusable code remains available after multiple reservations'
);
```

Increase `select plan(96)` to `select plan(103)`. Add a Vitest source assertion in `tests/pgtap-contract.test.ts` for `DOITNOW`, `is_reusable`, and the removal of the unique `invite_code_id` constraint in the new migration.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
& '.\node_modules\.bin\vitest.cmd' run tests/pgtap-contract.test.ts
```

Expected: FAIL because migration `202607190007_reusable_access_code.sql` and reusable assertions do not exist.

- [ ] **Step 3: Add the reusable migration**

Create the migration with these exact schema operations:

```sql
alter table public.invite_codes
  add column is_reusable boolean not null default false;

alter table public.pending_registrations
  drop constraint pending_registrations_invite_code_id_key;

insert into public.invite_codes (code_hash, status, expires_at, is_reusable)
values (encode(digest('DOITNOW', 'sha256'), 'hex'), 'available', '2099-12-31 23:59:59+00', true)
on conflict (code_hash) do update
set status = 'available', expires_at = excluded.expires_at, is_reusable = true,
    reserved_email = null, reserved_at = null, reservation_expires_at = null,
    redeemed_by = null, redeemed_at = null;
```

Replace the invite state check so reusable rows are valid only when `status = 'available'` and all reservation/redemption fields are null. Recreate `reserve_buyer_registration` so a reusable available row inserts a 30-minute pending registration without updating the invite row; keep the existing locked reservation branch for `is_reusable = false`. Recreate the latest idempotent `finalize_buyer_registration` from migration `202607190006_live_flow_hardening.sql`, accept reusable rows when available and unexpired, and wrap the final invite update with:

```sql
if not v_invite.is_reusable then
  update public.invite_codes
  set status = 'redeemed', reserved_email = null, reserved_at = null,
      reservation_expires_at = null, redeemed_by = p_user_id, redeemed_at = now()
  where id = v_invite.id;
end if;
```

Keep both functions `security definer`, pin `search_path = public`, and retain service-role-only grants.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the same Vitest command. Expected: PASS.

- [ ] **Step 5: Commit the database unit**

```powershell
git add supabase/migrations/202607190007_reusable_access_code.sql supabase/tests/database/rls.test.sql tests/pgtap-contract.test.ts
git commit -m "feat: add reusable ebook access code"
```

---

### Task 2: Edge normalization and reusable hash lookup

**Files:**
- Modify: `supabase/functions/redeem-invite/index.ts`
- Modify: `tests/invite-edge-contract.test.mjs`

**Interfaces:**
- Consumes: reusable unpeppered hash and existing peppered single-use hash accepted by `reserve_buyer_registration`.
- Produces: sequential server-side candidate lookup with one generic external error.

- [ ] **Step 1: Write the failing Edge contract test**

```ts
test("tries a reusable normalized hash before the peppered single-use hash", () => {
  expect(redeemInvite).toContain("await sha256(inviteCode)");
  expect(redeemInvite).toContain("await sha256(`${pepper}${inviteCode}`)");
  expect(redeemInvite).toContain("for (const codeHash of candidateHashes)");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& '.\node_modules\.bin\vitest.cmd' run tests/invite-edge-contract.test.mjs
```

Expected: FAIL because only the peppered single-use hash is currently tried.

- [ ] **Step 3: Implement candidate hash lookup**

Replace the single RPC invocation with:

```ts
const candidateHashes = [
  await sha256(inviteCode),
  await sha256(`${pepper}${inviteCode}`),
];
let reservationAccepted = false;
for (const codeHash of candidateHashes) {
  const { data, error } = await adminClient.rpc("reserve_buyer_registration", {
    p_code_hash: codeHash,
    p_email: email,
    p_name: name,
    p_region: region,
    p_business_name: businessName,
    p_required_consent: true,
    p_marketing_consent: body.marketingConsent,
  });
  if (error) return json(500, { error: "registration_unavailable" });
  if (data) {
    reservationAccepted = true;
    break;
  }
}
if (!reservationAccepted) return invalidInvite();
```

- [ ] **Step 4: Run focused Edge and service tests**

Run:

```powershell
& '.\node_modules\.bin\vitest.cmd' run tests/invite-edge-contract.test.mjs tests/supabase-service.test.ts tests/onboarding-ui.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the Edge unit**

```powershell
git add supabase/functions/redeem-invite/index.ts tests/invite-edge-contract.test.mjs
git commit -m "feat: validate reusable access codes on server"
```

---

### Task 3: Korean-aware responsive wrapping

**Files:**
- Modify: `src/styles.css`
- Modify: `tests/responsive-styles.test.ts`

**Interfaces:**
- Consumes: existing heading, paragraph, card, metric, and form selectors.
- Produces: word-level Korean wrapping with targeted emergency wrapping for machine tokens.

- [ ] **Step 1: Write the failing CSS contract test**

```ts
test("keeps Korean words intact while long machine tokens remain safe", () => {
  expect(css).toContain("word-break: keep-all");
  expect(css).toContain("text-wrap: balance");
  expect(css).toContain("text-wrap: pretty");
  expect(css).not.toMatch(/h1,\s*\n?h2,\s*\n?h3,[^{]+\{[^}]*overflow-wrap:\s*anywhere/s);
  expect(css).toMatch(/\.long-token,[^{]+\{[^}]*overflow-wrap:\s*anywhere/s);
});
```

- [ ] **Step 2: Run the focused CSS test and verify RED**

Run:

```powershell
& '.\node_modules\.bin\vitest.cmd' run tests/responsive-styles.test.ts
```

Expected: FAIL because headings currently use `overflow-wrap: anywhere` and no Korean-aware wrapping contract exists.

- [ ] **Step 3: Implement Korean wrapping rules**

Remove headings, business names, action cards, and metric cards from the global `overflow-wrap: anywhere` group. Add:

```css
body {
  word-break: keep-all;
  overflow-wrap: break-word;
}

h1,
h2,
h3 {
  word-break: keep-all;
  overflow-wrap: normal;
  text-wrap: balance;
}

p,
li,
label,
button,
legend,
summary {
  text-wrap: pretty;
}

.long-token,
.metric-value,
input,
textarea {
  word-break: normal;
  overflow-wrap: anywhere;
}
```

Preserve current responsive widths and 48 px touch targets.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same responsive test command. Expected: PASS.

- [ ] **Step 5: Commit the typography unit**

```powershell
git add src/styles.css tests/responsive-styles.test.ts
git commit -m "fix: keep Korean words intact across layouts"
```

---

### Task 4: Full verification and production deployment

**Files:**
- Verify: all source, tests, migration, and deployment configuration.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: updated Supabase database/functions, GitHub branch, and Vercel production alias.

- [ ] **Step 1: Run the complete local verification**

```powershell
$env:CI='true'
pnpm verify
```

Expected: formatting, typecheck, all Vitest files, security scan, and Vite build exit 0.

- [ ] **Step 2: Apply and verify Supabase changes**

```powershell
& '.\node_modules\.bin\supabase.cmd' db push --linked
& '.\node_modules\.bin\supabase.cmd' functions deploy redeem-invite --project-ref ezicpacjcvofzlugflwa
& '.\node_modules\.bin\supabase.cmd' functions deploy finalize-registration --project-ref ezicpacjcvofzlugflwa
```

Expected: migration `202607190007` applied and both functions deployed without errors.

- [ ] **Step 3: Push the existing PR branch**

```powershell
git push origin agent/buyer-sales-coach-mvp
```

Expected: branch updates PR #1 and GitHub `database` and `verify` checks pass.

- [ ] **Step 4: Deploy Vercel production**

```powershell
pnpm dlx vercel@50.28.0 --prod --yes
```

Expected: alias `https://buyer-sales-coach-mvp.vercel.app` points to the new production deployment.

- [ ] **Step 5: Verify the live experience**

At 375 px, 768 px, and 1440 px, verify the page title, `scrollWidth === clientWidth`, intact Korean word wrapping, live registration controls, and no browser error logs. Confirm the deployed Edge Function responds generically to malformed registration input; rely on the rolled-back pgTAP transaction for the two-email reusable-code proof so verification does not send unsolicited authentication email.

- [ ] **Step 6: Record clean completion state**

```powershell
git status --short
git log -6 --oneline
```

Expected: clean status and the documentation, database, Edge, and typography commits at branch tip.
