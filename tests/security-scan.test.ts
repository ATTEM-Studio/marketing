import { describe, expect, test } from "vitest";
import * as securityScan from "../scripts/security-scan.mjs";

const serviceRoleName = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
const pepperName = ["INVITE", "HASH", "PEPPER"].join("_");
const accessTokenName = ["SUPABASE", "ACCESS", "TOKEN"].join("_");
const liveValue = ["real", "server", "secret", "value"].join("-");

describe("security scan", () => {
  test("exports a reusable tracked-source scanner", () => {
    expect(typeof securityScan.findSecretExposures).toBe("function");
  });

  test("rejects server-secret assignments in any tracked file", () => {
    const findings = securityScan.findSecretExposures([
      { file: "notes.txt", source: `${serviceRoleName}=${liveValue}` },
      { file: "config.yml", source: `${pepperName}: "${liveValue}"` },
      { file: "script.sh", source: `export ${accessTokenName}='${liveValue}'` },
    ]);

    expect(findings).toHaveLength(3);
    expect(
      findings.every((finding) => finding.includes("server secret assignment")),
    ).toBe(true);
  });

  test("rejects quoted JSON and object-key server-secret assignments", () => {
    const findings = securityScan.findSecretExposures([
      {
        file: "config.json",
        source: JSON.stringify({ [serviceRoleName]: liveValue }),
      },
      {
        file: "config.ts",
        source: `({ "${pepperName}": "${liveValue}" })`,
      },
    ]);

    expect(findings).toHaveLength(2);
  });

  test("does not treat a placeholder-looking prefix as a safe value", () => {
    const findings = securityScan.findSecretExposures([
      {
        file: "config.env",
        source: `${pepperName}=${["generate", liveValue].join("-")}`,
      },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("server secret assignment");
  });

  test("rejects Supabase secret tokens and legacy service-role JWTs", () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ role: ["service", "role"].join("_") }),
    ).toString("base64url");
    const legacyToken = `${header}.${payload}.${"x".repeat(32)}`;
    const modernToken = `${["sb", "secret"].join("_")}_${"a".repeat(24)}`;
    const findings = securityScan.findSecretExposures([
      { file: "legacy.txt", source: legacyToken },
      { file: "modern.txt", source: modernToken },
    ]);

    expect(
      findings.some((finding) => finding.includes("service-role JWT")),
    ).toBe(true);
    expect(
      findings.some((finding) => finding.includes("Supabase secret token")),
    ).toBe(true);
  });

  test("rejects committed OpenAI API key values", () => {
    const openAiKey = ["sk", "proj", "a".repeat(48)].join("-");
    const findings = securityScan.findSecretExposures([
      { file: "notes.txt", source: openAiKey },
    ]);

    expect(findings.some((finding) => finding.includes("OpenAI API key"))).toBe(
      true,
    );
  });

  test("allows secret-name documentation, environment reads, and placeholders", () => {
    const findings = securityScan.findSecretExposures([
      {
        file: "README.md",
        source: [
          `Store ${serviceRoleName} and ${pepperName} only in function secrets.`,
          `${serviceRoleName}='<set-in-supabase-dashboard>'`,
          `${pepperName}='<generate-and-store-securely>'`,
        ].join("\n"),
      },
      {
        file: "function.ts",
        source: [
          `Deno.env.get("${serviceRoleName}"); Deno.env.get("${pepperName}");`,
          `${serviceRoleName}=\${${serviceRoleName}}`,
          `${pepperName}=Deno.env.get("${pepperName}")`,
        ].join("\n"),
      },
    ]);

    expect(findings).toEqual([]);
  });

  test("allows an empty documented server variable before another variable", () => {
    const findings = securityScan.findSecretExposures([
      {
        file: ".env.example",
        source: `${serviceRoleName}=\nOPENAI_API_KEY=\n`,
      },
    ]);

    expect(findings).toEqual([]);
  });

  test("rejects server-secret names exposed through Vite", () => {
    const viteServiceRoleName = ["VITE", serviceRoleName].join("_");
    const viteOpenAiName = ["VITE", "OPENAI", "API", "KEY"].join("_");
    const findings = securityScan.findSecretExposures([
      {
        file: "service-role.env",
        source: `${viteServiceRoleName}=placeholder`,
      },
      {
        file: "openai.env",
        source: `${viteOpenAiName}=placeholder`,
      },
    ]);

    expect(
      findings.filter((finding) =>
        finding.includes("Vite secret variable name"),
      ),
    ).toHaveLength(2);
  });

  test("rejects renamed Vite variables that retain server-secret indicators", () => {
    const backupOpenAiName = ["VITE", "BACKUP", "OPENAI", "API", "KEY"].join(
      "_",
    );
    const internalServiceRoleName = [
      "VITE",
      "INTERNAL",
      "SERVICE",
      "ROLE",
      "TOKEN",
    ].join("_");
    const findings = securityScan.findSecretExposures([
      { file: "backup.env", source: `${backupOpenAiName}=placeholder` },
      {
        file: "internal.env",
        source: `${internalServiceRoleName}=placeholder`,
      },
    ]);

    expect(
      findings.filter((finding) =>
        finding.includes("Vite secret variable name"),
      ),
    ).toHaveLength(2);
  });

  test("allows the documented public Vite variables", () => {
    const findings = securityScan.findSecretExposures([
      {
        file: ".env.example",
        source: [
          "VITE_APP_MODE=live",
          "VITE_SUPABASE_URL=https://example.supabase.co",
          "VITE_SUPABASE_ANON_KEY=publishable-placeholder",
        ].join("\n"),
      },
    ]);

    expect(findings).toEqual([]);
  });
});
