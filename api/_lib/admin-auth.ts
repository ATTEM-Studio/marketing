import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SECONDS = 2 * 60 * 60;
const COOKIE_NAME = "__Host-jangsa-admin";

interface AdminSessionPayload {
  v: 1;
  iat: number;
  exp: number;
}

function requiredEnvironment(
  name: "ADMIN_DASHBOARD_PASSWORD" | "ADMIN_SESSION_SECRET",
): string {
  const value = process.env[name];
  if (!value) throw new Error("ADMIN_SERVER_ENV_MISSING");
  return value;
}

function requiredSessionSecret(): string {
  return requiredEnvironment("ADMIN_SESSION_SECRET");
}

type SafeComparison = (left: Uint8Array, right: Uint8Array) => boolean;

export function safeEqual(
  left: string,
  right: string,
  compare: SafeComparison = timingSafeEqual,
): boolean {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();
  return compare(leftDigest, rightDigest);
}

function signature(payload: string): string {
  return createHmac("sha256", requiredSessionSecret())
    .update(payload)
    .digest("base64url");
}

function validSessionPayload(value: unknown): value is AdminSessionPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (
    Object.keys(payload).length === 3 &&
    payload.v === 1 &&
    typeof payload.iat === "number" &&
    typeof payload.exp === "number" &&
    Number.isSafeInteger(payload.iat) &&
    Number.isSafeInteger(payload.exp) &&
    payload.exp === payload.iat + MAX_AGE_SECONDS
  );
}

export function verifyAdminPassword(password: string): boolean {
  return safeEqual(password, requiredEnvironment("ADMIN_DASHBOARD_PASSWORD"));
}

export function createAdminSession(now = new Date()): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ v: 1, iat: issuedAt, exp: issuedAt + MAX_AGE_SECONDS }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyAdminSession(token: string, now = new Date()): boolean {
  const match = token.match(/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u);
  if (!match) return false;
  const [, payload, providedSignature] = match;
  if (
    !payload ||
    !providedSignature ||
    !safeEqual(providedSignature, signature(payload))
  ) {
    return false;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as unknown;
    if (!validSessionPayload(decoded)) return false;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    return decoded.iat <= nowSeconds && nowSeconds < decoded.exp;
  } catch {
    return false;
  }
}

export function readAdminCookie(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(";")) {
    const [name, ...value] = item.trim().split("=");
    if (name === COOKIE_NAME && value.length === 1 && value[0]) {
      return value[0];
    }
  }
  return null;
}

function cookie(value: string, maxAge: number): string {
  return [
    `${COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

export function adminSessionCookie(token: string): string {
  return cookie(token, MAX_AGE_SECONDS);
}

export function expiredAdminSessionCookie(): string {
  return cookie("", 0);
}

export function hashAdminClientIp(forwardedFor: string | undefined): string {
  const clientIp = forwardedFor?.split(",")[0]?.trim() ?? "";
  return createHmac("sha256", requiredSessionSecret())
    .update(clientIp)
    .digest("hex");
}
