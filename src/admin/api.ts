import type {
  AdminMemberDetail,
  AdminOverview,
  AdminOverviewQuery,
  AdminSession,
} from "./types";

export type AdminApiErrorCode =
  "unauthorized" | "locked" | "invalid" | "network";

export class AdminApiError extends Error {
  constructor(public readonly code: AdminApiErrorCode) {
    super(code);
    this.name = "AdminApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new AdminApiError("network");
  }

  if (response.status === 401) throw new AdminApiError("unauthorized");
  if (response.status === 429) throw new AdminApiError("locked");
  if (!response.ok) {
    throw new AdminApiError(
      response.status >= 400 && response.status < 500 ? "invalid" : "network",
    );
  }
  if (response.status === 204) return undefined as T;

  try {
    return (await response.json()) as T;
  } catch {
    throw new AdminApiError("invalid");
  }
}

function overviewPath(query: AdminOverviewQuery): string {
  const search = new URLSearchParams({
    search: query.search,
    duplicate: query.duplicate,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  return `/api/admin-overview?${search}`;
}

let overviewAbort: AbortController | null = null;
let memberAbort: AbortController | null = null;

export const adminApi = {
  login(password: string): Promise<void> {
    return request("/api/admin-login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },
  session(): Promise<AdminSession> {
    return request("/api/admin-session", { method: "GET" });
  },
  logout(): Promise<void> {
    return request("/api/admin-logout", { method: "POST" });
  },
  overview(query: AdminOverviewQuery): Promise<AdminOverview> {
    overviewAbort?.abort();
    overviewAbort = new AbortController();
    return request(overviewPath(query), {
      method: "GET",
      signal: overviewAbort.signal,
    });
  },
  member(id: string): Promise<AdminMemberDetail> {
    memberAbort?.abort();
    memberAbort = new AbortController();
    return request(`/api/admin-member?id=${encodeURIComponent(id)}`, {
      method: "GET",
      signal: memberAbort.signal,
    });
  },
};
