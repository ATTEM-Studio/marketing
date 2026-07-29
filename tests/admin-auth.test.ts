import { createHmac, timingSafeEqual } from "node:crypto";
import { expect, test } from "vitest";

const adminPasswordName = ["ADMIN", "DASHBOARD", "PASSWORD"].join("_");
const adminSessionName = ["ADMIN", "SESSION", "SECRET"].join("_");
const adminPassword = ["correct", "horse", "battery", "staple"].join(" ");
const adminSessionSecret = [
  "test",
  "only",
  "administrator",
  "session",
  "secret",
].join("-");

Object.assign(process.env, {
  [adminPasswordName]: adminPassword,
  [adminSessionName]: adminSessionSecret,
});

const {
  adminSessionCookie,
  createAdminSession,
  expiredAdminSessionCookie,
  hashAdminClientIp,
  readAdminCookie,
  safeEqual,
  verifyAdminPassword,
  verifyAdminSession,
} = await import("../api/_lib/admin-auth");

test("accepts a signed token for two hours and rejects tampering", () => {
  const token = createAdminSession(new Date("2026-07-28T00:00:00Z"));

  expect(verifyAdminSession(token, new Date("2026-07-28T01:59:59Z"))).toBe(
    true,
  );
  expect(
    verifyAdminSession(`${token}x`, new Date("2026-07-28T01:00:00Z")),
  ).toBe(false);
  expect(verifyAdminSession(token, new Date("2026-07-28T02:00:00Z"))).toBe(
    false,
  );
});

test("rejects a validly signed session whose expiry is not exactly two hours after issue", () => {
  const payload = Buffer.from(
    JSON.stringify({ v: 1, iat: 1_785_196_800, exp: 1_785_204_001 }),
  ).toString("base64url");
  const signature = createHmac("sha256", adminSessionSecret)
    .update(payload)
    .digest("base64url");

  expect(
    verifyAdminSession(
      `${payload}.${signature}`,
      new Date("2026-07-28T00:01:00Z"),
    ),
  ).toBe(false);
});

test("uses a hardened host-only session cookie", () => {
  const cookie = adminSessionCookie("signed");

  expect(cookie).toContain("__Host-jangsa-admin=signed");
  expect(cookie).toContain("Path=/");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=Strict");
  expect(cookie).toContain("Max-Age=7200");
  expect(cookie).not.toContain("Domain=");
  expect(expiredAdminSessionCookie()).toContain("Max-Age=0");
});

test("reads only the administrator cookie from a mixed cookie header", () => {
  expect(
    readAdminCookie("theme=dark; __Host-jangsa-admin=signed-token; lang=ko"),
  ).toBe("signed-token");
  expect(readAdminCookie("other=value")).toBeNull();
});

test("verifies the configured password without accepting an unequal value", () => {
  expect(verifyAdminPassword(adminPassword)).toBe(true);
  expect(verifyAdminPassword(`${adminPassword}!`)).toBe(false);
});

test("compares fixed-length digests for equal and unequal-length candidates", () => {
  const comparedLengths: Array<[number, number]> = [];
  const compare = (left: Uint8Array, right: Uint8Array) => {
    comparedLengths.push([left.byteLength, right.byteLength]);
    return timingSafeEqual(left, right);
  };

  expect(safeEqual(adminPassword, adminPassword, compare)).toBe(true);
  expect(safeEqual("short", `${adminPassword}!`, compare)).toBe(false);
  expect(comparedLengths).toEqual([
    [32, 32],
    [32, 32],
  ]);
});

test("hashes a forwarded client IP before the data boundary", () => {
  const expected = createHmac("sha256", adminSessionSecret)
    .update("203.0.113.7")
    .digest("hex");

  expect(hashAdminClientIp("203.0.113.7, 198.51.100.1")).toBe(expected);
  expect(hashAdminClientIp("203.0.113.7")).toMatch(/^[a-f0-9]{64}$/u);
});
