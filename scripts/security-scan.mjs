import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const disallowedViteSecret =
  /VITE_[A-Z0-9_]*(?:SERVICE_ROLE|INVITE_HASH_PEPPER)[A-Z0-9_]*/;
const exposedSupabaseSecret = /sb_secret_[A-Za-z0-9_-]{20,}/;
const serverSecretNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "INVITE_HASH_PEPPER",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_JWT_SECRET",
];
const serverSecretAssignment = new RegExp(
  `(?:"|')?\\b(?:${serverSecretNames.join("|")})\\b(?:"|')?\\s*(?:=|:)\\s*(?:"([^"]*)"|'([^']*)'|([^\\s,;#]+))`,
  "g",
);
const jwtLikeToken = /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const allowedPlaceholders = new Set([
  "<set-in-supabase-dashboard>",
  "<generate-and-store-securely>",
]);

function isPlaceholderOrReference(value) {
  const normalized = value.trim();
  if (normalized === "" || allowedPlaceholders.has(normalized)) return true;

  const shellReference = normalized.match(/^\$\{?([A-Z0-9_]+)\}?$/);
  if (shellReference) return serverSecretNames.includes(shellReference[1]);

  const denoReference = normalized.match(
    /^Deno\.env\.get\(["']([A-Z0-9_]+)["']\)$/,
  );
  if (denoReference) return serverSecretNames.includes(denoReference[1]);

  const propertyReference = normalized.match(
    /^(?:process\.env|import\.meta\.env|secrets)\.([A-Z0-9_]+)$/,
  );
  return propertyReference
    ? serverSecretNames.includes(propertyReference[1])
    : false;
}

function isServiceRoleJwt(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return false;
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    return claims.role === "service_role";
  } catch {
    return false;
  }
}

export function findSecretExposures(files) {
  const findings = [];
  for (const { file, source } of files) {
    if (disallowedViteSecret.test(source))
      findings.push(`${file}: Vite secret variable name`);
    if (exposedSupabaseSecret.test(source))
      findings.push(`${file}: Supabase secret token pattern`);

    serverSecretAssignment.lastIndex = 0;
    for (const match of source.matchAll(serverSecretAssignment)) {
      const value = match[1] ?? match[2] ?? match[3] ?? "";
      if (!isPlaceholderOrReference(value)) {
        findings.push(`${file}: server secret assignment`);
      }
    }

    jwtLikeToken.lastIndex = 0;
    for (const match of source.matchAll(jwtLikeToken)) {
      if (isServiceRoleJwt(match[0])) {
        findings.push(`${file}: legacy service-role JWT`);
      }
    }
  }
  return findings;
}

function run() {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .map((file) => ({ file, source: readFileSync(file, "utf8") }));
  const findings = findSecretExposures(trackedFiles);

  if (findings.length > 0) {
    console.error(
      "Security scan failed. Remove the following exposed configuration:",
    );
    for (const finding of findings) console.error(`- ${finding}`);
    process.exit(1);
  }

  console.log(
    "Security scan passed: no server-secret assignments or Supabase secret tokens found.",
  );
}

const isMain = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;
if (isMain) run();
