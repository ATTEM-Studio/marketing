import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";

type WorkflowStep = {
  if?: string;
  id?: string;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
};

type WorkflowJob = {
  environment?: Record<string, unknown>;
  needs?: string;
  steps?: WorkflowStep[];
};

type Workflow = {
  jobs?: Record<string, WorkflowJob>;
  on?: {
    pull_request?: unknown;
    push?: { branches?: string[] };
    workflow_dispatch?: unknown;
  };
  permissions?: Record<string, string>;
};

const parseWorkflow = (source: string): Workflow => parse(source) as Workflow;
const readWorkflow = (filename: string): Workflow =>
  parseWorkflow(readFileSync(`.github/workflows/${filename}`, "utf8"));
const stepsFor = (workflow: Workflow, jobName: string): WorkflowStep[] => {
  const steps = workflow.jobs?.[jobName]?.steps;
  expect(steps).toBeDefined();
  return steps ?? [];
};
const findUse = (
  steps: WorkflowStep[],
  action: string,
): WorkflowStep | undefined => steps.find((step) => step.uses === action);
const findRun = (
  steps: WorkflowStep[],
  command: string,
): WorkflowStep | undefined =>
  steps.find((step) => step.run?.includes(command));

describe("GitHub Actions delivery contracts", () => {
  test("verifies pull requests and main with the pinned toolchain", () => {
    const workflow = readWorkflow("ci.yml");
    expect(workflow.on).toHaveProperty("pull_request");
    expect(workflow.on?.push?.branches).toEqual(["main"]);
    expect(workflow.permissions).toEqual({ contents: "read" });

    const steps = stepsFor(workflow, "verify");
    expect(findUse(steps, "actions/checkout@v4")?.with).toMatchObject({
      "persist-credentials": false,
    });
    expect(findUse(steps, "pnpm/action-setup@v4")?.with).toMatchObject({
      version: "11.9.0",
    });
    expect(findUse(steps, "actions/setup-node@v4")?.with).toMatchObject({
      "node-version": 24,
      cache: "pnpm",
    });
    expect(findRun(steps, "pnpm install --frozen-lockfile")).toBeDefined();
    expect(findRun(steps, "pnpm verify")).toBeDefined();
  });

  test("blocks merges when Supabase database contracts fail", () => {
    const workflow = readWorkflow("ci.yml");
    const steps = stepsFor(workflow, "database");
    expect(findUse(steps, "actions/checkout@v4")?.with).toMatchObject({
      "persist-credentials": false,
    });
    expect(findUse(steps, "supabase/setup-cli@v1")?.with).toMatchObject({
      version: "2.109.1",
    });
    expect(findRun(steps, "supabase start")).toBeDefined();
    expect(findRun(steps, "supabase db reset")).toBeDefined();
    expect(findRun(steps, "supabase test db")).toBeDefined();

    const smoke = findRun(steps, "supabase functions serve --no-verify-jwt");
    expect(smoke?.run).toContain("/functions/v1/redeem-invite");
    expect(smoke?.run).toContain('status="000"');
    expect(smoke?.run).toContain("|| true");

    const cleanup = findRun(steps, "supabase stop --no-backup");
    expect(cleanup?.if).toBe("always()");
  });

  test("deploys only an ordered synthetic demo artifact to GitHub Pages", () => {
    const workflow = readWorkflow("pages.yml");
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.on?.push?.branches).toEqual(["main"]);
    expect(workflow.permissions).toEqual({
      contents: "read",
      pages: "write",
      "id-token": "write",
    });

    const buildSteps = stepsFor(workflow, "build");
    expect(findUse(buildSteps, "actions/checkout@v4")?.with).toMatchObject({
      "persist-credentials": false,
    });
    const configureIndex = buildSteps.findIndex(
      (step) => step.uses === "actions/configure-pages@v5",
    );
    const buildIndex = buildSteps.findIndex((step) =>
      step.run?.includes("VITE_APP_MODE=demo pnpm build"),
    );
    const uploadIndex = buildSteps.findIndex(
      (step) => step.uses === "actions/upload-pages-artifact@v4",
    );
    expect(configureIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeGreaterThan(configureIndex);
    expect(uploadIndex).toBeGreaterThan(buildIndex);
    expect(buildSteps[uploadIndex]?.with).toMatchObject({ path: "dist" });

    expect(workflow.jobs?.deploy?.needs).toBe("build");
    expect(
      findUse(stepsFor(workflow, "deploy"), "actions/deploy-pages@v4"),
    ).toMatchObject({
      id: "deployment",
    });
  });

  test("does not accept action names that appear only in YAML comments", () => {
    const fixture = parseWorkflow(`
name: Comment-only actions
on:
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      # - uses: actions/configure-pages@v5
      # - uses: actions/upload-pages-artifact@v4
      - run: VITE_APP_MODE=demo pnpm build
`);

    const steps = stepsFor(fixture, "build");
    expect(findUse(steps, "actions/configure-pages@v5")).toBeUndefined();
    expect(findUse(steps, "actions/upload-pages-artifact@v4")).toBeUndefined();
  });
});
