# Anonymous Instant Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn valid `DOITNOW` registration into an immediate same-browser authenticated session without sending or confirming email.

**Architecture:** Supabase Anonymous Auth creates the browser identity. The authenticated `redeem-invite` Edge Function validates the anonymous bearer, code, rate limit, and input, then calls one service-role-only RPC that atomically creates the profile, consent events, and store. The submitted email becomes a non-unique lead field, while RLS continues isolating all business data by the anonymous Auth user ID.

**Tech Stack:** Vite TypeScript, Supabase JS 2.110.7, Supabase Anonymous Auth, Deno Edge Functions, PostgreSQL/pgTAP, Vitest, Vercel.

## Global Constraints

- New readers never receive an OTP or confirmation email.
- `DOITNOW` remains reusable; legacy single-use codes remain consumable.
- Submitted email is unverified contact data and never authorizes database access.
- Same-browser sessions persist; other browsers and devices cannot recover old data.
- RLS continues authorizing by `auth.uid()` and active profile status.
- Existing generic code errors and six-attempt rolling 15-minute application rate limit remain.
- Anonymous Auth's built-in IP rate limit remains enabled.
- Service-role keys and invite hashes never enter the Vite bundle.

---

### Task 1: Atomic anonymous reader activation

**Files:**
- Create: `supabase/migrations/202607190009_anonymous_reader_activation.sql`
- Modify: `supabase/tests/database/rls.test.sql`
- Modify: `tests/pgtap-contract.test.ts`

**Interfaces:**
- Consumes: `invite_codes`, `profiles`, `stores`, `consent_events`, and `auth.users.is_anonymous`.
- Produces: `public.activate_anonymous_reader(uuid, text, text, text, text, text, boolean, boolean) returns uuid`.

- [ ] **Step 1: Write failing pgTAP and source-contract tests**

Increase the pgTAP plan from 103 to 111 and add these eight assertions/setups:

```sql
select has_function('public', 'activate_anonymous_reader', array['uuid', 'text', 'text', 'text', 'text', 'text', 'boolean', 'boolean']);
select ok(not has_function_privilege('authenticated', 'public.activate_anonymous_reader(uuid, text, text, text, text, text, boolean, boolean)', 'execute'), 'only the server activates an anonymous reader');
select is((select prosecdef from pg_proc where oid = 'public.activate_anonymous_reader(uuid, text, text, text, text, text, boolean, boolean)'::regprocedure), true, 'anonymous activation is security definer');
select alike((select array_to_string(proconfig, ',') from pg_proc where oid = 'public.activate_anonymous_reader(uuid, text, text, text, text, text, boolean, boolean)'::regprocedure), '%search_path=public%', 'anonymous activation pins search path');
select ok(not exists (
  select 1 from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) = 'UNIQUE (email)'
), 'lead email is not an authentication key');
select alike((select prosrc from pg_proc where oid = 'public.activate_anonymous_reader(uuid, text, text, text, text, text, boolean, boolean)'::regprocedure), '%is_anonymous%', 'activation requires an anonymous auth user');
select alike((select prosrc from pg_proc where oid = 'public.activate_anonymous_reader(uuid, text, text, text, text, text, boolean, boolean)'::regprocedure), '%if not v_invite.is_reusable then%', 'activation consumes only single-use codes');

insert into auth.users (id, is_anonymous)
values
  ('88888888-8888-8888-8888-888888888888', true),
  ('99999999-9999-9999-9999-999999999999', true);
select public.activate_anonymous_reader('88888888-8888-8888-8888-888888888888', encode(extensions.digest('DOITNOW', 'sha256'), 'hex'), 'reader one', 'shared@example.test', 'seoul', 'store one', true, false);
select public.activate_anonymous_reader('99999999-9999-9999-9999-999999999999', encode(extensions.digest('DOITNOW', 'sha256'), 'hex'), 'reader two', 'shared@example.test', 'busan', 'store two', true, false);
select is((select count(*) from public.profiles where email = 'shared@example.test'), 2::bigint, 'duplicate lead emails remain isolated by auth user id');
```

Add a Vitest source test that reads migration `202607190009_anonymous_reader_activation.sql`, requires the RPC name, `is_anonymous`, `drop constraint profiles_email_key`, and verifies migration versions remain unique.

- [ ] **Step 2: Run the focused contract tests and verify RED**

```powershell
& '.\node_modules\.bin\vitest.cmd' run tests/pgtap-contract.test.ts tests/database-privileges-contract.test.ts
```

Expected: FAIL because migration 009 and `activate_anonymous_reader` do not exist.

- [ ] **Step 3: Implement migration 009**

The migration removes email uniqueness and creates the RPC with this transaction contract:

```sql
alter table public.profiles drop constraint profiles_email_key;

create or replace function public.activate_anonymous_reader(
  p_user_id uuid,
  p_code_hash text,
  p_name text,
  p_email text,
  p_region text,
  p_business_name text,
  p_required_consent boolean,
  p_marketing_consent boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_invite public.invite_codes%rowtype;
  v_store_id uuid;
  v_is_anonymous boolean;
begin
  if char_length(p_code_hash) <> 64
    or char_length(trim(p_name)) not between 1 and 100
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or char_length(v_email) > 320
    or char_length(trim(p_region)) not between 1 and 100
    or char_length(trim(p_business_name)) not between 1 and 160
    or p_required_consent is not true
    or p_marketing_consent is null then
    raise exception 'invalid_registration' using errcode = 'P0001';
  end if;

  select is_anonymous into v_is_anonymous
  from auth.users where id = p_user_id for key share;
  if not found or v_is_anonymous is not true then
    raise exception 'anonymous_user_required' using errcode = 'P0001';
  end if;

  select s.id into v_store_id
  from public.profiles p join public.stores s on s.user_id = p.id
  where p.id = p_user_id and p.access_status = 'active';
  if found then return v_store_id; end if;

  select * into v_invite
  from public.invite_codes
  where code_hash = p_code_hash
  for update;
  if not found or v_invite.expires_at <= now() or v_invite.status <> 'available' then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, name, email, region, business_name, access_status)
  values (p_user_id, trim(p_name), v_email, trim(p_region), trim(p_business_name), 'active');
  insert into public.stores (user_id, name, region)
  values (p_user_id, trim(p_business_name), trim(p_region))
  returning id into v_store_id;
  insert into public.consent_events (user_id, consent_type, granted)
  values (p_user_id, 'service_terms', true), (p_user_id, 'marketing', p_marketing_consent);

  if not v_invite.is_reusable then
    update public.invite_codes
    set status = 'redeemed', redeemed_by = p_user_id, redeemed_at = now()
    where id = v_invite.id;
  end if;
  return v_store_id;
end;
$$;

revoke all on function public.activate_anonymous_reader(uuid, text, text, text, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.activate_anonymous_reader(uuid, text, text, text, text, text, boolean, boolean) to service_role;
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit the database unit**

```powershell
git add supabase/migrations/202607190009_anonymous_reader_activation.sql supabase/tests/database/rls.test.sql tests/pgtap-contract.test.ts tests/database-privileges-contract.test.ts
git commit -m "feat: activate anonymous ebook readers atomically"
```

---

### Task 2: Authenticated Edge activation

**Files:**
- Modify: `supabase/config.toml`
- Modify: `supabase/functions/redeem-invite/index.ts`
- Modify: `tests/invite-edge-contract.test.mjs`

**Interfaces:**
- Consumes: an anonymous bearer token and `activate_anonymous_reader(...)` from Task 1.
- Produces: `{ active: true }` without calling email Auth.

- [ ] **Step 1: Write failing Edge contract tests**

```ts
test("requires an anonymous bearer and activates without OTP", () => {
  expect(redeemInvite).toContain('request.headers.get("authorization")');
  expect(redeemInvite).toContain("user.is_anonymous !== true");
  expect(redeemInvite).toContain('"activate_anonymous_reader"');
  expect(redeemInvite).not.toContain("signInWithOtp");
  expect(redeemInvite).toContain("return json(200, { active: true })");
});

test("enables local anonymous auth and JWT verification", () => {
  expect(config).toContain("enable_anonymous_sign_ins = true");
  expect(config).toMatch(/\[functions\.redeem-invite\][^[]*verify_jwt = true/s);
});
```

- [ ] **Step 2: Run the focused Edge test and verify RED**

```powershell
& '.\node_modules\.bin\vitest.cmd' run tests/invite-edge-contract.test.mjs
```

Expected: FAIL because the function still sends an OTP and permits unauthenticated invocation.

- [ ] **Step 3: Implement authenticated anonymous activation**

Add `enable_anonymous_sign_ins = true` under `[auth]` and set `redeem-invite` to `verify_jwt = true`.

In the function, require the bearer before processing registration:

```ts
const authorization = request.headers.get("authorization");
if (!authorization?.startsWith("Bearer ")) {
  return json(401, { error: "unauthorized" });
}
const userClient = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { authorization } },
});
const { data: userData, error: userError } = await userClient.auth.getUser();
const user = userData.user;
if (userError || !user || user.is_anonymous !== true) {
  return json(401, { error: "unauthorized" });
}
```

Replace `reserve_buyer_registration` and OTP sending with the candidate loop calling:

```ts
const { data, error } = await adminClient.rpc("activate_anonymous_reader", {
  p_user_id: user.id,
  p_code_hash: codeHash,
  p_name: name,
  p_email: email,
  p_region: region,
  p_business_name: businessName,
  p_required_consent: true,
  p_marketing_consent: body.marketingConsent,
});
```

Return `{ active: true }` for the first accepted hash and the existing generic code error if neither hash activates.

- [ ] **Step 4: Run Edge and security tests**

```powershell
& '.\node_modules\.bin\vitest.cmd' run tests/invite-edge-contract.test.mjs tests/security-scan.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the Edge unit**

```powershell
git add supabase/config.toml supabase/functions/redeem-invite/index.ts tests/invite-edge-contract.test.mjs
git commit -m "feat: activate readers without email confirmation"
```

---

### Task 3: Immediate browser session and onboarding UI

**Files:**
- Modify: `src/services/contracts.ts`
- Modify: `src/services/supabase-service.ts`
- Modify: `src/ui/onboarding.ts`
- Modify: `src/app.ts`
- Modify: `src/ui/shell.ts`
- Modify: `tests/supabase-service.test.ts`
- Modify: `tests/onboarding-ui.test.ts`
- Modify: `tests/live-app.test.ts`
- Modify: other AppService test fakes reported by TypeScript.

**Interfaces:**
- Changes: `registerBuyer(input: BuyerRegistration): Promise<AppSession>`.
- Preserves: `getSession`, `signOut`, assessment, action, and legacy callback methods.

- [ ] **Step 1: Write failing service and UI tests**

Service test:

```ts
test("creates an anonymous session and returns the active profile", async () => {
  mocked.client.auth.signInAnonymously = vi.fn(async () => ({
    data: { user: { id: "anonymous-1", is_anonymous: true } },
    error: null,
  }));
  mocked.client.functions.invoke = vi.fn(async () => ({ data: { active: true }, error: null }));
  const service = createSupabaseService("https://example.supabase.co", "anon");
  await expect(service.registerBuyer(registration)).resolves.toMatchObject({
    mode: "live",
    profile: { id: "anonymous-1" },
  });
  expect(mocked.client.auth.signInAnonymously).toHaveBeenCalledTimes(1);
  expect(mocked.client.auth.signInWithOtp).toBeUndefined();
});
```

UI test:

```ts
test("opens diagnosis immediately after a valid code", async () => {
  const onAuthenticated = vi.fn();
  const fake = service();
  fake.registerBuyer = vi.fn(async () => ({ mode: "live", profile }));
  renderOnboarding(root, fake, { onAuthenticated });
  fillValidRegistration();
  form.requestSubmit();
  await Promise.resolve();
  await Promise.resolve();
  expect(onAuthenticated).toHaveBeenCalledWith({ mode: "live", profile });
  expect(document.body.textContent).not.toContain("이메일을 확인");
});
```

Add markup assertions for `바로 진단 시작하기` and `이 기기에 기록이 저장됩니다.`. Update live app tests so the signed-out login callback routes to the instant registration screen, while already-active same-browser sessions still open the dashboard.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
& '.\node_modules\.bin\vitest.cmd' run tests/supabase-service.test.ts tests/onboarding-ui.test.ts tests/live-app.test.ts
```

Expected: FAIL because registration returns void, sends email, and does not call `onAuthenticated`.

- [ ] **Step 3: Implement immediate anonymous service flow**

Change the contract to return `AppSession`. In `registerBuyer`:

```ts
const existing = await client.auth.getUser();
if (existing.data.user && existing.data.user.is_anonymous !== true) {
  await client.auth.signOut();
}
const current = await client.auth.getUser();
if (!current.data.user) {
  const { error: anonymousError } = await client.auth.signInAnonymously();
  if (anonymousError) throw new Error(INVITE_ERROR);
}
const { error } = await client.functions.invoke("redeem-invite", { body });
if (error) {
  await client.auth.signOut();
  throw new Error(INVITE_ERROR);
}
return this.getSession();
```

After submission, onboarding receives the returned session and calls `callbacks.onAuthenticated(session)`. Replace email-link button/status copy with `바로 진단 시작하기` and `입장 코드를 확인하고 내 공간을 만들고 있어요.` Add the same-device warning. Remove login switches from the primary registration markup; route the live landing's former login action to registration so no public action requests an email link.

- [ ] **Step 4: Run focused tests and typecheck**

```powershell
& '.\node_modules\.bin\vitest.cmd' run tests/supabase-service.test.ts tests/onboarding-ui.test.ts tests/live-app.test.ts
& '.\node_modules\.bin\tsc.cmd' --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit the browser/UI unit**

```powershell
git add src/services/contracts.ts src/services/supabase-service.ts src/ui/onboarding.ts src/app.ts src/ui/shell.ts tests
git commit -m "feat: start diagnosis immediately after access"
```

---

### Task 4: Full verification and production rollout

**Files:**
- Verify: all source, tests, migrations, functions, and deployment configuration.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: enabled anonymous Auth, migration 009, deployed Edge Function, GitHub checks, and Vercel production alias.

- [ ] **Step 1: Run complete local verification**

```powershell
$env:CI='true'
pnpm verify
```

Expected: format, typecheck, all Vitest files, security scan, and Vite production build exit 0.

- [ ] **Step 2: Enable anonymous Auth in the linked Supabase project**

In Supabase Dashboard → Authentication → Providers → Anonymous Sign-Ins, enable `Allow anonymous sign-ins` and save. Confirm `signInAnonymously()` returns a session using a disposable browser session before deploying the new Edge Function. Do not disable email confirmations because legacy email accounts may still exist.

- [ ] **Step 3: Deploy database and Edge changes**

```powershell
& '.\node_modules\.bin\supabase.cmd' db push --linked --yes
& '.\node_modules\.bin\supabase.cmd' functions deploy redeem-invite --project-ref ezicpacjcvofzlugflwa
```

Expected: migration `202607190009` and `redeem-invite` deploy successfully.

- [ ] **Step 4: Push GitHub and wait for checks**

```powershell
git push origin agent/buyer-sales-coach-mvp
gh pr checks 1 --repo ATTEM-Studio/marketing --watch --interval 5
```

Expected: `verify` and `database` pass.

- [ ] **Step 5: Deploy Vercel production**

```powershell
pnpm dlx vercel@50.28.0 --prod --yes
```

Expected: `https://buyer-sales-coach-mvp.vercel.app` aliases the new deployment.

- [ ] **Step 6: Verify the live same-browser journey**

At 375 px, open the live site, submit an operator-controlled lead address with `DOITNOW`, and confirm diagnosis opens without email UI. Refresh and confirm the active session opens the dashboard or saved journey. Repeat layout checks at 768 px and 1440 px, require `scrollWidth === clientWidth`, and require no production browser error logs. Do not use another person's email or send any authentication email.

- [ ] **Step 7: Verify clean completion state**

```powershell
git status --short
git log -8 --oneline
```

Expected: clean working tree and documentation, database, Edge, UI, and CI-fix commits at branch tip.
