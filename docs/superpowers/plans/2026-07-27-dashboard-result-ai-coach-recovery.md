# Dashboard Result and AI Coach Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let owners reopen their latest full diagnosis, ask the AI coach directly from the dashboard, and restore the production coaching endpoint that currently fails before reaching OpenAI.

**Architecture:** Extract one pure result-model builder shared by new and persisted diagnoses. Extend dashboard routing with read-only result and optional initial coaching questions. Keep the current Vercel Function architecture, but make its complete server import graph valid Node ESM and verify the emitted artifact can be imported before deployment.

**Tech Stack:** TypeScript 5.9, Vite 8, Vitest 4, Happy DOM, Vercel Node Functions, Supabase JS 2.110.7, OpenAI Responses API, pnpm 11

## Global Constraints

- Only a completed, untampered latest assessment can expose result or AI entry points.
- Reopened results are read-only and never show `7일 행동으로 저장하기`.
- Dashboard questions and coaching-page questions share the same 500-character validation and `askCoach` request path.
- An initial dashboard question is automatically submitted exactly once.
- Failed questions remain retryable through the existing identical-request retry behavior.
- The production AI endpoint stays at `/api/coaching`.
- Local server imports use JavaScript output specifiers compatible with Node ESM; the project remains `"type": "module"`.
- OpenAI and Supabase server credentials remain server-only environment variables.
- Logs must not contain question bodies, bearer tokens, API keys, or external response bodies.
- Existing rule-based fallback remains available when OpenAI classification or narrative selection fails.

---

## File Structure

- Create `src/result-view-model.ts`: build a `ResultViewModel` from diagnosis input and safely restore one from a completed `AssessmentSnapshot`.
- Create `tests/result-view-model.test.ts`: protect saved-result restoration and invalid-data refusal.
- Modify `src/app.ts`: use the shared result builder and route dashboard callbacks to read-only results and coaching with an initial question.
- Modify `src/ui/result.ts`: support an optional dashboard back action independently from action-plan saving.
- Modify `src/ui/dashboard.ts`: render and bind latest-result and dashboard AI-question entry points.
- Modify `src/ui/coaching.ts`: put direct questions first and auto-submit an optional initial question once.
- Modify `src/styles.css`: style the dashboard AI card, result navigation, reordered coaching UI, and mobile layout.
- Modify `tests/dashboard-ui.test.ts`, `tests/live-app.test.ts`, `tests/coaching-ui.test.ts`, and `tests/responsive-styles.test.ts`: cover the new navigation and question flow.
- Create `tests/vercel-function-esm.test.ts`: emit and import the real Vercel function graph as Node ESM.
- Modify local imports in `api/coaching.ts`, `api/_lib/*.ts`, `src/coaching/{completion,content,context,rules}.ts`, and `src/domain/{bottleneck,recommendation,restaurant,revenue}.ts`.
- Modify `api/_lib/coaching-handler.ts`: add a safe error-code-only server log.
- Modify `tests/coaching-api.test.ts`: verify safe logging.

### Task 1: Share and restore the diagnosis result model

**Files:**

- Create: `src/result-view-model.ts`
- Create: `tests/result-view-model.test.ts`
- Modify: `src/app.ts`
- Test: `tests/result-view-model.test.ts`
- Test: `tests/diagnosis-ui.test.ts`

**Interfaces:**

- Consumes: `DiagnosisInput`, `AssessmentSnapshot`, `isCompletedPersistedAssessment`, and existing revenue, bottleneck, restaurant, and recommendation domain functions.
- Produces:
  - `buildDiagnosisOutcome(input: DiagnosisInput): DiagnosisOutcome`
  - `restoreResultViewModel(assessment: AssessmentSnapshot): ResultViewModel | null`

- [ ] **Step 1: Write failing saved-result restoration tests**

Create `tests/result-view-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { restoreResultViewModel } from "../src/result-view-model";
import { createAuthenticAssessment } from "./fixtures/authentic-assessment";

describe("result view model", () => {
  it("restores the saved customer target, daily target, and recommendation", () => {
    const assessment = createAuthenticAssessment();

    expect(restoreResultViewModel(assessment)).toMatchObject({
      metrics: {
        shortfallRevenue: 2_000_000,
        maxNewCustomers: 100,
        maxNewCustomersPerDay: 4,
      },
      action: { key: assessment.diagnosis.actionKey },
      effectiveCapacity: assessment.diagnosis.effectiveCapacity,
    });
  });

  it("refuses incomplete or tampered persisted assessments", () => {
    const incomplete = createAuthenticAssessment();
    incomplete.diagnosis = {};
    const tampered = createAuthenticAssessment();
    tampered.metrics.newCustomerTarget = 999;

    expect(restoreResultViewModel(incomplete)).toBeNull();
    expect(restoreResultViewModel(tampered)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/result-view-model.test.ts
```

Expected: FAIL because `src/result-view-model.ts` does not exist.

- [ ] **Step 3: Implement the shared result builder**

Create `src/result-view-model.ts` with:

```ts
export interface DiagnosisOutcome {
  model: ResultViewModel;
  persistedMetrics: Record<string, unknown>;
  persistedDiagnosis: Record<string, unknown>;
}
```

`buildDiagnosisOutcome` performs the calculation currently embedded in `showDiagnosis`:

```ts
export function buildDiagnosisOutcome(input: DiagnosisInput): DiagnosisOutcome {
  const metrics = calculateRevenueMetrics(input.revenue);
  const allocation = normalizeGoalAllocation(input.allocation);
  const newCustomerTarget = allocationNewCustomerTarget(
    metrics.maxNewCustomers,
    input.revenue.averageOrderValue,
    allocation,
  );
  const advertising = calculateAdvertisingMetrics(
    newCustomerTarget,
    input.advertising,
  );
  const bottleneck = selectBottleneck(input.bottleneck);
  const restaurant = analyzeRestaurantOperations(
    input.restaurant,
    metrics.maxNewCustomersPerDay,
  );
  const effectiveCapacity = resolveEffectiveCapacity(
    input.capacity,
    restaurant.status,
  );
  const action = selectAction({
    ...input,
    capacity: effectiveCapacity,
    metrics,
    bottleneck,
  });
  const hasAdvertisingInputs = Object.values(input.advertising).some(
    (value) => value !== null,
  );
  const hasRestaurantInputs = [
    input.restaurant.seats,
    input.restaurant.hallHours,
    input.restaurant.peakOccupancy,
    input.restaurant.averagePartySize,
    input.restaurant.averageStayBand,
    input.restaurant.channelShares.dineIn,
    input.restaurant.channelShares.takeout,
    input.restaurant.channelShares.delivery,
  ].some((value) => value !== null);

  const model: ResultViewModel = {
    effectiveCapacity,
    metrics,
    allocation,
    ...(input.adsRunning || hasAdvertisingInputs
      ? { advertising, advertisingInputs: input.advertising }
      : {}),
    ...(hasRestaurantInputs ? { restaurant } : {}),
    bottleneck,
    action,
  };
  return {
    model,
    persistedMetrics: {
      ...metrics,
      newCustomerTarget,
      advertising,
      restaurant,
    },
    persistedDiagnosis: {
      bottleneck,
      actionKey: action.key,
      effectiveCapacity,
    },
  };
}
```

`restoreResultViewModel` first calls `isCompletedPersistedAssessment` using the same persisted row shape as the dashboard. Return `null` on failed validation. On success, cast `assessment.inputs` to `DiagnosisInput`, call `buildDiagnosisOutcome`, and return `null` unless `persistedMetrics` and `persistedDiagnosis` exactly match the stored completed snapshot.

- [ ] **Step 4: Replace duplicated result calculation in `src/app.ts`**

Import and call `buildDiagnosisOutcome(input)`. Save `outcome.persistedMetrics` and `outcome.persistedDiagnosis` in the existing assessment payload, retain the normalized allocation already present in `outcome.model`, and pass `outcome.model` directly to `renderResult`.

- [ ] **Step 5: Run result and diagnosis tests**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/result-view-model.test.ts tests/diagnosis-ui.test.ts tests/coaching-assessment-completion.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/result-view-model.ts src/app.ts tests/result-view-model.test.ts
git commit -m "refactor: share persisted diagnosis result model"
```

### Task 2: Reopen the latest diagnosis as a read-only result

**Files:**

- Modify: `src/ui/result.ts`
- Modify: `src/ui/dashboard.ts`
- Modify: `src/app.ts`
- Modify: `src/styles.css`
- Modify: `tests/dashboard-ui.test.ts`
- Modify: `tests/live-app.test.ts`
- Test: `tests/dashboard-ui.test.ts`
- Test: `tests/live-app.test.ts`

**Interfaces:**

- Consumes: `restoreResultViewModel(assessment)`.
- Produces:
  - `ResultCallbacks` with optional `onSaveAction?: () => Promise<void> | void` and `onBack?: () => void`
  - `renderDashboard(..., onStartCoaching, onViewLatestResult)` where `onViewLatestResult(assessment: AssessmentSnapshot): void`

- [ ] **Step 1: Write failing dashboard result-entry tests**

In `tests/dashboard-ui.test.ts`, render a completed authentic assessment and assert:

```ts
const onViewLatestResult = vi.fn();
await renderDashboard(
  root,
  { mode: "demo", profile: null },
  service,
  vi.fn(),
  vi.fn(),
  vi.fn(),
  onViewLatestResult,
);

root.querySelector<HTMLButtonElement>("[data-view-latest-result]")?.click();
expect(onViewLatestResult).toHaveBeenCalledWith(completedAssessment);
```

Extend incomplete and tampered assessment tests:

```ts
expect(root.querySelector("[data-view-latest-result]")).toBeNull();
```

- [ ] **Step 2: Write a failing live-app read-only navigation test**

In `tests/live-app.test.ts`, start with `createAuthenticAssessment()`, click `[data-view-latest-result]`, and assert:

```ts
expect(root.querySelector(".result-shell")).not.toBeNull();
expect(root.querySelector("[data-save-action]")).toBeNull();
expect(root.textContent).toContain("최대 100명");
expect(root.textContent).toContain("하루 최대");

root.querySelector<HTMLButtonElement>("[data-result-back]")?.click();
await vi.waitFor(() => {
  expect(root.querySelector(".dashboard-shell")).not.toBeNull();
});
```

- [ ] **Step 3: Run the two test files and verify RED**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/dashboard-ui.test.ts tests/live-app.test.ts
```

Expected: FAIL because the latest-result control and read-only route do not exist.

- [ ] **Step 4: Extend result callbacks**

Change the interface:

```ts
export interface ResultCallbacks {
  onSaveAction?: () => Promise<void> | void;
  onBack?: () => void;
}
```

Render a real button when `callbacks?.onBack` exists:

```html
<button
  type="button"
  class="quiet-button result-back"
  data-result-back
  aria-label="대시보드로 돌아가기"
>
  ← 대시보드
</button>
```

Only render and bind `[data-save-action]` when `callbacks?.onSaveAction` exists.

- [ ] **Step 5: Add the dashboard latest-result control**

For completed assessments, add this control inside `.dashboard-summary`:

```html
<button type="button" class="summary-link" data-view-latest-result>
  최근 진단 결과 전체 보기
</button>
```

Add the `onViewLatestResult` callback as the final `renderDashboard` parameter and bind it only when the assessment passes `isCompletedAssessment`.

- [ ] **Step 6: Route the read-only result in `src/app.ts`**

Pass this callback to `renderDashboard`:

```ts
(assessment) => {
  const model = restoreResultViewModel(assessment);
  if (!model) return;
  renderResult(root, model, {
    onBack: () => {
      void showDashboard();
    },
  });
};
```

- [ ] **Step 7: Add responsive result-navigation styles**

Style `.summary-link` as a full-width secondary action within the summary and `.result-back` as a compact header action. At the existing mobile breakpoint, keep both at least 44px high and full-width only where the surrounding layout is a single column.

- [ ] **Step 8: Run dashboard, live-app, result, and responsive tests**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/dashboard-ui.test.ts tests/live-app.test.ts tests/result-ui.test.ts tests/responsive-styles.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add src/ui/result.ts src/ui/dashboard.ts src/app.ts src/styles.css tests/dashboard-ui.test.ts tests/live-app.test.ts tests/responsive-styles.test.ts
git commit -m "feat: reopen the latest diagnosis result"
```

### Task 3: Ask the AI coach directly from the dashboard

**Files:**

- Modify: `src/ui/dashboard.ts`
- Modify: `src/ui/coaching.ts`
- Modify: `src/app.ts`
- Modify: `src/styles.css`
- Modify: `tests/dashboard-ui.test.ts`
- Modify: `tests/coaching-ui.test.ts`
- Modify: `tests/live-app.test.ts`
- Modify: `tests/responsive-styles.test.ts`

**Interfaces:**

- Consumes: a completed assessment ID and the existing `AppService.askCoach`.
- Produces:
  - `onStartCoaching(assessmentId: string, initialQuestion?: string): void`
  - `renderCoaching(..., options?: { initialQuestion?: string }): void`

- [ ] **Step 1: Write failing dashboard AI-entry tests**

In `tests/dashboard-ui.test.ts`, verify completed assessments render `[data-dashboard-question-form]` after `.current-action` and before `.action-history`.

Assert an empty submit does not call `onStartCoaching`, an example button fills the textarea, and a trimmed custom question calls:

```ts
expect(onStartCoaching).toHaveBeenCalledWith(
  completedAssessment.id,
  "재방문 고객을 어떻게 확인하나요?",
);
```

Extend incomplete and tampered assessment tests:

```ts
expect(root.querySelector("[data-dashboard-question-form]")).toBeNull();
```

- [ ] **Step 2: Write failing coaching layout and initial-submit tests**

In `tests/coaching-ui.test.ts`, assert:

```ts
const questionCard = root().querySelector(".coaching-question-card");
const concernIntro = root().querySelector(".coaching-intro");
expect(
  questionCard?.compareDocumentPosition(concernIntro!) &
    Node.DOCUMENT_POSITION_FOLLOWING,
).not.toBe(0);
expect(root().textContent).toContain("AI 코치에게 직접 물어보세요");
expect(root().textContent).toContain("또는 고민 유형으로 시작하기");
```

Add:

```ts
it("submits an initial dashboard question exactly once", async () => {
  const askCoach = vi.fn(async () => answerResponse);
  renderCoaching(root(), "a1", serviceWith(askCoach), vi.fn(), {
    initialQuestion: "광고를 하는데 손님이 늘지 않아요",
  });

  await flushPromises();

  expect(askCoach).toHaveBeenCalledTimes(1);
  expect(askCoach).toHaveBeenCalledWith({
    assessmentId: "a1",
    question: "광고를 하는데 손님이 늘지 않아요",
  });
});
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/dashboard-ui.test.ts tests/coaching-ui.test.ts tests/live-app.test.ts
```

Expected: FAIL because the dashboard question card, reordered content, and initial-question option do not exist.

- [ ] **Step 4: Render and bind the dashboard AI card**

Add a completed-assessment-only section after `currentAction`:

```html
<section class="dashboard-ai-card" aria-labelledby="dashboard-ai-title">
  <p class="eyebrow">AI 즉문즉답</p>
  <h2 id="dashboard-ai-title">AI 코치에게 바로 질문하기</h2>
  <p>최신 진단을 바탕으로 지금 할 행동을 함께 찾아드려요.</p>
  <form data-dashboard-question-form novalidate>
    <label for="dashboard-question">매출·광고·재방문·플레이스 고민</label>
    <textarea
      id="dashboard-question"
      name="dashboardQuestion"
      maxlength="500"
      rows="3"
      data-dashboard-question
    ></textarea>
    <div class="dashboard-question-examples" aria-label="질문 예시">
      <button
        type="button"
        data-question-example="광고를 하는데 손님이 늘지 않아요"
      >
        광고를 하는데 손님이 늘지 않아요
      </button>
      <button
        type="button"
        data-question-example="재방문 고객을 어떻게 확인하나요?"
      >
        재방문 고객을 어떻게 확인하나요?
      </button>
      <button
        type="button"
        data-question-example="객단가를 올리려면 무엇부터 해야 하나요?"
      >
        객단가를 올리려면 무엇부터 해야 하나요?
      </button>
    </div>
    <p class="field-error" data-dashboard-question-error></p>
    <button type="submit">AI 코치에게 질문하기</button>
  </form>
</section>
```

On example click, set the textarea value without sending. On submit, reject empty or over-500-character values with a field error; otherwise call `onStartCoaching(assessment.id, value.trim())`.

- [ ] **Step 5: Put direct questions first in `src/ui/coaching.ts`**

Render `.coaching-question-card` before `.coaching-intro`. Use:

- `AI 코치에게 직접 물어보세요`
- `매출·광고·재방문·플레이스 고민을 최신 진단을 바탕으로 답해드려요.`
- `또는 고민 유형으로 시작하기`

Keep all six native concern buttons and existing accessibility behavior.

- [ ] **Step 6: Auto-submit an initial question once**

Extend `renderCoaching`:

```ts
export function renderCoaching(
  root: HTMLElement,
  assessmentId: string,
  service: AppService,
  onBack: () => void,
  options: { initialQuestion?: string } = {},
): void;
```

After the initial render and bindings, normalize the initial question. If it contains 1–500 characters, assign it to `question` and invoke the existing `submitRequest({ assessmentId, question })` exactly once. Do not add a second network path.

- [ ] **Step 7: Pass the initial question through `src/app.ts`**

Change:

```ts
const showCoaching = (assessmentId: string, initialQuestion?: string) => {
  renderCoaching(
    root,
    assessmentId,
    service,
    () => {
      void showDashboard();
    },
    { ...(initialQuestion ? { initialQuestion } : {}) },
  );
};
```

- [ ] **Step 8: Add responsive AI-card styles**

Desktop: card content remains within the dashboard content width, example buttons wrap, and the main submit is visually primary. Mobile: textarea, example buttons, and submit stack in one column; no fixed bottom overlap; headings retain `word-break: keep-all`.

- [ ] **Step 9: Run UI and responsive tests**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/dashboard-ui.test.ts tests/coaching-ui.test.ts tests/live-app.test.ts tests/responsive-styles.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```powershell
git add src/ui/dashboard.ts src/ui/coaching.ts src/app.ts src/styles.css tests/dashboard-ui.test.ts tests/coaching-ui.test.ts tests/live-app.test.ts tests/responsive-styles.test.ts
git commit -m "feat: ask the AI coach from the dashboard"
```

### Task 4: Make the Vercel coaching function valid Node ESM

**Files:**

- Create: `tests/vercel-function-esm.test.ts`
- Modify: `api/coaching.ts`
- Modify: `api/_lib/coaching-handler.ts`
- Modify: `api/_lib/openai.ts`
- Modify: `api/_lib/supabase-admin.ts`
- Modify: `src/coaching/completion.ts`
- Modify: `src/coaching/content.ts`
- Modify: `src/coaching/context.ts`
- Modify: `src/coaching/rules.ts`
- Modify: `src/domain/bottleneck.ts`
- Modify: `src/domain/recommendation.ts`
- Modify: `src/domain/restaurant.ts`
- Modify: `src/domain/revenue.ts`
- Modify: `tests/coaching-api.test.ts`

**Interfaces:**

- Consumes: the real `api/coaching.ts` entry and its complete runtime dependency graph.
- Produces: a Node ESM-importable `api/coaching.js` artifact and safe error-code-only diagnostics.

- [ ] **Step 1: Write the failing emitted-module test**

Create `tests/vercel-function-esm.test.ts`. Create the temporary output directory under `node_modules/.cache` so emitted modules can resolve the project dependencies. Use the installed `typescript` API to compile `api/coaching.ts` with `module` and `moduleResolution` set to `NodeNext`, and collect error diagnostics:

```ts
const program = ts.createProgram({
  rootNames: [resolve("api/coaching.ts")],
  options: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    outDir,
    rootDir: process.cwd(),
    skipLibCheck: true,
    noEmitOnError: true,
    strict: true,
  },
});
const diagnostics = ts.getPreEmitDiagnostics(program);
expect(
  diagnostics.map((item) =>
    ts.flattenDiagnosticMessageText(item.messageText, "\n"),
  ),
).toEqual([]);
expect(program.emit().emitSkipped).toBe(false);
await expect(
  import(pathToFileURL(join(outDir, "api/coaching.js")).href),
).resolves.toMatchObject({ default: expect.any(Function) });
```

Delete the temporary directory in `finally`.

- [ ] **Step 2: Run the emitted-module test and verify RED**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/vercel-function-esm.test.ts
```

Expected: FAIL with NodeNext diagnostics requiring explicit file extensions or with `ERR_MODULE_NOT_FOUND` for `api/_lib/coaching-handler`.

- [ ] **Step 3: Convert the server import graph to JavaScript output specifiers**

Starting at `api/coaching.ts`, change each relative import:

```ts
import { handleCoachingRequest } from "./_lib/coaching-handler.js";
```

Apply the same `.js` output specifier to every relative import reached by this entry. Continue until the NodeNext compile/import test reports no unresolved specifiers. Do not change package imports such as `@vercel/node` or `@supabase/supabase-js`.

- [ ] **Step 4: Write a failing safe-log test**

In `tests/coaching-api.test.ts`, inject an admin dependency that throws `new Error("COACHING_DATA_ERROR")`, spy on `console.error`, call `handleCoachingRequest`, and assert:

```ts
expect(result.status).toBe(500);
expect(console.error).toHaveBeenCalledWith(
  "COACHING_REQUEST_FAILED",
  "COACHING_DATA_ERROR",
);
expect(JSON.stringify(console.error.mock.calls)).not.toContain(
  "customer question text",
);
```

- [ ] **Step 5: Run the API test and verify RED**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/coaching-api.test.ts
```

Expected: FAIL because the handler currently swallows the error without safe logging.

- [ ] **Step 6: Add safe error-code logging**

At the top-level handler catch, derive a safe code:

```ts
const message = caught instanceof Error ? caught.message : "";
const safeCode = /^[A-Z][A-Z0-9_]{2,80}$/.test(message)
  ? message
  : "UNEXPECTED_ERROR";
console.error("COACHING_REQUEST_FAILED", safeCode);
return error(500, "COACHING_REQUEST_FAILED");
```

Never log the request body or external response.

- [ ] **Step 7: Run server tests**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/vercel-function-esm.test.ts tests/coaching-api.test.ts tests/coaching-openai.test.ts tests/coaching-admin-atomic.test.ts tests/supabase-service.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add api src/coaching src/domain tests/vercel-function-esm.test.ts tests/coaching-api.test.ts
git commit -m "fix: make the coaching function Node ESM compatible"
```

### Task 5: Verify, integrate, deploy, and prove the live flow

**Files:**

- Verify: all changed source, tests, docs, and configuration

**Interfaces:**

- Consumes: the complete branch from Tasks 1–4.
- Produces: merged `main`, a Ready Vercel Production deployment, and successful live result/AI checks.

- [ ] **Step 1: Run focused regression suites**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/result-view-model.test.ts tests/dashboard-ui.test.ts tests/live-app.test.ts tests/result-ui.test.ts tests/coaching-ui.test.ts tests/vercel-function-esm.test.ts tests/coaching-api.test.ts tests/coaching-openai.test.ts tests/supabase-service.test.ts tests/responsive-styles.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run complete verification**

Using the workspace Node runtime, run the five project checks:

```powershell
& .\node_modules\.bin\prettier.cmd --check .
& .\node_modules\.bin\tsc.cmd --noEmit
& .\node_modules\.bin\vitest.cmd run
node scripts\security-scan.mjs
& .\node_modules\.bin\vite.cmd build
```

Expected: formatting, type checking, all tests, security scan, and production build pass with exit code 0.

- [ ] **Step 3: Inspect scope**

Run:

```powershell
git diff --check origin/main..HEAD
git diff --name-only origin/main..HEAD
git status --short --branch
```

Expected: only approved Question 4, latest-result, AI-entry, ESM-function, tests, and design/plan changes are present.

- [ ] **Step 4: Push and open a Pull Request to `main`**

Push `agent/buyer-sales-coach-mvp`, create a PR summarizing the three user-visible changes and production root cause, and merge only after required checks pass.

- [ ] **Step 5: Verify Vercel Production**

Wait for the merged commit deployment to reach `Ready` and confirm the stable production URL remains:

```text
https://buyer-sales-coach-mvp.vercel.app
```

- [ ] **Step 6: Verify recent-result navigation**

With a live account:

1. Open the dashboard.
2. Click `최근 진단 결과 전체 보기`.
3. Confirm customer total, daily target, shortfall, and recommended action appear.
4. Confirm no duplicate action-save button appears.
5. Return to the dashboard.

- [ ] **Step 7: Verify the live AI flow**

1. Enter a question in the dashboard AI card.
2. Confirm the coaching screen opens and submits once.
3. Complete any follow-up question.
4. Confirm the final seven-section coaching answer renders.
5. Retry once only if an actual transient error occurs.

- [ ] **Step 8: Inspect production runtime logs**

Check `/api/coaching` logs for the deployed production ID. Expected:

- no `ERR_MODULE_NOT_FOUND`
- no new HTTP 500 for the verified request
- a successful request or normal follow-up response
- no question text, bearer token, API key, or Supabase server key in logs
