# Invite Seed and Advertising Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make invite seeding match Edge normalization and compute advertising CAC only from actual spend and actual ad-attributed customers.

**Architecture:** Preserve the existing three-step form and advertising metric boundary. Extend `AdvertisingInputs` with one actual-spend value, require all four actual values for measured mode, and keep partial input in the existing single measurement-action path. Lock the operational seed instructions with a static README contract test.

**Tech Stack:** TypeScript, Vitest, happy-dom, Supabase Edge Functions, Markdown, Vite.

## Global Constraints

- Invite normalization is exactly JavaScript `trim().toUpperCase()` before `pepper + code` SHA-256 hashing.
- Invite seed state is explicitly `available`.
- `customerAcquisitionCost = actualAdSpend / actualAdNewCustomers`.
- All four actual advertising inputs must be present and valid for measured mode.
- Partial advertising data produces exactly one measurement action and no advertising figures.
- Do not push.

---

### Task 1: Invite seed operating contract

**Files:**

- Modify: `README.md:60-75`
- Create: `tests/operating-readme-contract.test.ts`

**Interfaces:**

- Consumes: Edge normalization in `supabase/functions/redeem-invite/index.ts`.
- Produces: An operator command that writes `INVITE_CODE_NORMALIZED` using `trim().toUpperCase()` before hashing and seed SQL with `status = 'available'`.

- [ ] **Step 1: Write the failing README contract test**

Read `README.md` and assert that it contains `trim().toUpperCase()`, hashes `${INVITE_HASH_PEPPER}${INVITE_CODE_NORMALIZED}`, inserts `'available'`, omits `'unused'`, and warns that hashing lowercase or surrounding whitespace without normalization prevents redemption.

- [ ] **Step 2: Run the focused test and verify RED**

Run `vitest run tests/operating-readme-contract.test.ts`. Expected: failures for normalization, hash input, state, and warning.

- [ ] **Step 3: Correct the operating instructions**

Use Node from stdin so normalization has the same JavaScript semantics as Edge:

```bash
INVITE_CODE_NORMALIZED="$(printf '%s' "${INVITE_CODE}" | node -e "let value='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>value+=chunk);process.stdin.on('end',()=>process.stdout.write(value.trim().toUpperCase()))")"
printf '%s' "${INVITE_HASH_PEPPER}${INVITE_CODE_NORMALIZED}" | openssl dgst -sha256 -r
unset INVITE_CODE INVITE_CODE_NORMALIZED INVITE_HASH_PEPPER
```

Use `values ('<paste-local-sha256-hash>', 'available', ...)` and explain the lowercase/whitespace mismatch risk.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run `vitest run tests/operating-readme-contract.test.ts`. Expected: all assertions pass.

### Task 2: Advertising domain contract

**Files:**

- Modify: `src/domain/types.ts:33-45`
- Modify: `src/domain/revenue.ts:147-213`
- Modify: `tests/revenue.test.ts:169-226`

**Interfaces:**

- Consumes: `calculateAdvertisingMetrics(newCustomerTarget, input)`.
- Produces: `AdvertisingInputs.actualAdSpend: number | null`; measured metrics whose CAC uses actual spend.

- [ ] **Step 1: Write failing domain regression tests**

Add `actualAdSpend` to all fixtures and assert:

```ts
calculateAdvertisingMetrics(400, {
  visitConversionRate: 0.2,
  costPerClick: 500,
  actualAdNewCustomers: 50,
  actualAdSpend: 750_000,
}).customerAcquisitionCost === 15_000;
```

Also assert target `0` retains CAC `15_000`, missing actual spend returns `needs_measurement` with all figures null, and negative/non-finite actual spend returns a field error for `actualAdSpend`.

- [ ] **Step 2: Run the focused domain test and verify RED**

Run `vitest run tests/revenue.test.ts`. Expected: CAC is still based on estimated spend and the new property is absent from types/validation.

- [ ] **Step 3: Implement the minimal domain change**

Add `actualAdSpend` to `AdvertisingInputs`, validate entered values as finite and non-negative, require it in the measured-mode guard, and calculate CAC as:

```ts
customerAcquisitionCost: actualAdSpend / actualAdNewCustomers;
```

- [ ] **Step 4: Run the focused domain test and verify GREEN**

Run `vitest run tests/revenue.test.ts`. Expected: all domain tests pass.

### Task 3: Form, result, persistence, and action behavior

**Files:**

- Modify: `src/ui/diagnosis.ts:92-127,181-189,258-379`
- Modify: `src/ui/result.ts:76-101`
- Modify: `tests/diagnosis-ui.test.ts:259-338`
- Modify: `tests/supabase-service.test.ts:137-171` only if persistence coverage is not fully exercised by the UI service spy.

**Interfaces:**

- Consumes: `AdvertisingInputs.actualAdSpend` and domain measured status.
- Produces: A fourth optional field, accessible validation, persisted assessment JSON, and labels `예상 광고비` / `실제 기준 CAC`.

- [ ] **Step 1: Write failing UI and persistence tests**

Extend the complete-data UI test with `actualAdSpend = 750000` and assert `실제 기준 CAC: 15,000원`, the four-value assumptions, and estimated spend remains `1,000,000원`. Add tests that missing spend yields no CAC and exactly one measurement action; malformed/negative spend sets `aria-invalid` and focuses the field; ads=no clears/disables spend; and the service receives `inputs.advertising.actualAdSpend`.

- [ ] **Step 2: Run focused UI/service tests and verify RED**

Run `vitest run tests/diagnosis-ui.test.ts tests/supabase-service.test.ts`. Expected: missing `actualAdSpend` control, old CAC label/value, and absent saved input.

- [ ] **Step 3: Implement form and result changes**

Read and clear `actualAdSpend` with the other advertising fields, include it in complete-attribution and malformed-number checks, render its optional field and error, and include it in result assumptions. Keep the existing `needs_measurement` branch so only the recommendation action is rendered once. Label the outputs distinctly:

```html
<p>예상 광고비: ...</p>
<p>실제 기준 CAC: ...</p>
```

- [ ] **Step 4: Run focused UI/service tests and verify GREEN**

Run `vitest run tests/diagnosis-ui.test.ts tests/supabase-service.test.ts`. Expected: all focused tests pass.

### Task 4: Report and full verification

**Files:**

- Modify ignored report: `.superpowers/sdd/final-coverage-fix-report.md`

**Interfaces:**

- Consumes: All changes from Tasks 1-3.
- Produces: Final evidence and focused implementation commit.

- [ ] **Step 1: Update the report**

Record invite normalization/status, four-value advertising mode, actual CAC formula, RED/GREEN evidence, final test count, and the local dynamic pgTAP limitation.

- [ ] **Step 2: Run complete verification**

Run Prettier check, `tsc --noEmit`, complete Vitest, security scan, normal Vite build, demo Vite build, and `git diff --check`. Expected: exit code 0 for every command.

- [ ] **Step 3: Review and commit tracked implementation changes**

Stage only README, source, and regression-test files; inspect `git diff --cached --check` and stat; commit once with `fix: separate actual ad CAC from projections`. Do not push.
