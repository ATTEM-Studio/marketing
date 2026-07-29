import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("deployment configuration", () => {
  test("uses the repository base path in GitHub Actions", () => {
    const source = readFileSync("vite.config.ts", "utf8");
    expect(source).toContain(
      'process.env.GITHUB_ACTIONS ? "/marketing/" : "/"',
    );
  });

  test("never exposes service role configuration to Vite", () => {
    const envExample = readFileSync(".env.example", "utf8");
    expect(envExample).not.toMatch(
      /^VITE_[A-Z0-9_]*(?:SERVICE_ROLE|INVITE_HASH_PEPPER)/mu,
    );
  });

  test("never exposes administrator credential configuration to browser builds", () => {
    const config = readFileSync("src/config.ts", "utf8");
    const viteConfig = readFileSync("vite.config.ts", "utf8");
    const adminEnvironment = /ADMIN_(?:DASHBOARD_PASSWORD|SESSION_SECRET)/;

    expect(config).not.toMatch(adminEnvironment);
    expect(viteConfig).not.toMatch(adminEnvironment);
  });
});
