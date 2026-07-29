import {
  adminSessionCookie,
  createAdminSession,
  expiredAdminSessionCookie,
  hashAdminClientIp,
  readAdminCookie,
  verifyAdminPassword,
  verifyAdminSession,
} from "./admin-auth.js";
import type {
  AdminDataStore,
  AdminLoginLimiter,
  AdminOverviewQuery,
} from "./admin-data.js";

export interface AdminHttpRequest {
  method?: string;
  headers: Record<string, string | readonly string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | readonly string[] | undefined>;
}

export interface AdminHttpResponse {
  status: number;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

export interface AdminHandlerDependencies {
  data?: AdminLoginLimiter &
    Partial<Pick<AdminDataStore, "overview" | "member">>;
  now?: () => Date;
}

export interface AdminHandler {
  (request: AdminHttpRequest): Promise<AdminHttpResponse>;
  login(request: AdminHttpRequest): Promise<AdminHttpResponse>;
  session(request: AdminHttpRequest): Promise<AdminHttpResponse>;
  logout(request: AdminHttpRequest): Promise<AdminHttpResponse>;
  overview(request: AdminHttpRequest): Promise<AdminHttpResponse>;
  member(request: AdminHttpRequest): Promise<AdminHttpResponse>;
}

function response(
  status: number,
  body?: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): AdminHttpResponse {
  return {
    status,
    headers: { ...extraHeaders, "Cache-Control": "no-store" },
    ...(body ? { body } : {}),
  };
}

function error(status: number, code: string): AdminHttpResponse {
  return response(status, { error: code });
}

function methodNotAllowed(allow: string): AdminHttpResponse {
  return response(405, { error: "METHOD_NOT_ALLOWED" }, { Allow: allow });
}

function header(request: AdminHttpRequest, name: string): string | undefined {
  const entry = Object.entries(request.headers).find(
    ([key]) => key.toLocaleLowerCase("en-US") === name,
  )?.[1];
  return typeof entry === "string" ? entry : entry?.[0];
}

function parseBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function passwordFrom(body: unknown): string | null {
  const value = parseBody(body);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "password") return null;
  const password = (value as Record<string, unknown>).password;
  return typeof password === "string" && password.length <= 256
    ? password
    : null;
}

function queryValue(
  request: AdminHttpRequest,
  key: string,
): string | null | undefined {
  const value = request.query?.[key];
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : null;
}

function overviewQuery(request: AdminHttpRequest): AdminOverviewQuery | null {
  const search = queryValue(request, "search");
  const duplicate = queryValue(request, "duplicate");
  const page = queryValue(request, "page");
  const pageSize = queryValue(request, "pageSize");
  if (
    search === null ||
    (search !== undefined && search.length > 100) ||
    duplicate === null ||
    (duplicate !== undefined &&
      duplicate !== "all" &&
      duplicate !== "high" &&
      duplicate !== "review")
  )
    return null;
  if (page === null || pageSize === null) return null;
  const positiveInteger = (
    value: string | undefined,
    fallback: number,
    maximum: number,
  ): number | null => {
    if (value === undefined || value === "") return fallback;
    if (!/^[1-9]\d*$/.test(value)) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number <= maximum ? number : null;
  };
  const parsedPage = positiveInteger(page, 1, 1_000_000);
  const parsedPageSize = positiveInteger(pageSize, 25, 50);
  if (parsedPage === null || parsedPageSize === null) return null;
  return {
    search: search ?? "",
    duplicate: duplicate ?? "all",
    page: parsedPage,
    pageSize: parsedPageSize,
  };
}

function memberId(request: AdminHttpRequest): string | null {
  const id = queryValue(request, "id");
  if (id === null || id === undefined) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  )
    ? id
    : null;
}

export function createAdminHandler(
  dependencies: AdminHandlerDependencies,
): AdminHandler {
  const login = async (
    request: AdminHttpRequest,
  ): Promise<AdminHttpResponse> => {
    if (request.method !== "POST") return methodNotAllowed("POST");
    const password = passwordFrom(request.body);
    if (password === null) return error(400, "INVALID_REQUEST");

    try {
      const data = dependencies.data;
      if (!data) return error(500, "REQUEST_FAILED");
      const ipHash = hashAdminClientIp(header(request, "x-forwarded-for"));
      if (!(await data.isAllowed(ipHash))) {
        return error(401, "LOGIN_FAILED");
      }
      if (!verifyAdminPassword(password)) {
        await data.recordFailure(ipHash);
        return error(401, "LOGIN_FAILED");
      }
      await data.clearFailures(ipHash);
      return response(204, undefined, {
        "Set-Cookie": adminSessionCookie(
          createAdminSession(dependencies.now?.() ?? new Date()),
        ),
      });
    } catch {
      return error(500, "REQUEST_FAILED");
    }
  };

  const session = async (
    request: AdminHttpRequest,
  ): Promise<AdminHttpResponse> => {
    if (request.method !== "GET") return methodNotAllowed("GET");
    try {
      const cookie = readAdminCookie(header(request, "cookie"));
      if (
        !cookie ||
        !verifyAdminSession(cookie, dependencies.now?.() ?? new Date())
      ) {
        return error(401, "UNAUTHORIZED");
      }
      return response(200, { authenticated: true });
    } catch {
      return error(500, "REQUEST_FAILED");
    }
  };

  const logout = async (
    request: AdminHttpRequest,
  ): Promise<AdminHttpResponse> => {
    if (request.method !== "POST") return methodNotAllowed("POST");
    return response(204, undefined, {
      "Set-Cookie": expiredAdminSessionCookie(),
    });
  };

  const isAuthenticated = (request: AdminHttpRequest): boolean => {
    const cookie = readAdminCookie(header(request, "cookie"));
    return Boolean(
      cookie && verifyAdminSession(cookie, dependencies.now?.() ?? new Date()),
    );
  };

  const overview = async (
    request: AdminHttpRequest,
  ): Promise<AdminHttpResponse> => {
    if (request.method !== "GET") return methodNotAllowed("GET");
    const query = overviewQuery(request);
    if (!query) return error(400, "INVALID_REQUEST");
    try {
      if (!isAuthenticated(request)) return error(401, "UNAUTHORIZED");
      if (!dependencies.data?.overview) return error(500, "REQUEST_FAILED");
      return response(200, { ...(await dependencies.data.overview(query)) });
    } catch {
      return error(500, "REQUEST_FAILED");
    }
  };

  const member = async (
    request: AdminHttpRequest,
  ): Promise<AdminHttpResponse> => {
    if (request.method !== "GET") return methodNotAllowed("GET");
    const id = memberId(request);
    if (!id) return error(400, "INVALID_REQUEST");
    try {
      if (!isAuthenticated(request)) return error(401, "UNAUTHORIZED");
      if (!dependencies.data?.member) return error(500, "REQUEST_FAILED");
      const detail = await dependencies.data.member(id);
      return detail ? response(200, { ...detail }) : error(404, "NOT_FOUND");
    } catch {
      return error(500, "REQUEST_FAILED");
    }
  };

  return Object.assign(login, { login, session, logout, overview, member });
}
