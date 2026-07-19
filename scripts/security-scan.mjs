import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const findings = [];
const disallowedViteSecret =
  /VITE_[A-Z0-9_]*(?:SERVICE_ROLE|INVITE_HASH_PEPPER)[A-Z0-9_]*/;
const exposedSupabaseSecret = /sb_secret_[A-Za-z0-9_-]{20,}/;

for (const file of trackedFiles) {
  const source = readFileSync(file, "utf8");
  if (disallowedViteSecret.test(source))
    findings.push(`${file}: Vite secret variable name`);
  if (exposedSupabaseSecret.test(source))
    findings.push(`${file}: Supabase secret token pattern`);

  if (file === ".env.example") {
    for (const line of source.split(/\r?\n/)) {
      if (
        /^\s*(?:VITE_)?(?:SUPABASE_)?(?:SERVICE_ROLE|INVITE_HASH_PEPPER)[A-Z0-9_]*\s*=/.test(
          line,
        )
      ) {
        findings.push(`${file}: server secret assignment`);
      }
    }
  }
}

if (findings.length > 0) {
  console.error(
    "Security scan failed. Remove the following exposed configuration:",
  );
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(
  "Security scan passed: no Vite server-secret variables or Supabase secret tokens found.",
);
