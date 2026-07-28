import {
  adminSessionCookie,
  createAdminSession,
  expiredAdminSessionCookie,
  hashAdminClientIp,
  readAdminCookie,
  verifyAdminPassword,
  verifyAdminSession,
} from "./admin-auth.js";
import type { AdminLoginLimiter } from "./admin-data.js";

export interface AdminHttpRequest {
  method?: string;
  headers: Record<string, string | readonly string[] | undefined>;
  body?: unknown;
}

export interface AdminHttpResponse {
  status: number;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

export interface AdminHandlerDependencies {
  data: AdminLoginLimiter;
  now?: () => Date;
}

export interface AdminHandler {
  (request: AdminHttpRequest): Promise<AdminHttpResponse>;
  login(request: AdminHttpRequest): Promise<AdminHttpResponse>;
  session(request: AdminHttpRequest): Promise<AdminHttpResponse>;
  logout(request: AdminHttpRequest): Promise<AdminHttpResponse>;
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
      const ipHash = hashAdminClientIp(header(request, "x-forwarded-for"));
      if (!(await dependencies.data.isAllowed(ipHash))) {
        return error(401, "LOGIN_FAILED");
      }
      if (!verifyAdminPassword(password)) {
        await dependencies.data.recordFailure(ipHash);
        return error(401, "LOGIN_FAILED");
      }
      await dependencies.data.clearFailures(ipHash);
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

  return Object.assign(login, { login, session, logout });
}
