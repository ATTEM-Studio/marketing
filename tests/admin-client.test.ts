import { afterEach, expect, test, vi } from "vitest";
import { AdminApiError, adminApi } from "../src/admin/api";
import type { AdminOverviewQuery } from "../src/admin/types";

const defaultQuery: AdminOverviewQuery = {
  search: "김밥",
  duplicate: "review",
  page: 2,
  pageSize: 25,
};

const fetchMock = vi.fn<typeof fetch>();

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

test("sends same-origin cookies and maps an expired overview session", async () => {
  fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(adminApi.overview(defaultQuery)).rejects.toMatchObject({
    code: "unauthorized",
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/admin-overview?search=%EA%B9%80%EB%B0%A5&duplicate=review&page=2&pageSize=25",
    expect.objectContaining({ credentials: "same-origin", method: "GET" }),
  );
});

test("serializes the password only for the same-origin login endpoint", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(adminApi.login("admin password")).resolves.toBeUndefined();
  expect(fetchMock).toHaveBeenCalledWith("/api/admin-login", {
    credentials: "same-origin",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "admin password" }),
  });
});

test("normalizes rate limits and invalid responses", async () => {
  fetchMock
    .mockResolvedValueOnce(new Response("{}", { status: 429 }))
    .mockResolvedValueOnce(new Response("{}", { status: 400 }))
    .mockResolvedValueOnce(new Response("not json", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(adminApi.session()).rejects.toMatchObject({ code: "locked" });
  await expect(adminApi.member("not-a-uuid")).rejects.toMatchObject({
    code: "invalid",
  });
  await expect(adminApi.session()).rejects.toMatchObject({ code: "invalid" });
});

test("normalizes fetch failures as network errors", async () => {
  fetchMock.mockRejectedValue(new TypeError("offline"));
  vi.stubGlobal("fetch", fetchMock);

  await expect(adminApi.logout()).rejects.toBeInstanceOf(AdminApiError);
  await expect(adminApi.logout()).rejects.toMatchObject({ code: "network" });
});

test("keeps dashboard abort ownership isolated across reopen", async () => {
  const pending = new Promise<Response>(() => undefined);
  fetchMock.mockReturnValueOnce(pending).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        totals: { total: 0, today: 0, last7Days: 0, last30Days: 0 },
        daily: [],
        members: [],
        page: 1,
        pageSize: 25,
        totalRows: 0,
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const firstDashboard = adminApi.dashboardScope();

  void firstDashboard.overview(defaultQuery);
  firstDashboard.dispose();
  const secondDashboard = adminApi.dashboardScope();
  await secondDashboard.overview({ ...defaultQuery, search: "서울" });

  const firstSignal = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)
    ?.signal;
  const secondSignal = (fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)
    ?.signal;
  expect(firstSignal?.aborted).toBe(true);
  expect(secondSignal?.aborted).toBe(false);
});
