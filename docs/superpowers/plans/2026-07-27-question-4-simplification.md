# Question 4 Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the confusing revenue-allocation inputs from Question 4 and clearly explain that the additional-customer estimate assumes the revenue gap is filled by new customers.

**Architecture:** Keep the existing revenue domain and persistence contract intact for backward compatibility. Change only the new diagnosis form so it emits an empty allocation, remove allocation-specific UI validation, and add plain-language calculation context to the live feedback.

**Tech Stack:** TypeScript 5.9, Vite 8, Vitest 4, Happy DOM, pnpm 11

## Global Constraints

- Question 4 displays only the required monthly operating-days input.
- New diagnoses normalize `allocation` to an empty object through the existing nullable allocation contract.
- Existing domain types, Supabase RPC payload shape, database migrations, and historic result rendering remain unchanged.
- The estimate continues to use `ceil(shortfallRevenue / averageOrderValue / operatingDays)`.
- User-facing Korean copy must explain that all missing revenue is conservatively treated as new-customer revenue.
- Desktop and mobile layouts must continue to use the existing responsive question-card styles.

---

## File Structure

- Modify `tests/diagnosis-ui.test.ts`: replace direct-allocation UI tests with absence, empty-allocation, calculation-copy, and navigation coverage.
- Modify `src/ui/diagnosis.ts`: stop rendering and reading the three allocation fields, remove their client validation, and add the automatic-calculation explanation.
- Preserve `src/domain/revenue.ts`, `src/domain/types.ts`, `src/services/supabase-service.ts`, `src/ui/result.ts`, and database migrations for historic-data compatibility.

### Task 1: Lock the simplified Question 4 behavior with UI tests

**Files:**
- Modify: `tests/diagnosis-ui.test.ts`
- Test: `tests/diagnosis-ui.test.ts`

**Interfaces:**
- Consumes: `createApp(root, createDemoService())`, existing `setValue`, `click`, and `advanceQuestions` test helpers.
- Produces: regression expectations for Question 4 markup, automatic coaching copy, empty allocation, and successful navigation.

- [ ] **Step 1: Replace direct-allocation validation tests with a failing rendering test**

Add a test that opens the diagnosis and asserts that the advanced section and all three controls are absent:

```ts
test("keeps question 4 focused on monthly operating days", async () => {
  const root = document.querySelector<HTMLElement>("#app")!;
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");
  setValue("averageMonthlyRevenue", "30,000,000");
  setValue("targetMonthlyRevenue", "40,000,000");
  setValue("averageOrderValue", "25,000");
  click("[data-next-question]");

  expect(root.textContent).not.toContain("부족 매출을 직접 나눠 보기");
  expect(root.querySelector("[name='newCustomerRevenue']")).toBeNull();
  expect(root.querySelector("[name='returningCustomerRevenue']")).toBeNull();
  expect(root.querySelector("[name='averageOrderValueRevenue']")).toBeNull();
});
```

- [ ] **Step 2: Add a failing automatic-assumption copy assertion**

Extend `adds the daily customer need when all revenue inputs are valid`:

```ts
expect(feedback).toContain(
  "재방문 고객 수를 정확히 알기 어려워, 우선 모두 신규 고객이라고 가정해 계산했어요.",
);
```

- [ ] **Step 3: Add a failing empty-allocation assertion**

Add a save-flow test using the existing demo-service spy:

```ts
test("saves an empty allocation for the simplified diagnosis", async () => {
  const service = createDemoService();
  const saveAssessment = vi.spyOn(service, "saveAssessment");
  await openStepThree("unknown", service);
  choose("adsRunning", "false");
  click("[data-submit-diagnosis]");
  await Promise.resolve();
  await Promise.resolve();

  expect(saveAssessment).toHaveBeenCalledWith(
    expect.objectContaining({
      inputs: expect.objectContaining({ allocation: {} }),
    }),
  );
});
```

- [ ] **Step 4: Run the focused test and verify failure**

Run:

```bash
pnpm vitest run tests/diagnosis-ui.test.ts
```

Expected: FAIL because the allocation details still render and the explanatory sentence is not yet present.

- [ ] **Step 5: Commit the failing tests**

```bash
git add tests/diagnosis-ui.test.ts
git commit -m "test: define simplified question 4 flow"
```

### Task 2: Remove allocation controls from the new diagnosis flow

**Files:**
- Modify: `src/ui/diagnosis.ts`
- Test: `tests/diagnosis-ui.test.ts`

**Interfaces:**
- Consumes: `DiagnosisInput`, `GoalAllocationInput`, `calculateRevenueMetrics`, and the existing coaching-feedback element.
- Produces: `readDiagnosisForm(form): DiagnosisInput` with three nullable allocation values that normalize to `{}`, and Question 4 markup without allocation controls.

- [ ] **Step 1: Stop reading removed controls as user input**

Keep the existing typed input contract while assigning nulls explicitly:

```ts
const allocation = {
  newCustomerRevenue: null,
  returningCustomerRevenue: null,
  averageOrderValueRevenue: null,
};
```

- [ ] **Step 2: Delete the allocation-only markup helper**

Remove the complete `allocationFields()` function and remove this interpolation from Question 4:

```ts
${allocationFields()}
```

Question 4 must retain:

```ts
${numberField("operatingDays", "월 영업일")}
```

- [ ] **Step 3: Remove allocation fields from new-form error routing**

Delete `newCustomerRevenue`, `returningCustomerRevenue`, `averageOrderValueRevenue`, and `allocation` from `questionByErrorField`.

Remove the `allocation` special case from `setError` and the corresponding focus fallback from `showErrors`, leaving other grouped errors such as `channelShares` unchanged.

- [ ] **Step 4: Remove allocation validation from step 1**

Delete the malformed-number loop for the three removed controls and delete the `validateGoalAllocation(...)` call from `validateStep`.

Do not remove domain-level or saved-record validation from other files.

- [ ] **Step 5: Add the plain-language calculation basis**

When average order value and operating days are valid, append both messages:

```ts
messages.push(
  `현재 객단가라면 하루 약 ${new Intl.NumberFormat("ko-KR").format(dailyCustomers)}명의 추가 고객이 필요해요.`,
  "재방문 고객 수를 정확히 알기 어려워, 우선 모두 신규 고객이라고 가정해 계산했어요.",
);
```

- [ ] **Step 6: Run the focused UI test**

Run:

```bash
pnpm vitest run tests/diagnosis-ui.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the implementation**

```bash
git add src/ui/diagnosis.ts tests/diagnosis-ui.test.ts
git commit -m "feat: simplify question 4 customer estimate"
```

### Task 3: Verify backward compatibility and production readiness

**Files:**
- Verify unchanged: `src/domain/revenue.ts`
- Verify unchanged: `src/services/supabase-service.ts`
- Verify unchanged: `src/ui/result.ts`
- Verify: all source and test files

**Interfaces:**
- Consumes: existing historic-allocation domain tests, Supabase service tests, completion tests, and build scripts.
- Produces: a verified production bundle with no persistence-contract changes.

- [ ] **Step 1: Run allocation compatibility tests**

Run:

```bash
pnpm vitest run tests/revenue.test.ts tests/supabase-service.test.ts tests/coaching-assessment-completion.test.ts tests/database-allocation-contract.test.ts
```

Expected: PASS, proving historic saved allocations remain accepted and renderable.

- [ ] **Step 2: Run the complete verification suite**

Run:

```bash
pnpm verify
```

Expected: formatting, type checking, all Vitest tests, security scan, and Vite production build pass.

- [ ] **Step 3: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
git diff HEAD~2 -- src/ui/diagnosis.ts tests/diagnosis-ui.test.ts
```

Expected: only the approved UI simplification, its tests, and planning documents are present; no database or service contract files changed.

- [ ] **Step 4: Push and deploy**

Push the implementation branch, merge it through the repository’s normal GitHub flow, and wait for the linked Vercel production deployment to reach `Ready`.

- [ ] **Step 5: Verify the deployed flow**

At desktop and mobile widths:

1. Sign in with a valid email and invite code.
2. Start the diagnosis.
3. Enter current revenue, target revenue, average order value, and operating days.
4. Confirm Question 4 has no allocation section.
5. Confirm the additional-customer estimate and conservative assumption are readable without awkward line breaks.
6. Continue through the remaining questions and save a result successfully.
