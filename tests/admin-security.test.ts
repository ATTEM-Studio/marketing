import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const adminEnvironment = /ADMIN_(?:DASHBOARD_PASSWORD|SESSION_SECRET)/;
const memberPiiLogging =
  /console\.(?:log|info|debug|warn|error)\([^)]*(?:email|business_name|input_data)/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true })
    .filter(
      (entry): entry is string =>
        typeof entry === "string" && entry.endsWith(".ts"),
    )
    .map((entry) => join(directory, entry));
}

describe("administrator security boundary", () => {
  test("keeps administrator environment names out of browser and Vite paths", () => {
    const browserAndViteSources = [
      ...sourceFiles("src").map((file) => readFileSync(file, "utf8")),
      readFileSync("vite.config.ts", "utf8"),
    ];

    expect(
      browserAndViteSources.some((source) => adminEnvironment.test(source)),
    ).toBe(false);
  });

  test("keeps service keys and member fields out of administrator logs", () => {
    const administratorSources = sourceFiles("api").map((file) =>
      readFileSync(file, "utf8"),
    );

    expect(
      administratorSources.some((source) =>
        /console\.(?:log|info|debug|warn|error)\([^)]*SUPABASE_SERVICE_ROLE_KEY/.test(
          source,
        ),
      ),
    ).toBe(false);
    expect(
      administratorSources.some((source) => memberPiiLogging.test(source)),
    ).toBe(false);
  });

  test("keeps coaching message queries and payloads outside administrator data", () => {
    const source = readFileSync("api/_lib/admin-data.ts", "utf8");

    expect(source).not.toMatch(/from\(["']coaching_messages["']\)/);
    expect(source).not.toMatch(/coaching_messages/);
  });
});
