# Secret Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secretly discoverable, server-authenticated administrator dashboard for membership totals, registration dates, duplicate detection, and readable member diagnosis details.

**Architecture:** A five-second, ten-press logo gesture opens a password dialog, but all authorization remains in Vercel server functions. A signed `HttpOnly` cookie protects server-only Supabase queries; a service-role-only database function limits password attempts. The Vite client renders responsive summary, member list, filters, and a lazily loaded detail drawer without ever receiving server secrets.

**Tech Stack:** React-free TypeScript DOM UI, Vite 8, Vercel Node Functions, Supabase Postgres and `@supabase/supabase-js`, Vitest/Happy DOM, CSS

## Global Constraints

- Use `ADMIN_DASHBOARD_PASSWORD` and a separate `ADMIN_SESSION_SECRET`; neither may use a `VITE_` prefix.
- The secret gesture is five seconds and ten presses on the green `N` logo.
- Admin sessions last two hours and use `HttpOnly`, `Secure`, `SameSite=Strict` cookies.
- Block an IP-derived hash for 15 minutes after five failed password attempts; never store the raw IP.
- Preserve all existing member-owner RLS policies and expose no service-role key to the browser.
- All admin data responses use `Cache-Control: no-store` and logs contain no member PII.
- Dates and registration summaries use `Asia/Seoul`.
- Duplicate severity is `high` for equal normalized email and `review` for equal normalized region plus business name; never auto-delete or merge.
- Do not display AI conversation text; show only usage count and most recent usage date.
- Do not add member editing, deletion, CSV export, multi-admin roles, or audit-log UI.

---

## File Structure

- `supabase/migrations/202607280012_admin_login_rate_limit.sql`: service-role-only hashed login attempt storage and atomic failure recording.
- `api/_lib/admin-auth.ts`: constant-time password verification, signed session token, cookie parsing/serialization, IP hashing.
- `api/_lib/admin-handler.ts`: framework-independent login, session, logout, overview, and member-detail request handlers.
- `api/_lib/admin-data.ts`: Supabase-backed rate-limit and member reporting repository.
- `api/admin-login.ts`, `api/admin-session.ts`, `api/admin-logout.ts`, `api/admin-overview.ts`, `api/admin-member.ts`: thin Vercel adapters.
- `src/admin/types.ts`: browser-safe administrator response models.
- `src/admin/api.ts`: same-origin admin API client with credentials and normalized errors.
- `src/admin/labels.ts`: diagnosis JSON-to-Korean label and unit mapping.
- `src/admin/secret-entry.ts`: five-second ten-press gesture state machine.
- `src/ui/admin-login.ts`: accessible password dialog.
- `src/ui/admin-dashboard.ts`: responsive overview, list, filters, and detail drawer.
- `src/ui/brand.ts`: common brand markup with a dedicated logo button and home link.
- `src/app.ts`: administrator flow orchestration.
- `src/ui/shell.ts`, `src/ui/onboarding.ts`, `src/ui/dashboard.ts`, `src/ui/diagnosis.ts`, `src/ui/result.ts`: use common brand markup.
- `src/styles.css`: administrator dialog/dashboard responsive and accessibility styles.
- `tests/admin-auth.test.ts`: token, cookie, password, and IP hash unit coverage.
- `tests/admin-api.test.ts`: handler authorization, status, pagination, and no-store coverage.
- `tests/admin-data.test.ts`: repository mapping and duplicate severity coverage.
- `tests/admin-secret-entry.test.ts`: gesture timing/reset coverage.
- `tests/admin-ui.test.ts`: login, summary/list, filter, detail, error, and accessibility behavior.
- `tests/admin-security.test.ts`: secret and PII regression checks.
- `README.md`: required production environment variables and manual administrator usage.

### Task 1: Database-backed administrator login throttling

**Files:**
- Create: `supabase/migrations/202607280012_admin_login_rate_limit.sql`
- Modify: `supabase/tests/database/rls.test.sql`

**Interfaces:**
- Produces: `public.check_admin_login_attempt(p_ip_hash text) returns boolean`
- Produces: `public.record_admin_login_failure(p_ip_hash text) returns boolean`
- Produces: `public.clear_admin_login_failures(p_ip_hash text) returns void`
- Security: all three functions and `public.admin_login_attempts` are available only to `service_role`

- [ ] **Step 1: Write failing pgTAP behavior and privilege tests**

```sql
select has_table('public', 'admin_login_attempts', 'admin login attempts table exists');
select ok(
  not has_table_privilege('anon', 'public.admin_login_attempts', 'select'),
  'anon cannot read admin login attempts'
);
select ok(
  not has_function_privilege('authenticated', 'public.record_admin_login_failure(text)', 'execute'),
  'authenticated users cannot record admin login failures'
);
select ok(
  has_function_privilege('service_role', 'public.record_admin_login_failure(text)', 'execute'),
  'service role can record admin login failures'
);

set local role service_role;
select ok(public.record_admin_login_failure(repeat('a', 64)), 'first failure remains below the lock threshold');
select ok(public.record_admin_login_failure(repeat('a', 64)), 'second failure remains below the lock threshold');
select ok(public.record_admin_login_failure(repeat('a', 64)), 'third failure remains below the lock threshold');
select ok(public.record_admin_login_failure(repeat('a', 64)), 'fourth failure remains below the lock threshold');
select ok(not public.record_admin_login_failure(repeat('a', 64)), 'fifth failure atomically reaches the lock threshold');
select ok(not public.check_admin_login_attempt(repeat('a', 64)), 'a locked hash cannot log in');
select lives_ok(
  $$select public.clear_admin_login_failures(repeat('a', 64))$$,
  'a successful login can clear failures'
);
select ok(public.check_admin_login_attempt(repeat('a', 64)), 'clearing failures restores access');
reset role;
```

- [ ] **Step 2: Run the database test and confirm it fails because the table and functions do not exist**

Run: `pnpm exec supabase db test`

Expected: FAIL on the missing `admin_login_attempts` table or functions. If the local Supabase runtime is unavailable, record that limitation and run the project pgTAP contract test after adding the failing assertions; the migration must still be behavior-tested against the linked database before deployment.

- [ ] **Step 3: Add the service-role-only table and atomic functions**

```sql
create table public.admin_login_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null check (char_length(ip_hash) = 64),
  attempted_at timestamptz not null default now()
);

create index admin_login_attempts_ip_hash_attempted_at_idx
  on public.admin_login_attempts (ip_hash, attempted_at desc);

alter table public.admin_login_attempts enable row level security;
revoke all on table public.admin_login_attempts from public, anon, authenticated;
grant select, insert, delete on table public.admin_login_attempts to service_role;

create or replace function public.check_admin_login_attempt(p_ip_hash text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_failures integer;
begin
  if char_length(p_ip_hash) <> 64 then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_ip_hash, 0));
  delete from public.admin_login_attempts
    where attempted_at < now() - interval '15 minutes';
  select count(*) into v_failures from public.admin_login_attempts
    where ip_hash = p_ip_hash and attempted_at >= now() - interval '15 minutes';
  return v_failures < 5;
end;
$$;
```

Complete the migration with these functions and grants:

```sql
create or replace function public.record_admin_login_failure(p_ip_hash text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_failures integer;
begin
  if char_length(p_ip_hash) <> 64 then
    raise exception 'invalid_ip_hash';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_ip_hash, 0));
  delete from public.admin_login_attempts
    where attempted_at < now() - interval '15 minutes';
  select count(*) into v_failures from public.admin_login_attempts
    where ip_hash = p_ip_hash and attempted_at >= now() - interval '15 minutes';
  if v_failures >= 5 then return false; end if;
  insert into public.admin_login_attempts (ip_hash) values (p_ip_hash);
  return v_failures + 1 < 5;
end;
$$;

create or replace function public.clear_admin_login_failures(p_ip_hash text)
returns void language sql security definer set search_path = public
as $$
  delete from public.admin_login_attempts where ip_hash = p_ip_hash;
$$;

revoke all on function public.check_admin_login_attempt(text) from public, anon, authenticated;
revoke all on function public.record_admin_login_failure(text) from public, anon, authenticated;
revoke all on function public.clear_admin_login_failures(text) from public, anon, authenticated;
grant execute on function public.check_admin_login_attempt(text) to service_role;
grant execute on function public.record_admin_login_failure(text) to service_role;
grant execute on function public.clear_admin_login_failures(text) to service_role;
```

- [ ] **Step 4: Run the database privilege and behavior tests**

Run: `pnpm exec supabase db test`

Run: `pnpm vitest run tests/pgtap-contract.test.ts tests/database-privileges-contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the database boundary**

```bash
git add supabase/migrations/202607280012_admin_login_rate_limit.sql supabase/tests/database/rls.test.sql
git commit -m "feat: add admin login rate limiting"
```

### Task 2: Signed administrator session and authentication endpoints

**Files:**
- Create: `api/_lib/admin-auth.ts`
- Create: `api/_lib/admin-handler.ts`
- Create: `api/admin-login.ts`
- Create: `api/admin-session.ts`
- Create: `api/admin-logout.ts`
- Create: `tests/admin-auth.test.ts`
- Create: `tests/admin-api.test.ts`
- Modify: `tests/vercel-function-esm.test.ts`

**Interfaces:**
- Produces: `createAdminSession(now?: Date): string`
- Produces: `verifyAdminSession(token: string, now?: Date): boolean`
- Produces: `readAdminCookie(cookieHeader: string | undefined): string | null`
- Produces: `adminSessionCookie(token: string): string`
- Produces: `expiredAdminSessionCookie(): string`
- Produces: `createAdminHandler(dependencies: AdminHandlerDependencies)`
- Consumes: Task 1 rate-limit RPCs through `AdminDataStore`

- [ ] **Step 1: Write failing authentication tests**

```ts
test("accepts a signed token for two hours and rejects tampering", () => {
  const token = createAdminSession(new Date("2026-07-28T00:00:00Z"));
  expect(verifyAdminSession(token, new Date("2026-07-28T01:59:59Z"))).toBe(true);
  expect(verifyAdminSession(`${token}x`, new Date("2026-07-28T01:00:00Z"))).toBe(false);
  expect(verifyAdminSession(token, new Date("2026-07-28T02:00:01Z"))).toBe(false);
});

test("uses a hardened cookie", () => {
  expect(adminSessionCookie("signed")).toContain("HttpOnly");
  expect(adminSessionCookie("signed")).toContain("Secure");
  expect(adminSessionCookie("signed")).toContain("SameSite=Strict");
  expect(adminSessionCookie("signed")).toContain("Max-Age=7200");
});
```

Stub `ADMIN_DASHBOARD_PASSWORD` and `ADMIN_SESSION_SECRET` with test-only values before importing the module.

- [ ] **Step 2: Run authentication tests and confirm missing-module failure**

Run: `pnpm vitest run tests/admin-auth.test.ts`

Expected: FAIL because `api/_lib/admin-auth.ts` does not exist.

- [ ] **Step 3: Implement constant-time verification and HMAC session tokens**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SECONDS = 2 * 60 * 60;
const COOKIE_NAME = "__Host-jangsa-admin";

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function signature(payload: string): string {
  return createHmac("sha256", requiredSessionSecret())
    .update(payload)
    .digest("base64url");
}
```

Token payload contains only version, issued-at, and expiry timestamps. Validate token shape, signature, clock bounds, and exact two-hour expiry. Hash the forwarded client IP with `ADMIN_SESSION_SECRET` before calling Task 1 functions.

- [ ] **Step 4: Write failing handler tests for method, throttling, cookies, and no-store**

```ts
test("successful login clears failures and returns a hardened cookie", async () => {
  const result = await handler({
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.7" },
    body: { password: "correct horse battery staple" },
  });
  expect(result.status).toBe(204);
  expect(result.headers?.["Set-Cookie"]).toContain("HttpOnly");
  expect(result.headers?.["Cache-Control"]).toBe("no-store");
  expect(data.clearFailures).toHaveBeenCalledOnce();
});

test("admin data requires a valid cookie", async () => {
  const result = await handler({ method: "GET", headers: {}, body: null });
  expect(result.status).toBe(401);
});
```

- [ ] **Step 5: Implement framework-independent handlers and thin Vercel adapters**

`POST /api/admin-login` accepts `{ password: string }` with a 256-character maximum. `GET /api/admin-session` returns `{ authenticated: true }` only for a valid cookie. `POST /api/admin-logout` always expires the cookie. Every branch sets `Cache-Control: no-store`; unsupported methods return `405` with `Allow`.

Each adapter follows the existing `api/coaching.ts` pattern:

```ts
export default async function endpoint(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  const result = await productionHandler(toAdminRequest(request));
  applyAdminResponse(response, result);
}
```

- [ ] **Step 6: Run endpoint, ESM, type, and security tests**

Run: `pnpm vitest run tests/admin-auth.test.ts tests/admin-api.test.ts tests/vercel-function-esm.test.ts tests/build-config.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit administrator authentication**

```bash
git add api/_lib/admin-auth.ts api/_lib/admin-handler.ts api/admin-login.ts api/admin-session.ts api/admin-logout.ts tests/admin-auth.test.ts tests/admin-api.test.ts tests/vercel-function-esm.test.ts
git commit -m "feat: secure admin dashboard sessions"
```

### Task 3: Membership reporting and duplicate detection API

**Files:**
- Create: `api/_lib/admin-data.ts`
- Create: `api/admin-overview.ts`
- Create: `api/admin-member.ts`
- Create: `tests/admin-data.test.ts`
- Modify: `api/_lib/admin-handler.ts`
- Modify: `tests/admin-api.test.ts`

**Interfaces:**
- Produces: `AdminOverviewQuery { search: string; duplicate: "all" | "high" | "review"; page: number; pageSize: number }`
- Produces: `AdminOverview { totals; daily; members; page; pageSize; totalRows }`
- Produces: `AdminMemberDetail { profile; duplicatePeers; latestAssessment; assessmentHistory; coachingUsage }`
- Produces: `createAdminDataStore(client?: SupabaseClient): AdminDataStore`
- Consumes: Task 2 valid session guard

- [ ] **Step 1: Write failing duplicate and mapping tests**

```ts
test("same normalized email wins over matching store and region", () => {
  const groups = classifyDuplicates([
    profile("a", " Owner@Example.com ", "서울 마포구", "우리 식당"),
    profile("b", "owner@example.com", "서울 마포구", "우리식당"),
  ]);
  expect(groups.get("a")?.severity).toBe("high");
  expect(groups.get("b")?.peerIds).toEqual(["a"]);
});

test("same normalized region and business is review severity", () => {
  const groups = classifyDuplicates([
    profile("a", "a@example.com", "서울  마포구", "우리 식당"),
    profile("b", "b@example.com", "서울 마포구", "우리식당"),
  ]);
  expect(groups.get("a")?.severity).toBe("review");
});
```

Normalization applies `NFKC`, trim, lowercase, whitespace collapse, and punctuation/spacing removal for business comparison. Names alone are ignored.

- [ ] **Step 2: Run repository tests and confirm missing-module failure**

Run: `pnpm vitest run tests/admin-data.test.ts`

Expected: FAIL because `api/_lib/admin-data.ts` does not exist.

- [ ] **Step 3: Implement repository types, mapping, aggregation, and duplicate classification**

```ts
export interface AdminMemberSummary {
  id: string;
  name: string;
  email: string;
  region: string;
  businessName: string;
  joinedAt: string;
  duplicate: { severity: "high" | "review"; peerCount: number } | null;
}

export function normalizeIdentity(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}
```

Fetch active profiles in bounded chunks for duplicate grouping, use exact-count queries for totals, and paginate returned rows. Compute Korean day boundaries explicitly and return ISO date keys. Member detail fetches profile/consent, the newest completed assessment plus history dates, action plans, and coaching session count/latest timestamp. Do not select `coaching_messages.payload`.

- [ ] **Step 4: Add guarded overview and detail handler tests**

Add concrete cases:

```ts
expect((await overview({ query: { page: "0" } })).status).toBe(400);
expect((await overview({ query: { pageSize: "51" } })).status).toBe(400);
expect((await overview({ query: { search: "x".repeat(101) } })).status).toBe(400);
expect((await member({ query: { id: "not-a-uuid" } })).status).toBe(400);
expect((await member({ query: { id: missingUuid }, cookie: validCookie })).status).toBe(404);
expect((await overview({ query: {} })).status).toBe(401);
const ok = await overview({ query: {}, cookie: validCookie });
expect(ok.status).toBe(200);
expect(ok.headers?.["Cache-Control"]).toBe("no-store");
```

Run: `pnpm vitest run tests/admin-api.test.ts tests/admin-data.test.ts`

Expected: PASS.

- [ ] **Step 5: Add thin overview/detail Vercel endpoints and run type checking**

`GET /api/admin-overview?search=&duplicate=all&page=1&pageSize=25` returns overview data. `GET /api/admin-member?id=<uuid>` returns the selected member. Both invoke the Task 2 cookie guard before touching the repository.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the reporting API**

```bash
git add api/_lib/admin-data.ts api/_lib/admin-handler.ts api/admin-overview.ts api/admin-member.ts tests/admin-data.test.ts tests/admin-api.test.ts
git commit -m "feat: add admin membership reporting api"
```

### Task 4: Browser-safe admin models, API client, and readable diagnosis labels

**Files:**
- Create: `src/admin/types.ts`
- Create: `src/admin/api.ts`
- Create: `src/admin/labels.ts`
- Create: `tests/admin-client.test.ts`
- Create: `tests/admin-labels.test.ts`

**Interfaces:**
- Produces: `adminApi.login(password)`, `.session()`, `.logout()`, `.overview(query)`, `.member(id)`
- Produces: `diagnosisSections(detail: AdminMemberDetail): AdminDetailSection[]`
- Consumes: Task 3 response shapes

- [ ] **Step 1: Write failing API client and label tests**

```ts
test("sends cookies and maps an expired session", async () => {
  fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
  await expect(adminApi.overview(defaultQuery)).rejects.toMatchObject({
    code: "unauthorized",
  });
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/admin-overview"),
    expect.objectContaining({ credentials: "same-origin" }),
  );
});

test("labels restaurant fields with units and missing values", () => {
  const sections = diagnosisSections(detailWithRestaurant({ seats: 24 }));
  expect(sections.flatMap((section) => section.items)).toContainEqual({
    label: "좌석 수",
    value: "24석",
  });
  expect(sectionValue(sections, "평균 체류 시간")).toBe("입력하지 않음");
});
```

- [ ] **Step 2: Run the tests and confirm missing-module failures**

Run: `pnpm vitest run tests/admin-client.test.ts tests/admin-labels.test.ts`

Expected: FAIL for missing `src/admin` modules.

- [ ] **Step 3: Implement response types, fetch wrapper, and explicit Korean field maps**

```ts
export class AdminApiError extends Error {
  constructor(
    public readonly code: "unauthorized" | "locked" | "invalid" | "network",
  ) {
    super(code);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (response.status === 401) throw new AdminApiError("unauthorized");
  if (!response.ok) throw new AdminApiError(response.status === 429 ? "locked" : "network");
  return (await response.json()) as T;
}
```

Implement explicit getters for all fields in the approved six detail blocks using these primitives:

```ts
const missing = "입력하지 않음";
const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const count = (value: unknown, unit = "명"): string => {
  const parsed = finite(value);
  return parsed === null ? missing : `${new Intl.NumberFormat("ko-KR").format(parsed)}${unit}`;
};
const yesNo = (value: unknown): string =>
  value === true ? "예" : value === false ? "아니요" : missing;
```

Create fixed arrays for `기본 정보`, `최근 진단 요약`, `고객과 운영`, `광고`, `요식업 선택 정보`, and `계산 결과와 추천`. Read only named fields from `input_data`, `calculated_metrics`, and `diagnosis`; no `Object.entries` fallback may render unknown keys.

- [ ] **Step 4: Run focused tests and type checking**

Run: `pnpm vitest run tests/admin-client.test.ts tests/admin-labels.test.ts`

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the browser data boundary**

```bash
git add src/admin/types.ts src/admin/api.ts src/admin/labels.ts tests/admin-client.test.ts tests/admin-labels.test.ts
git commit -m "feat: add admin dashboard client models"
```

### Task 5: Secret logo gesture and administrator login dialog

**Files:**
- Create: `src/admin/secret-entry.ts`
- Create: `src/ui/brand.ts`
- Create: `src/ui/admin-login.ts`
- Create: `tests/admin-secret-entry.test.ts`
- Create: `tests/admin-login-ui.test.ts`
- Modify: `src/ui/shell.ts`
- Modify: `src/ui/onboarding.ts`
- Modify: `src/ui/dashboard.ts`
- Modify: `src/ui/diagnosis.ts`
- Modify: `src/ui/result.ts`
- Modify: `tests/app-shell.test.ts`

**Interfaces:**
- Produces: `createSecretEntry({ presses: 10, windowMs: 5000, onUnlock })`
- Produces: `brandMarkup(homeHref: string): string` with `[data-admin-trigger]`
- Produces: `renderAdminLogin(root, adminApi, callbacks)`
- Consumes: Task 4 `adminApi.login`

- [ ] **Step 1: Write failing gesture state-machine tests**

```ts
test("unlocks exactly on the tenth press inside five seconds", () => {
  const unlock = vi.fn();
  const entry = createSecretEntry({ presses: 10, windowMs: 5000, onUnlock: unlock });
  for (let index = 0; index < 9; index += 1) entry.press(index * 400);
  expect(unlock).not.toHaveBeenCalled();
  entry.press(3600);
  expect(unlock).toHaveBeenCalledOnce();
});

test("resets when the five-second window expires", () => {
  const unlock = vi.fn();
  const entry = createSecretEntry({ presses: 10, windowMs: 5000, onUnlock: unlock });
  entry.press(0);
  for (let index = 0; index < 9; index += 1) entry.press(6000 + index);
  expect(unlock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run gesture tests and confirm missing-module failure**

Run: `pnpm vitest run tests/admin-secret-entry.test.ts`

Expected: FAIL because `src/admin/secret-entry.ts` does not exist.

- [ ] **Step 3: Implement the pure gesture controller and shared brand markup**

The logo becomes a dedicated `type="button"` with `data-admin-trigger` and an accessible name of `장사네비게이션 로고`; the adjacent brand name remains the normal home link. Pointer clicks, Enter, and Space all produce normal button click events, so no nested interactive elements are introduced.

```ts
export function createSecretEntry(options: SecretEntryOptions) {
  let times: number[] = [];
  return {
    press(now = Date.now()) {
      times = times.filter((value) => now - value <= options.windowMs);
      times.push(now);
      if (times.length !== options.presses) return;
      times = [];
      options.onUnlock();
    },
    reset() {
      times = [];
    },
  };
}
```

- [ ] **Step 4: Write failing accessible login dialog tests**

Assert dialog role/label, password autocomplete, submit busy state, generic invalid-password copy, lock copy, Escape close, initial focus, and focus restoration.

Run: `pnpm vitest run tests/admin-login-ui.test.ts`

Expected: FAIL because `renderAdminLogin` is not implemented.

- [ ] **Step 5: Implement the dialog and replace duplicated brand markup**

The dialog submits a maximum 256-character password, clears the input after failure, never stores it, and calls `onAuthenticated` after a `204`. Refactor all six page headers to use `brandMarkup()` and retain existing visual copy and home behavior.

- [ ] **Step 6: Run gesture, login, and existing page tests**

Run: `pnpm vitest run tests/admin-secret-entry.test.ts tests/admin-login-ui.test.ts tests/app-shell.test.ts tests/dashboard-ui.test.ts tests/diagnosis-ui.test.ts tests/onboarding-ui.test.ts tests/result-ui.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the secret entry flow**

```bash
git add src/admin/secret-entry.ts src/ui/brand.ts src/ui/admin-login.ts src/ui/shell.ts src/ui/onboarding.ts src/ui/dashboard.ts src/ui/diagnosis.ts src/ui/result.ts tests/admin-secret-entry.test.ts tests/admin-login-ui.test.ts tests/app-shell.test.ts
git commit -m "feat: add secret admin entry"
```

### Task 6: Responsive administrator overview and member detail experience

**Files:**
- Create: `src/ui/admin-dashboard.ts`
- Create: `tests/admin-ui.test.ts`
- Modify: `src/app.ts`
- Modify: `src/styles.css`
- Modify: `tests/responsive-styles.test.ts`
- Modify: `tests/live-app.test.ts`

**Interfaces:**
- Produces: `renderAdminDashboard(root, adminApi, callbacks): Promise<void>`
- Consumes: Task 4 API/types/labels and Task 5 successful login callback

- [ ] **Step 1: Write failing administrator dashboard UI tests**

```ts
test("shows totals, newest members, and duplicate badges", async () => {
  await renderAdminDashboard(root, fakeApi, callbacks);
  expect(root.querySelector("[data-total-members]")?.textContent).toContain("128");
  expect(root.textContent).toContain("김대표");
  expect(root.textContent).toContain("중복 가능성 높음");
});

test("opens a labelled member detail drawer without loading chat text", async () => {
  await renderAdminDashboard(root, fakeApi, callbacks);
  click("[data-member-id='11111111-1111-1111-1111-111111111111']");
  await flushPromises();
  expect(root.querySelector("[role='dialog']")?.getAttribute("aria-label")).toBe("회원 상세 정보");
  expect(root.textContent).toContain("최근 월평균 매출");
  expect(root.textContent).not.toContain("coaching message payload");
});
```

Add individual tests with these assertions:

```ts
expect(root.querySelector("[data-period='today']")?.textContent).toContain("오늘");
input("[data-admin-search]", "마포");
vi.advanceTimersByTime(299);
expect(fakeApi.overview).toHaveBeenCalledTimes(1);
vi.advanceTimersByTime(1);
expect(fakeApi.overview).toHaveBeenLastCalledWith(expect.objectContaining({ search: "마포" }));
click("[data-duplicate-filter='review']");
expect(fakeApi.overview).toHaveBeenLastCalledWith(expect.objectContaining({ duplicate: "review" }));
click("[data-admin-next-page]");
expect(fakeApi.overview).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
```

Separate tests set `members: []`, reject overview, reject member detail, throw `AdminApiError("unauthorized")`, press Escape, and click logout. Assert respectively the empty copy, list retry button, detail-only retry with the list preserved, cleared PII plus login dialog, focus restoration to the selected member, and `fakeApi.logout` invocation.

- [ ] **Step 2: Run the UI tests and confirm missing-module failure**

Run: `pnpm vitest run tests/admin-ui.test.ts`

Expected: FAIL because `src/ui/admin-dashboard.ts` does not exist.

- [ ] **Step 3: Implement overview state and rendering**

Maintain one state object:

```ts
interface AdminDashboardState {
  query: AdminOverviewQuery;
  overview: AdminOverview | null;
  selectedMember: AdminMemberDetail | null;
  loading: "overview" | "detail" | null;
  error: "overview" | "detail" | null;
}
```

Render four summary cards, an accessible 30-day bar trend with textual values, search, three duplicate filters, member table/cards, pagination, and a lazy detail drawer. Escape all server-provided strings before inserting HTML. Debounce search by 300ms and abort obsolete fetches.

- [ ] **Step 4: Integrate the administrator flow into the app**

At app start, install one delegated listener for `[data-admin-trigger]`. Unlock renders Task 5 login. Successful login renders the dashboard. Administrator logout returns to the prior normal view. A `401` from any dashboard request clears the member DOM and returns to login.

- [ ] **Step 5: Add responsive and accessible styling**

Use the existing green/cream design tokens. Desktop uses a summary grid, trend panel, table, and right drawer; below `760px`, summary becomes two columns, rows become cards, and the detail drawer becomes an inset full-height sheet. Add visible focus, reduced-motion handling, non-breaking numeric values, Korean `word-break: keep-all`, and loading skeleton/announcements.

- [ ] **Step 6: Run focused UI and responsive tests**

Run: `pnpm vitest run tests/admin-ui.test.ts tests/responsive-styles.test.ts tests/live-app.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the administrator dashboard**

```bash
git add src/ui/admin-dashboard.ts src/app.ts src/styles.css tests/admin-ui.test.ts tests/responsive-styles.test.ts tests/live-app.test.ts
git commit -m "feat: add responsive admin dashboard"
```

### Task 7: Security regression, operating documentation, and release preparation

**Files:**
- Create: `tests/admin-security.test.ts`
- Modify: `tests/security-scan.test.ts`
- Modify: `tests/build-config.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: all previous tasks
- Produces: a fully verified feature branch ready for review, merge, migration, and deployment

- [ ] **Step 1: Write security regression tests**

```ts
test("admin secrets remain server-only", () => {
  expect(readFileSync("src/config.ts", "utf8")).not.toMatch(/ADMIN_(?:DASHBOARD_PASSWORD|SESSION_SECRET)/);
  expect(readFileSync("vite.config.ts", "utf8")).not.toMatch(/ADMIN_(?:DASHBOARD_PASSWORD|SESSION_SECRET)/);
});

test("member endpoint never selects coaching message payloads", () => {
  const source = readFileSync("api/_lib/admin-data.ts", "utf8");
  expect(source).not.toMatch(/from\(["']coaching_messages["']\)/);
  expect(source).not.toMatch(/console\.(?:log|info|debug)\([^)]*(?:email|business_name|input_data)/);
});
```

- [ ] **Step 2: Run security tests and resolve any reported secret or PII exposure**

Run: `pnpm vitest run tests/admin-security.test.ts tests/security-scan.test.ts tests/build-config.test.ts`

Expected: PASS with no admin secret or PII finding.

- [ ] **Step 3: Document production operation**

Add exact setup instructions:

```text
ADMIN_DASHBOARD_PASSWORD=<a unique long password kept outside the repository>
ADMIN_SESSION_SECRET=<at least 32 random bytes, independently generated>
```

Document the five-second ten-press logo gesture, two-hour session, logout, password rotation effect, duplicate badge meanings, and the fact that the dashboard is read-only.

- [ ] **Step 4: Run the complete local verification**

Run: `pnpm verify`

Expected: formatting, TypeScript, all Vitest tests, security scan, and Vite production build all PASS.

- [ ] **Step 5: Verify the migration against the linked Supabase project without applying it**

Run: `pnpm exec supabase db diff --linked`

Run: `pnpm exec supabase migration list --linked`

Expected: the pending local migration is identified and no unrelated destructive change is present. Do not push the migration before the whole-branch review and `main` merge.

- [ ] **Step 6: Configure Vercel server-only secrets without printing values**

Add `ADMIN_DASHBOARD_PASSWORD` and `ADMIN_SESSION_SECRET` to Production and Preview using the Vercel dashboard or secret-safe CLI input. Confirm only the variable names and target environments; never print or save their values in command output or files.

- [ ] **Step 7: Commit documentation and final security coverage**

```bash
git add tests/admin-security.test.ts tests/security-scan.test.ts tests/build-config.test.ts README.md
git commit -m "docs: secure admin dashboard operations"
```

- [ ] **Step 8: Record the exact verified feature commit**

Run: `git rev-parse HEAD`

Expected: one clean feature-branch commit SHA with no working-tree changes. The controller performs the whole-branch review, merges into `main`, pushes `main`, applies migration `202607280012`, and deploys the exact merged SHA.

- [ ] **Step 9: Prepare the production verification checklist**

Verify on desktop and a mobile viewport:

1. A normal logo/name click still provides expected navigation.
2. Ten `N` presses inside five seconds open the password dialog.
3. Wrong passwords show a generic error and repeated failures are blocked.
4. The configured password opens the dashboard.
5. Totals, Korea dates, member search, duplicate filters, and paging load.
6. A member opens readable profile and diagnosis blocks.
7. Network responses are `no-store`; a signed-out request returns `401`.
8. Logout removes visible PII and reauthentication is required.

Run a final secret scan against tracked files and the built `dist` directory. Save no real member data in reports or screenshots.

- [ ] **Step 10: Final handoff**

Report the verified feature SHA, pending migration, test summary, the secret gesture, two-hour expiry, and the two required Vercel variable names. Do not include either secret value or any real member data. Production URL and deployment ID are added only after whole-branch review, `main` merge, migration, and deployment.
