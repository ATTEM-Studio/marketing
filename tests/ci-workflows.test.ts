import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const readWorkflow = (filename: string): string => {
  const path = `.github/workflows/${filename}`;
  expect(existsSync(path)).toBe(true);
  return readFileSync(path, "utf8");
};

describe("GitHub Actions delivery contracts", () => {
  test("verifies pull requests and main with the pinned toolchain", () => {
    const source = readWorkflow("ci.yml");
    expect(source).toContain("pull_request:");
    expect(source).toContain("branches: [main]");
    expect(source).toContain("actions/checkout@v4");
    expect(source).toContain("pnpm/action-setup@v4");
    expect(source).toContain("version: 11.9.0");
    expect(source).toContain("actions/setup-node@v4");
    expect(source).toContain("node-version: 24");
    expect(source).toContain("cache: pnpm");
    expect(source).toContain("pnpm install --frozen-lockfile");
    expect(source).toContain("pnpm verify");
  });

  test("deploys only a synthetic demo artifact to GitHub Pages", () => {
    const source = readWorkflow("pages.yml");
    expect(source).toContain("workflow_dispatch:");
    expect(source).toContain("contents: read");
    expect(source).toContain("pages: write");
    expect(source).toContain("id-token: write");
    expect(source).toContain("VITE_APP_MODE=demo pnpm build");
    expect(source).toContain("actions/upload-pages-artifact@v3");
    expect(source).toContain("path: dist");
    expect(source).toContain("actions/deploy-pages@v4");
  });
});
