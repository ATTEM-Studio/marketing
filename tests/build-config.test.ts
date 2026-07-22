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
});
