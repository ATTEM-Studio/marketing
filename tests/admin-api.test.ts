import { expect, test, vi } from "vitest";

process.env.ADMIN_DASHBOARD_PASSWORD = "correct horse battery staple";
process.env.ADMIN_SESSION_SECRET = "test-only-administrator-session-secret";

const { createAdminSession, hashAdminClientIp } =
  await import("../api/_lib/admin-auth");
const { createAdminHandler } = await import("../api/_lib/admin-handler");
const { createAdminDataStore } = await import("../api/_lib/admin-data");
const { createAdminLoginEndpoint } = await import("../api/admin-login");
const { createAdminSessionEndpoint } = await import("../api/admin-session");
const { createAdminLogoutEndpoint } = await import("../api/admin-logout");

const now = new Date("2026-07-28T00:00:00Z");

function limiter(overrides: Partial<Record<string, boolean>> = {}) {
  return {
    isAllowed: vi.fn().mockResolvedValue(overrides.isAllowed ?? true),
    recordFailure: vi.fn().mockResolvedValue(overrides.recordFailure ?? true),
    clearFailures: vi.fn().mockResolvedValue(undefined),
  };
}

function handler(data = limiter()) {
  return {
    data,
    routes: createAdminHandler({ data, now: () => now }),
  };
}

test("successful login clears failures and returns a hardened no-store cookie", async () => {
  const { data, routes } = handler();

  const result = await routes.login({
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.7" },
    body: { password: "correct horse battery staple" },
  });

  expect(result.status).toBe(204);
  expect(result.headers?.["Set-Cookie"]).toContain("HttpOnly");
  expect(result.headers?.["Set-Cookie"]).toContain("Secure");
  expect(result.headers?.["Cache-Control"]).toBe("no-store");
  expect(data.clearFailures).toHaveBeenCalledWith(
    hashAdminClientIp("203.0.113.7"),
  );
});

test("failed login records only a hashed client IP and uses a generic response", async () => {
  const { data, routes } = handler();

  const result = await routes.login({
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.7" },
    body: { password: "incorrect" },
  });

  expect(result).toMatchObject({
    status: 401,
    body: { error: "LOGIN_FAILED" },
    headers: { "Cache-Control": "no-store" },
  });
  expect(data.recordFailure).toHaveBeenCalledWith(
    hashAdminClientIp("203.0.113.7"),
  );
  expect(JSON.stringify(data.recordFailure.mock.calls)).not.toContain(
    "203.0.113.7",
  );
});

test("a rate-limited login keeps the same generic error without recording another failure", async () => {
  const { data, routes } = handler(limiter({ isAllowed: false }));

  const result = await routes.login({
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.7" },
    body: { password: "correct horse battery staple" },
  });

  expect(result).toMatchObject({
    status: 401,
    body: { error: "LOGIN_FAILED" },
    headers: { "Cache-Control": "no-store" },
  });
  expect(data.recordFailure).not.toHaveBeenCalled();
  expect(data.clearFailures).not.toHaveBeenCalled();
});

test("login rejects a password over 256 characters before using the limiter", async () => {
  const { data, routes } = handler();

  const result = await routes.login({
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.7" },
    body: { password: "x".repeat(257) },
  });

  expect(result).toMatchObject({
    status: 400,
    body: { error: "INVALID_REQUEST" },
    headers: { "Cache-Control": "no-store" },
  });
  expect(data.isAllowed).not.toHaveBeenCalled();
});

test("admin data requires a valid cookie", async () => {
  const { routes } = handler();

  const result = await routes.session({
    method: "GET",
    headers: {},
    body: null,
  });

  expect(result).toMatchObject({
    status: 401,
    body: { error: "UNAUTHORIZED" },
    headers: { "Cache-Control": "no-store" },
  });
});

test("admin session confirms a signed cookie", async () => {
  const { routes } = handler();
  const token = createAdminSession(now);

  const result = await routes.session({
    method: "GET",
    headers: { cookie: `__Host-jangsa-admin=${token}` },
    body: null,
  });

  expect(result).toMatchObject({
    status: 200,
    body: { authenticated: true },
    headers: { "Cache-Control": "no-store" },
  });
});

test("logout always expires the administrator cookie", async () => {
  const { routes } = handler();

  const result = await routes.logout({
    method: "POST",
    headers: {},
    body: null,
  });

  expect(result.status).toBe(204);
  expect(result.headers?.["Set-Cookie"]).toContain("Max-Age=0");
  expect(result.headers?.["Cache-Control"]).toBe("no-store");
});

test("each route rejects unsupported methods with no-store and Allow", async () => {
  const { routes } = handler();

  await expect(
    routes.login({ method: "GET", headers: {} }),
  ).resolves.toMatchObject({
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
  await expect(
    routes.session({ method: "POST", headers: {} }),
  ).resolves.toMatchObject({
    status: 405,
    headers: { Allow: "GET", "Cache-Control": "no-store" },
  });
  await expect(
    routes.logout({ method: "GET", headers: {} }),
  ).resolves.toMatchObject({
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
});

test("the Supabase limiter maps only service-role RPC outcomes", async () => {
  const calls: Array<{ name: string; parameters: Record<string, unknown> }> =
    [];
  const store = createAdminDataStore({
    rpc: async (name: string, parameters: Record<string, unknown>) => {
      calls.push({ name, parameters });
      return { data: name !== "record_admin_login_failure", error: null };
    },
  });

  expect(await store.isAllowed("a".repeat(64))).toBe(true);
  expect(await store.recordFailure("b".repeat(64))).toBe(false);
  await expect(store.clearFailures("c".repeat(64))).resolves.toBeUndefined();
  expect(calls).toEqual([
    {
      name: "check_admin_login_attempt",
      parameters: { p_ip_hash: "a".repeat(64) },
    },
    {
      name: "record_admin_login_failure",
      parameters: { p_ip_hash: "b".repeat(64) },
    },
    {
      name: "clear_admin_login_failures",
      parameters: { p_ip_hash: "c".repeat(64) },
    },
  ]);
});

test("the Vercel login adapter applies a pure handler response", async () => {
  const data = limiter();
  const endpoint = createAdminLoginEndpoint({ data, now: () => now });
  const status = vi.fn().mockReturnThis();
  const end = vi.fn();
  const setHeader = vi.fn();

  await endpoint(
    {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.7" },
      body: { password: "correct horse battery staple" },
    } as never,
    { status, end, setHeader } as never,
  );

  expect(status).toHaveBeenCalledWith(204);
  expect(end).toHaveBeenCalledOnce();
  expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
});

function responseDouble() {
  const status = vi.fn().mockReturnThis();
  return { status, json: vi.fn(), end: vi.fn(), setHeader: vi.fn() };
}

async function withoutSupabaseConfiguration(run: () => Promise<void>) {
  const originalUrl = process.env.SUPABASE_URL;
  const serviceRoleKeyName = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
  const originalKey = process.env[serviceRoleKeyName];
  delete process.env.SUPABASE_URL;
  Reflect.deleteProperty(process.env, serviceRoleKeyName);
  try {
    await run();
  } finally {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) {
      Reflect.deleteProperty(process.env, serviceRoleKeyName);
    } else {
      Reflect.set(process.env, serviceRoleKeyName, originalKey);
    }
  }
}

test("a production login dependency failure becomes a generic no-store response", async () => {
  await withoutSupabaseConfiguration(async () => {
    const response = responseDouble();

    await createAdminLoginEndpoint()(
      {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.7" },
        body: { password: "correct horse battery staple" },
      } as never,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ error: "REQUEST_FAILED" });
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "no-store",
    );
  });
});

test("a production login retains 405 and Allow when dependency initialization fails", async () => {
  await withoutSupabaseConfiguration(async () => {
    const response = responseDouble();

    await createAdminLoginEndpoint()(
      { method: "GET", headers: {} } as never,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(405);
    expect(response.json).toHaveBeenCalledWith({ error: "METHOD_NOT_ALLOWED" });
    expect(response.setHeader).toHaveBeenCalledWith("Allow", "POST");
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "no-store",
    );
  });
});

test("production session and logout adapters do not require limiter configuration", async () => {
  await withoutSupabaseConfiguration(async () => {
    const sessionResponse = responseDouble();
    const logoutResponse = responseDouble();

    await createAdminSessionEndpoint()(
      { method: "GET", headers: {} } as never,
      sessionResponse as never,
    );
    await createAdminLogoutEndpoint()(
      { method: "POST", headers: {} } as never,
      logoutResponse as never,
    );

    expect(sessionResponse.status).toHaveBeenCalledWith(401);
    expect(sessionResponse.json).toHaveBeenCalledWith({
      error: "UNAUTHORIZED",
    });
    expect(sessionResponse.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "no-store",
    );
    expect(logoutResponse.status).toHaveBeenCalledWith(204);
    expect(logoutResponse.end).toHaveBeenCalledOnce();
    expect(logoutResponse.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "no-store",
    );
    expect(logoutResponse.setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      expect.stringContaining("Max-Age=0"),
    );
  });
});
