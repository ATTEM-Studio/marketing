# Buyer Sales Coach MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전자책 구매자가 인증 후 매장 숫자를 입력하고 목표 매출까지의 최대 필요 신규 고객 수, 현재 방향, 오늘의 행동 한 가지를 확인하고 실행 결과를 저장하는 기본 웹 서비스를 만든다.

**Architecture:** Vite와 TypeScript로 프레임워크 없는 정적 프런트엔드를 만들고 계산·추천 도메인을 DOM 코드와 분리한다. 데모 모드와 Supabase 운영 모드는 동일한 `AppService` 인터페이스를 구현하며, 인증·초대코드·사용자별 데이터 격리는 Supabase Auth, Edge Functions, Postgres RLS가 담당한다.

**Tech Stack:** Node.js 24 이상, pnpm 11.9.0, Vite 8.1.5, TypeScript 7.0.2, Vitest 4.1.10, happy-dom 20.10.6, Supabase JS 2.110.7, Supabase CLI 2.109.1, Prettier 3.9.5, GitHub Actions, GitHub Pages

## Global Constraints

- 구현 기준 문서는 `docs/superpowers/specs/2026-07-19-ebook-buyer-sales-coach-design.md`다.
- 기존 `ATTEM-Studio/jangsa` 코드를 복사하거나 수정하지 않는다.
- 전자책 원문 열람, 결제, 관리자 화면, 다중 매장, AI 자유문장 생성은 포함하지 않는다.
- 결과 첫 화면에는 오늘의 행동 한 가지만 표시한다.
- 필요 고객 수는 항상 `전부 신규로 채우는 경우의 최대치`라고 표시한다.
- 재방문 데이터가 `unknown`이면 재방문 병목을 계산하거나 단정하지 않는다.
- 실제 방문 전환율이 없으면 광고 클릭 수와 예산을 확정 계산하지 않는다.
- 실제 개인정보는 데모 모드와 브라우저 로컬 저장소에 저장하지 않는다.
- 서비스 역할 키와 초대코드 원문은 클라이언트 번들에 포함하지 않는다.
- 모든 사용자 데이터는 `auth.uid()` 기준 RLS로 격리한다.
- 사용자 문장은 쉬운 한국어로 작성하고 매출 보장·상위노출 보장 표현을 사용하지 않는다.
- 각 작업은 실패 테스트 작성, 실패 확인, 최소 구현, 통과 확인, 명시적 파일 커밋 순서를 지킨다.

---

## File Map

```text
index.html                              앱 진입 문서와 접근성 기본 구조
package.json                            도구 버전과 검증 명령
pnpm-lock.yaml                          고정 의존성
tsconfig.json                           TypeScript 검사 설정
vite.config.ts                          GitHub Pages base 경로와 빌드 설정
vitest.config.ts                        happy-dom 테스트 설정
.prettierrc.json                        서식 규칙
.gitignore                              빌드·환경 파일 제외
.env.example                            공개 가능한 Supabase 설정 이름
src/main.ts                             앱 시작과 서비스 선택
src/app.ts                              화면 상태 전환 조정
src/styles.css                          디자인 토큰과 반응형 화면
src/config.ts                           live/demo 실행 설정 판독
src/domain/types.ts                     도메인 입력·출력 타입
src/domain/revenue.ts                   매출 역산과 입력 검증
src/domain/bottleneck.ts                이전 기간 대비 수치 기반 병목 판정
src/domain/recommendation.ts            실행 가능 조건과 단일 행동 선택
src/content/coaching.ts                 전자책 철학 기반 짧은 코칭 문장
src/services/contracts.ts               인증·저장 서비스 인터페이스
src/services/demo-service.ts            합성 데이터 전용 데모 구현
src/services/supabase-client.ts         브라우저용 Supabase 클라이언트 생성
src/services/supabase-service.ts        운영 인증·저장 구현
src/ui/shell.ts                         공통 헤더·상태·오류 렌더링
src/ui/onboarding.ts                    구매자 등록·로그인 화면
src/ui/diagnosis.ts                     3단계 입력 화면
src/ui/result.ts                        계산·추천 결과 화면
src/ui/dashboard.ts                     개인 홈·실행 기록 화면
supabase/config.toml                    로컬 Supabase 설정
supabase/migrations/202607190001_init.sql 테이블·함수·RLS
supabase/functions/_shared/http.ts      CORS·JSON 응답 유틸리티
supabase/functions/redeem-invite/index.ts 초대코드 검증·예약
supabase/functions/finalize-registration/index.ts 인증 후 가입 확정
supabase/tests/database/rls.test.sql     RLS와 가입 함수 pgTAP 검증
tests/app-shell.test.ts                  초기 화면 검증
tests/revenue.test.ts                    계산·검증 단위 테스트
tests/bottleneck.test.ts                 근거 수준·재방문 제외 병목 테스트
tests/recommendation.test.ts             추천 게이트 단위 테스트
tests/demo-service.test.ts               데모 개인정보 차단 테스트
tests/diagnosis-ui.test.ts               진단·결과 통합 테스트
tests/onboarding-ui.test.ts              가입·로그인 화면 테스트
tests/dashboard-ui.test.ts               실행 기록 화면 테스트
.github/workflows/ci.yml                 타입·테스트·빌드 검증
.github/workflows/pages.yml              main의 정적 데모 배포
README.md                                실행·Supabase·배포 안내
```

---

### Task 1: Toolchain and Accessible App Shell

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `.prettierrc.json`
- Create: `.gitignore`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/styles.css`
- Create: `tests/app-shell.test.ts`

**Interfaces:**
- Produces: `mountApp(root: HTMLElement): void` from `src/main.ts`
- Produces: stable DOM landmarks `header`, `main#app`, and `footer`

- [ ] **Step 1: Create the pinned toolchain files**

`package.json` must be exactly:

```json
{
  "name": "attem-buyer-sales-coach",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "format:check": "prettier --check .",
    "build": "vite build",
    "verify": "pnpm format:check && pnpm typecheck && pnpm test && pnpm build"
  },
  "dependencies": {
    "@supabase/supabase-js": "2.110.7"
  },
  "devDependencies": {
    "happy-dom": "20.10.6",
    "prettier": "3.9.5",
    "supabase": "2.109.1",
    "typescript": "7.0.2",
    "vite": "8.1.5",
    "vitest": "4.1.10"
  },
  "engines": {
    "node": ">=24"
  },
  "packageManager": "pnpm@11.9.0"
}
```

`tsconfig.json` must enable `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noEmit`, DOM libraries, and include `src`, `tests`, and Vite config files. `vite.config.ts` must use `base: process.env.GITHUB_ACTIONS ? "/marketing/" : "/"`. `vitest.config.ts` must use `environment: "happy-dom"` and `setupFiles: []`. `.gitignore` must exclude `node_modules/`, `dist/`, `.env`, `.env.*`, and allow `.env.example`.

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` is created and dependency installation exits 0.

- [ ] **Step 2: Write the failing shell test**

Create `tests/app-shell.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "vitest";
import { mountApp } from "../src/main";

describe("app shell", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  test("shows the product promise and buyer entry action", () => {
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) throw new Error("missing test root");
    mountApp(root);
    expect(document.querySelector("h1")?.textContent).toContain("매출이 막힌 지점");
    expect(document.querySelector("[data-action='register']")?.textContent).toContain("구매자 인증");
    expect(document.querySelector("[data-action='demo']")?.textContent).toContain("샘플로 둘러보기");
  });
});
```

- [ ] **Step 3: Run the shell test and confirm failure**

Run:

```bash
pnpm test -- tests/app-shell.test.ts
```

Expected: FAIL because `src/main.ts` does not exist.

- [ ] **Step 4: Implement the minimal accessible shell**

Create `index.html` with `lang="ko"`, a viewport meta tag, `<div id="app"></div>`, and `<script type="module" src="/src/main.ts"></script>`.

Create `src/main.ts`:

```ts
import "./styles.css";

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <header class="site-header"><a href="#main">본문 바로가기</a><strong>장사 방향 코치</strong></header>
    <main id="main" class="landing-shell">
      <p class="eyebrow">전자책 구매자 전용</p>
      <h1>순위가 아니라 매출이 막힌 지점을 찾습니다.</h1>
      <p>목표 매출에서 필요한 손님 규모를 계산하고 오늘 할 행동 하나를 정해드립니다.</p>
      <div class="button-row">
        <button type="button" data-action="register">구매자 인증 시작</button>
        <button type="button" data-action="demo">샘플로 둘러보기</button>
      </div>
    </main>
    <footer>추천은 판단을 돕는 참고 정보이며 매출을 보장하지 않습니다.</footer>
  `;
}

const root = document.querySelector<HTMLElement>("#app");
if (root) mountApp(root);
```

Create `src/styles.css` with color, spacing, radius, and typography CSS custom properties; a centered `max-width: 1180px` layout; visible keyboard focus; 44px minimum buttons; and a single-column media query below 720px. Do not introduce red warning as the primary accent.

- [ ] **Step 5: Verify and commit the shell**

Run:

```bash
pnpm test -- tests/app-shell.test.ts
pnpm typecheck
pnpm build
```

Expected: all commands exit 0 and `dist/index.html` exists.

Commit:

```bash
git add package.json pnpm-lock.yaml tsconfig.json vite.config.ts vitest.config.ts .prettierrc.json .gitignore index.html src/main.ts src/styles.css tests/app-shell.test.ts
git commit -m "feat: add buyer coach app shell"
```

---

### Task 2: Revenue Goal Domain

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/revenue.ts`
- Create: `tests/revenue.test.ts`

**Interfaces:**
- Produces: `validateRevenueInputs(input: RevenueInputs): FieldError[]`
- Produces: `calculateRevenueMetrics(input: RevenueInputs): RevenueMetrics`
- Produces types `RevenueInputs`, `RevenueMetrics`, `FieldError`, `ReturningDataStatus`, and `Capacity`

- [ ] **Step 1: Write the failing revenue tests**

Create `tests/revenue.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { calculateRevenueMetrics, validateRevenueInputs } from "../src/domain/revenue";

const base = {
  averageMonthlyRevenue: 30_000_000,
  targetMonthlyRevenue: 40_000_000,
  averageOrderValue: 25_000,
  operatingDays: 20,
  monthlyCustomerCount: null,
} as const;

describe("revenue goal calculation", () => {
  test("calculates the all-new-customer upper bound", () => {
    expect(calculateRevenueMetrics(base)).toEqual({
      shortfallRevenue: 10_000_000,
      maxNewCustomers: 400,
      maxNewCustomersPerDay: 20,
      monthlyCustomerCount: 1200,
      customerCountSource: "estimated",
      targetReached: false,
    });
  });

  test("uses an actual customer count when provided", () => {
    expect(calculateRevenueMetrics({ ...base, monthlyCustomerCount: 980 }).monthlyCustomerCount).toBe(980);
    expect(calculateRevenueMetrics({ ...base, monthlyCustomerCount: 980 }).customerCountSource).toBe("actual");
  });

  test("does not return a negative shortfall after reaching target", () => {
    const result = calculateRevenueMetrics({ ...base, averageMonthlyRevenue: 45_000_000 });
    expect(result.shortfallRevenue).toBe(0);
    expect(result.maxNewCustomers).toBe(0);
    expect(result.targetReached).toBe(true);
  });

  test("returns field errors instead of dividing by zero", () => {
    expect(validateRevenueInputs({ ...base, averageOrderValue: 0, operatingDays: 0 })).toEqual([
      { field: "averageOrderValue", message: "평균 객단가를 1원 이상 입력해 주세요." },
      { field: "operatingDays", message: "월 영업일을 1일 이상 입력해 주세요." },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm failure**

Run:

```bash
pnpm test -- tests/revenue.test.ts
```

Expected: FAIL because the domain files do not exist.

- [ ] **Step 3: Implement domain types and calculations**

Create `src/domain/types.ts`:

```ts
export type ReturningDataStatus = "known" | "sampled" | "unknown";
export type Capacity = "yes" | "sometimes" | "no";

export interface RevenueInputs {
  averageMonthlyRevenue: number;
  targetMonthlyRevenue: number;
  averageOrderValue: number;
  operatingDays: number;
  monthlyCustomerCount: number | null;
}

export interface RevenueMetrics {
  shortfallRevenue: number;
  maxNewCustomers: number;
  maxNewCustomersPerDay: number;
  monthlyCustomerCount: number;
  customerCountSource: "actual" | "estimated";
  targetReached: boolean;
}

export interface FieldError {
  field: keyof RevenueInputs | string;
  message: string;
}
```

Create `src/domain/revenue.ts`:

```ts
import type { FieldError, RevenueInputs, RevenueMetrics } from "./types";

export function validateRevenueInputs(input: RevenueInputs): FieldError[] {
  const errors: FieldError[] = [];
  if (input.averageMonthlyRevenue < 0) errors.push({ field: "averageMonthlyRevenue", message: "최근 월평균 매출은 0원 이상이어야 합니다." });
  if (input.targetMonthlyRevenue <= 0) errors.push({ field: "targetMonthlyRevenue", message: "목표 월 매출을 1원 이상 입력해 주세요." });
  if (input.averageOrderValue <= 0) errors.push({ field: "averageOrderValue", message: "평균 객단가를 1원 이상 입력해 주세요." });
  if (input.operatingDays <= 0) errors.push({ field: "operatingDays", message: "월 영업일을 1일 이상 입력해 주세요." });
  if (input.monthlyCustomerCount !== null && input.monthlyCustomerCount <= 0) errors.push({ field: "monthlyCustomerCount", message: "월 고객 수는 1명 이상 입력하거나 모름을 선택해 주세요." });
  return errors;
}

export function calculateRevenueMetrics(input: RevenueInputs): RevenueMetrics {
  const errors = validateRevenueInputs(input);
  if (errors.length > 0) throw new TypeError(errors.map((error) => error.message).join(" "));
  const shortfallRevenue = Math.max(input.targetMonthlyRevenue - input.averageMonthlyRevenue, 0);
  const maxNewCustomers = Math.ceil(shortfallRevenue / input.averageOrderValue);
  const actualCount = input.monthlyCustomerCount;
  return {
    shortfallRevenue,
    maxNewCustomers,
    maxNewCustomersPerDay: Math.ceil(maxNewCustomers / input.operatingDays),
    monthlyCustomerCount: actualCount ?? Math.ceil(input.averageMonthlyRevenue / input.averageOrderValue),
    customerCountSource: actualCount === null ? "estimated" : "actual",
    targetReached: input.averageMonthlyRevenue >= input.targetMonthlyRevenue,
  };
}
```

- [ ] **Step 4: Verify and commit the revenue domain**

Run:

```bash
pnpm test -- tests/revenue.test.ts
pnpm typecheck
```

Expected: all revenue tests pass and typecheck exits 0.

Commit:

```bash
git add src/domain/types.ts src/domain/revenue.ts tests/revenue.test.ts
git commit -m "feat: calculate revenue goal customer ceiling"
```

---

### Task 3: Evidence-Rated Bottleneck and Safe Single-Action Recommendation Engine

**Files:**
- Modify: `src/domain/types.ts`
- Create: `src/domain/bottleneck.ts`
- Create: `src/domain/recommendation.ts`
- Create: `src/content/coaching.ts`
- Create: `tests/bottleneck.test.ts`
- Create: `tests/recommendation.test.ts`

**Interfaces:**
- Consumes: `RevenueMetrics`, `Capacity`, and `ReturningDataStatus`
- Produces: `selectBottleneck(input: BottleneckInputs): BottleneckResult`
- Produces: `selectAction(context: RecommendationContext): RecommendedAction`
- Produces: `RecommendedAction` with `key`, `title`, `reason`, `steps`, `metric`, `avoid`, `minutes`, and `coachingKey`

- [ ] **Step 1: Write the failing bottleneck tests**

Create `tests/bottleneck.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { selectBottleneck } from "../src/domain/bottleneck";

const metric = (previous: number | null, current: number | null) => ({ previous, current });

describe("bottleneck evidence", () => {
  test("selects the largest decline from comparable store data", () => {
    const result = selectBottleneck({
      exposure: metric(10_000, 9_000),
      click: metric(1_000, 700),
      visit: metric(200, 190),
      averageOrderValue: metric(25_000, 26_000),
      returning: metric(80, 40),
      returningDataStatus: "unknown",
    });
    expect(result).toMatchObject({ key: "click", status: "known", changeRate: -0.3 });
  });

  test("excludes returning visits when the customer identity is unknown", () => {
    const result = selectBottleneck({
      exposure: metric(10_000, 9_500),
      click: metric(null, null),
      visit: metric(null, null),
      averageOrderValue: metric(25_000, 24_000),
      returning: metric(100, 20),
      returningDataStatus: "unknown",
    });
    expect(result.key).toBe("exposure");
  });

  test("does not invent a bottleneck without comparable values", () => {
    const result = selectBottleneck({
      exposure: metric(null, null),
      click: metric(null, null),
      visit: metric(null, null),
      averageOrderValue: metric(null, 25_000),
      returning: metric(null, null),
      returningDataStatus: "unknown",
    });
    expect(result).toEqual({ key: null, status: "insufficient", changeRate: null, reason: "비교할 이전 기간 수치가 부족해 병목을 단정하지 않았습니다." });
  });
});
```

- [ ] **Step 2: Run the bottleneck tests and confirm failure**

Run `pnpm test -- tests/bottleneck.test.ts`.

Expected: FAIL because `selectBottleneck` does not exist.

- [ ] **Step 3: Add bottleneck types and implementation**

Append these types to `src/domain/types.ts`:

```ts
export type BottleneckKey = "exposure" | "click" | "visit" | "averageOrderValue" | "returning";
export interface ComparableMetric { previous: number | null; current: number | null }
export interface BottleneckInputs {
  exposure: ComparableMetric;
  click: ComparableMetric;
  visit: ComparableMetric;
  averageOrderValue: ComparableMetric;
  returning: ComparableMetric;
  returningDataStatus: ReturningDataStatus;
}
export interface BottleneckResult {
  key: BottleneckKey | null;
  status: "known" | "stable" | "insufficient";
  changeRate: number | null;
  reason: string;
}
```

Create `src/domain/bottleneck.ts`. It must ignore a metric unless both values are finite, the previous value is greater than zero, and the current value is non-negative. It must exclude `returning` unless `returningDataStatus === "known"`. Calculate `(current - previous) / previous`, sort ascending, and return the most negative comparable metric. If every comparable rate is zero or positive, return `{ key: null, status: "stable", changeRate: minimumRate, reason: "비교 가능한 핵심 수치에서 감소 구간을 찾지 못했습니다." }`. If no metric is comparable, return the exact `insufficient` result used by the test.

- [ ] **Step 4: Verify the bottleneck tests**

Run `pnpm test -- tests/bottleneck.test.ts`.

Expected: all three bottleneck tests pass.

- [ ] **Step 5: Write the failing recommendation tests**

Create `tests/recommendation.test.ts` with these cases:

```ts
import { describe, expect, test } from "vitest";
import { selectAction } from "../src/domain/recommendation";

const context = {
  metrics: {
    shortfallRevenue: 10_000_000,
    maxNewCustomers: 400,
    maxNewCustomersPerDay: 20,
    monthlyCustomerCount: 1200,
    customerCountSource: "estimated" as const,
    targetReached: false,
  },
  bottleneck: {
    key: null,
    status: "insufficient" as const,
    changeRate: null,
    reason: "비교할 이전 기간 수치가 부족해 병목을 단정하지 않았습니다.",
  },
  primaryConcern: "unknown" as const,
  capacity: "yes" as const,
  returningDataStatus: "unknown" as const,
  hasConsentDb: false,
  canChangeMenu: true,
  adsRunning: false,
  adAttributionKnown: false,
};

describe("single action selection", () => {
  test("uses the all-new count for scale but does not diagnose repeat visits", () => {
    expect(selectAction(context).key).toBe("local-discovery");
  });

  test("does not recommend more acquisition without capacity", () => {
    expect(selectAction({ ...context, capacity: "no" }).key).toBe("average-order-value");
  });

  test("asks for attribution before changing ad budget", () => {
    expect(selectAction({ ...context, primaryConcern: "ads", adsRunning: true }).key).toBe("measure-acquisition-source");
  });

  test("does not recommend customer messages without consent", () => {
    expect(selectAction({ ...context, primaryConcern: "returning", returningDataStatus: "known" }).key).not.toBe("returning-message");
  });

  test("protects profit after the target is reached", () => {
    expect(selectAction({ ...context, metrics: { ...context.metrics, targetReached: true, shortfallRevenue: 0, maxNewCustomers: 0, maxNewCustomersPerDay: 0 } }).key).toBe("profit-review");
  });
});
```

- [ ] **Step 6: Run the recommendation tests and confirm failure**

Run:

```bash
pnpm test -- tests/recommendation.test.ts
```

Expected: FAIL because `selectAction` does not exist.

- [ ] **Step 7: Add exact recommendation interfaces**

Append to `src/domain/types.ts`:

```ts
export type PrimaryConcern = "customers" | "ads" | "averageOrderValue" | "returning" | "unknown";

export interface RecommendationContext {
  metrics: RevenueMetrics;
  bottleneck: BottleneckResult;
  primaryConcern: PrimaryConcern;
  capacity: Capacity;
  returningDataStatus: ReturningDataStatus;
  hasConsentDb: boolean;
  canChangeMenu: boolean;
  adsRunning: boolean;
  adAttributionKnown: boolean;
}

export interface RecommendedAction {
  key: "profit-review" | "average-order-value" | "measure-acquisition-source" | "returning-message" | "off-peak-offer" | "local-discovery";
  title: string;
  reason: string;
  steps: readonly [string, string, string];
  metric: string;
  avoid: string;
  minutes: number;
  coachingKey: string;
}
```

- [ ] **Step 8: Implement fixed actions and eligibility order**

Create `src/domain/recommendation.ts` with an immutable `ACTIONS` record containing complete Korean copy for all six action keys. Implement this exact decision order:

```ts
import type { RecommendedAction, RecommendationContext } from "./types";

const ACTIONS: Record<RecommendedAction["key"], RecommendedAction> = {
  "profit-review": {
    key: "profit-review",
    title: "추가 광고보다 남는 매출부터 확인하세요",
    reason: "최근 월평균 매출이 목표에 도달했습니다. 손님을 더 모으기 전에 이익과 운영 효율을 확인할 차례입니다.",
    steps: ["대표 메뉴 세 개의 판매가와 재료비를 적으세요.", "메뉴별로 판매가에서 직접 재료비를 빼세요.", "남는 금액이 가장 적은 메뉴 한 개의 가격이나 구성을 검토하세요."],
    metric: "대표 메뉴별 판매가에서 직접 재료비를 뺀 금액",
    avoid: "목표를 달성했다는 이유만으로 광고비부터 늘리지 마세요.",
    minutes: 20,
    coachingKey: "revenue-before-ranking",
  },
  "average-order-value": {
    key: "average-order-value",
    title: "대표 메뉴 옆에 추가 메뉴 한 개를 배치하세요",
    reason: "지금은 추가 손님을 충분히 받을 수 없어 이미 방문한 손님의 선택을 개선하는 편이 현실적입니다.",
    steps: ["가장 많이 팔리는 메뉴 한 개를 고르세요.", "함께 주문하기 좋은 추가 메뉴 한 개를 정하세요.", "메뉴판과 직원 안내 문장을 같은 표현으로 바꾸세요."],
    metric: "7일간 추가 메뉴 선택 건수와 평균 객단가",
    avoid: "모든 메뉴와 가격을 한꺼번에 바꾸지 마세요.",
    minutes: 20,
    coachingKey: "three-revenue-levers",
  },
  "measure-acquisition-source": {
    key: "measure-acquisition-source",
    title: "7일 동안 신규 고객의 방문 경로를 기록하세요",
    reason: "광고 클릭이 실제 방문으로 이어졌는지 확인되지 않아 예산을 판단할 근거가 부족합니다.",
    steps: ["결제할 때 처음 방문인지 확인하세요.", "처음이라면 매장을 알게 된 경로 한 가지만 표시하세요.", "7일 뒤 광고 경로 신규 고객 수와 광고비를 함께 보세요."],
    metric: "광고를 보고 방문했다고 답한 실제 신규 고객 수",
    avoid: "클릭 수만 보고 광고비를 늘리지 마세요.",
    minutes: 10,
    coachingKey: "exposure-is-not-sales",
  },
  "returning-message": {
    key: "returning-message",
    title: "동의 고객 일부에게 다음 방문 이유를 알려주세요",
    reason: "확인된 재방문 데이터와 홍보 수신동의 고객이 있어 작은 재방문 실험을 측정할 수 있습니다.",
    steps: ["최근 방문 고객 중 수신동의 고객만 고르세요.", "7일 안에 다시 올 이유 한 가지를 작성하세요.", "일부 고객에게만 보내고 실제 재방문 수를 기록하세요."],
    metric: "발송 고객 중 7일 안에 재방문한 고객 수",
    avoid: "수신동의가 없는 연락처로 홍보하지 마세요.",
    minutes: 15,
    coachingKey: "three-revenue-levers",
  },
  "off-peak-offer": {
    key: "off-peak-offer",
    title: "손님을 더 받을 수 있는 시간대 하나를 정하세요",
    reason: "시간대에 따라 수용 여력이 달라서 전체 유입보다 빈 시간대에 맞춘 행동이 먼저입니다.",
    steps: ["최근 한 달 중 가장 비는 요일과 시간을 고르세요.", "그 시간대에 맞는 대표 메뉴와 이용 이유를 한 문장으로 쓰세요.", "한 채널에만 안내하고 해당 시간 방문 수를 기록하세요."],
    metric: "선택한 시간대의 7일 방문 고객 수",
    avoid: "바쁜 시간까지 같은 혜택을 적용하지 마세요.",
    minutes: 20,
    coachingKey: "channel-has-a-role",
  },
  "local-discovery": {
    key: "local-discovery",
    title: "검색한 고객이 선택할 이유 한 가지를 고치세요",
    reason: "추가 고객을 받을 수 있으므로 광고 확대보다 매장을 비교하는 고객에게 선택 이유를 분명히 보여주는 행동이 먼저입니다.",
    steps: ["대표 메뉴와 핵심 이용 상황 한 가지를 정하세요.", "대표사진과 첫 설명 문장을 같은 내용으로 맞추세요.", "주차·예약·영업시간 정보가 맞는지 확인하세요."],
    metric: "7일간 전화·길찾기·예약 수",
    avoid: "여러 지역과 메뉴 키워드를 한꺼번에 추가하지 마세요.",
    minutes: 25,
    coachingKey: "exposure-is-not-sales",
  },
};

export function selectAction(context: RecommendationContext): RecommendedAction {
  if (context.metrics.targetReached) return ACTIONS["profit-review"];
  if (context.capacity === "no") return context.canChangeMenu ? ACTIONS["average-order-value"] : ACTIONS["off-peak-offer"];
  if (context.primaryConcern === "ads" && context.adsRunning && !context.adAttributionKnown) return ACTIONS["measure-acquisition-source"];
  if (context.primaryConcern === "averageOrderValue" && context.canChangeMenu) return ACTIONS["average-order-value"];
  if (context.primaryConcern === "returning" && context.returningDataStatus === "known" && context.hasConsentDb) return ACTIONS["returning-message"];
  if (context.capacity === "sometimes") return ACTIONS["off-peak-offer"];
  return ACTIONS["local-discovery"];
}
```

When `context.bottleneck.status === "known"`, the action reason rendered by the result screen must name that evidence-backed key and its period-over-period percentage change. When the status is `insufficient`, the UI must say that the recommendation is based on target size, capacity, and execution conditions rather than calling a stage the confirmed bottleneck.

Create `src/content/coaching.ts` as a readonly record for `revenue-before-ranking`, `three-revenue-levers`, `exposure-is-not-sales`, and `channel-has-a-role`. Each value has `topic`, `summary` of at most three short sentences, and `version: 1`. Do not mention ebook chapters or reading progress.

- [ ] **Step 9: Verify and commit the recommendation engine**

Run:

```bash
pnpm test -- tests/bottleneck.test.ts tests/recommendation.test.ts
pnpm typecheck
```

Expected: all recommendation tests pass.

Commit:

```bash
git add src/domain/types.ts src/domain/bottleneck.ts src/domain/recommendation.ts src/content/coaching.ts tests/bottleneck.test.ts tests/recommendation.test.ts
git commit -m "feat: select one safe coaching action"
```

---

### Task 4: Service Boundary and Synthetic Demo Mode

**Files:**
- Create: `src/services/contracts.ts`
- Create: `src/services/demo-service.ts`
- Create: `tests/demo-service.test.ts`

**Interfaces:**
- Produces: `AppService` with session, assessment, action-plan, and check-in methods
- Produces: `createDemoService(): AppService`
- Consumes: `RevenueInputs`, `RevenueMetrics`, `RecommendationContext`, `RecommendedAction`

- [ ] **Step 1: Write failing demo privacy and persistence tests**

Create `tests/demo-service.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { createDemoService } from "../src/services/demo-service";

describe("demo service", () => {
  test("returns only the fixed synthetic buyer", async () => {
    const service = createDemoService();
    expect(await service.getSession()).toMatchObject({ mode: "demo", profile: { name: "샘플 사장님", businessName: "샘플 식당" } });
  });

  test("rejects real registration data in demo mode", async () => {
    const service = createDemoService();
    await expect(service.registerBuyer({ name: "실명", email: "real@example.com", region: "서울", businessName: "실제 업체", inviteCode: "ABC", serviceConsent: true, marketingConsent: false })).rejects.toThrow("데모에서는 개인정보를 저장하지 않습니다.");
  });

  test("stores action status only in memory", async () => {
    const service = createDemoService();
    await service.saveActionPlan({ assessmentId: "demo-assessment", actionKey: "local-discovery", metric: "7일간 전화 수", checkInDueAt: "2026-07-26" });
    expect(await service.listActionPlans()).toHaveLength(1);
    expect(localStorage.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run `pnpm test -- tests/demo-service.test.ts`.

Expected: FAIL because the service files do not exist.

- [ ] **Step 3: Define complete service contracts**

Create `src/services/contracts.ts` with these exported types and signatures:

```ts
export interface BuyerRegistration { name: string; email: string; region: string; businessName: string; inviteCode: string; serviceConsent: boolean; marketingConsent: boolean }
export interface BuyerProfile { id: string; name: string; email: string; region: string; businessName: string }
export interface AppSession { mode: "demo" | "live"; profile: BuyerProfile | null }
export interface AssessmentSnapshot { id: string; inputs: Record<string, unknown>; metrics: Record<string, unknown>; diagnosis: Record<string, unknown>; createdAt: string }
export interface ActionPlanDraft { assessmentId: string; actionKey: string; metric: string; checkInDueAt: string }
export interface ActionPlanRecord extends ActionPlanDraft { id: string; status: "planned" | "completed"; beforeValue: string | null; afterValue: string | null; note: string | null }

export interface AppService {
  getSession(): Promise<AppSession>;
  registerBuyer(input: BuyerRegistration): Promise<void>;
  sendLoginLink(email: string): Promise<void>;
  finalizeRegistration(): Promise<AppSession>;
  signOut(): Promise<void>;
  saveAssessment(snapshot: Omit<AssessmentSnapshot, "id" | "createdAt">): Promise<AssessmentSnapshot>;
  getLatestAssessment(): Promise<AssessmentSnapshot | null>;
  saveActionPlan(draft: ActionPlanDraft): Promise<ActionPlanRecord>;
  listActionPlans(): Promise<ActionPlanRecord[]>;
  completeActionPlan(id: string, beforeValue: string, afterValue: string, note: string): Promise<ActionPlanRecord>;
}
```

- [ ] **Step 4: Implement an in-memory demo service**

Create `src/services/demo-service.ts` with fixed IDs, fixed synthetic profile, one in-memory assessment slot, and one in-memory action array. Every returned object must be cloned with `structuredClone`. `registerBuyer` and `sendLoginLink` must reject with `데모에서는 개인정보를 저장하지 않습니다.`. `signOut` clears only the in-memory arrays and does not call `localStorage` or `sessionStorage`.

- [ ] **Step 5: Verify and commit the service boundary**

Run:

```bash
pnpm test -- tests/demo-service.test.ts
pnpm typecheck
```

Expected: all tests pass and `localStorage.length` remains zero.

Commit:

```bash
git add src/services/contracts.ts src/services/demo-service.ts tests/demo-service.test.ts
git commit -m "feat: add private synthetic demo service"
```

---

### Task 5: Three-Step Diagnosis and Result UI

**Files:**
- Create: `src/app.ts`
- Create: `src/ui/shell.ts`
- Create: `src/ui/diagnosis.ts`
- Create: `src/ui/result.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Create: `tests/diagnosis-ui.test.ts`

**Interfaces:**
- Consumes: `AppService`, `calculateRevenueMetrics`, `validateRevenueInputs`, `selectBottleneck`, `selectAction`, and coaching content
- Produces: `createApp(root: HTMLElement, service: AppService): { start(): Promise<void> }`
- Produces: form parser `readDiagnosisForm(form: HTMLFormElement): DiagnosisInput`

- [ ] **Step 1: Write failing UI flow tests**

Create `tests/diagnosis-ui.test.ts` with these complete helpers and the main flow test:

```ts
import { beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app";
import { createDemoService } from "../src/services/demo-service";

const text = () => document.body.textContent ?? "";
const click = (selector: string) => {
  const button = document.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`missing button ${selector}`);
  button.click();
};
const setValue = (name: string, value: string) => {
  const input = document.querySelector<HTMLInputElement>(`[name='${name}']`);
  if (!input) throw new Error(`missing input ${name}`);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
const choose = (name: string, value: string) => {
  const input = document.querySelector<HTMLInputElement>(`[name='${name}'][value='${value}']`);
  if (!input) throw new Error(`missing choice ${name}:${value}`);
  input.click();
};

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
});

test("completes the three-step all-new-customer ceiling flow", async () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing test root");
  await createApp(root, createDemoService()).start();
  click("[data-start-diagnosis]");
  expect(text()).toContain("최근 월평균 매출");
  expect(document.querySelectorAll("[data-step]")).toHaveLength(3);

  setValue("averageMonthlyRevenue", "30,000,000");
  setValue("targetMonthlyRevenue", "40,000,000");
  setValue("averageOrderValue", "25,000");
  setValue("operatingDays", "20");
  click("[data-next-step]");
  choose("monthlyCustomerCountStatus", "unknown");
  choose("primaryConcern", "unknown");
  click("[data-next-step]");
  choose("capacity", "yes");
  choose("returningDataStatus", "unknown");
  choose("hasConsentDb", "false");
  choose("canChangeMenu", "true");
  choose("adsRunning", "false");
  click("[data-submit-diagnosis]");

  expect(text()).toContain("최대 400명");
  expect(text()).toContain("전부 신규 고객으로 채운다고 가정");
  expect(document.querySelectorAll("[data-recommended-action]")).toHaveLength(1);
  expect(text()).not.toContain("재방문이 문제입니다");
});
```

- [ ] **Step 2: Run the UI tests and confirm failure**

Run `pnpm test -- tests/diagnosis-ui.test.ts`.

Expected: FAIL because `createApp` and diagnosis screens do not exist.

- [ ] **Step 3: Implement the app state and diagnosis parser**

Define `DiagnosisInput` in `src/ui/diagnosis.ts` as:

```ts
export interface DiagnosisInput {
  revenue: RevenueInputs;
  bottleneck: BottleneckInputs;
  primaryConcern: PrimaryConcern;
  capacity: Capacity;
  returningDataStatus: ReturningDataStatus;
  hasConsentDb: boolean;
  canChangeMenu: boolean;
  adsRunning: boolean;
  adAttributionKnown: boolean;
}
```

`readDiagnosisForm` must remove commas, convert blank customer count to `null`, and read explicit radio values for capacity and returning status. `renderDiagnosis` must render three `fieldset` panels and validate each step before moving forward. Step 3 must include an optional details section for previous/current exposure, click, visit, average order value, and returning-customer values. Returning values are ignored unless the user selects a connected visit-history source and `returningDataStatus` becomes `known`. Put error text next to the affected control and focus the first invalid control.

- [ ] **Step 4: Implement the result screen**

`renderResult` in `src/ui/result.ts` must render:

```text
목표까지 부족한 매출
전부 신규 고객으로 채운다고 가정한 최대 필요 고객 수
월 영업일 기준 하루 최대 필요 고객 수
오늘의 행동 한 가지
선택 근거
실행 방법 세 단계
확인할 숫자 하나
하지 말아야 할 행동
관련 코칭 원칙 세 문장 이하
```

Format won amounts with `Intl.NumberFormat("ko-KR")`. Use the exact qualification sentence `실제로 재방문과 객단가 개선이 포함되면 필요한 신규 고객 수는 줄어듭니다.`. Do not render a repeat-visit bottleneck when `returningDataStatus` is `unknown`.

Call `selectBottleneck(input.bottleneck)` before `selectAction`. Render a confirmed bottleneck only when its status is `known`. For `insufficient`, render `비교할 이전 기간 수치가 부족해 병목을 단정하지 않았습니다.` and explain that the selected action is based on target size, capacity, and execution conditions.

- [ ] **Step 5: Wire main entry to explicit demo mode**

Create `src/config.ts`:

```ts
export interface AppConfig { mode: "demo" | "live"; supabaseUrl: string | null; supabaseAnonKey: string | null }

export function readConfig(env: ImportMetaEnv): AppConfig {
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim() || null;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY?.trim() || null;
  const live = Boolean(supabaseUrl && supabaseAnonKey && env.VITE_APP_MODE === "live");
  return { mode: live ? "live" : "demo", supabaseUrl, supabaseAnonKey };
}
```

In `src/main.ts`, show the landing shell first. The demo button creates `createApp(root, createDemoService())` and starts it. The live registration button remains disabled with the text `운영 연결 준비 중` until Task 7 supplies the live service.

- [ ] **Step 6: Verify and commit the vertical demo flow**

Run:

```bash
pnpm test -- tests/diagnosis-ui.test.ts
pnpm test
pnpm typecheck
pnpm build
```

Expected: all tests pass; the result shows 400 maximum customers and exactly one action.

Commit:

```bash
git add src/app.ts src/config.ts src/main.ts src/styles.css src/ui/shell.ts src/ui/diagnosis.ts src/ui/result.ts tests/diagnosis-ui.test.ts
git commit -m "feat: add goal diagnosis demo flow"
```

---

### Task 6: Supabase Schema, RLS, and Invite Functions

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202607190001_init.sql`
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/redeem-invite/index.ts`
- Create: `supabase/functions/finalize-registration/index.ts`
- Create: `supabase/tests/database/rls.test.sql`

**Interfaces:**
- Produces tables: `profiles`, `consent_events`, `invite_codes`, `invite_attempts`, `pending_registrations`, `stores`, `assessments`, `goals`, `action_plans`, `check_ins`
- Produces RPCs: `finalize_buyer_registration(p_user_id uuid, p_email text) returns uuid` and `save_assessment_with_goal(p_store_id uuid, p_input_data jsonb, p_calculated_metrics jsonb, p_diagnosis jsonb, p_target_revenue numeric, p_period_start date, p_period_end date) returns uuid`
- Produces Edge endpoints: `redeem-invite` and `finalize-registration`

- [ ] **Step 1: Write failing pgTAP tests**

Create `supabase/tests/database/rls.test.sql` with `plan(9)` and assertions that:

```sql
select has_table('public', 'profiles');
select has_table('public', 'invite_codes');
select has_table('public', 'pending_registrations');
select has_table('public', 'assessments');
select has_function('public', 'finalize_buyer_registration', array['uuid', 'text']);
select has_function('public', 'save_assessment_with_goal', array['uuid', 'jsonb', 'jsonb', 'jsonb', 'numeric', 'date', 'date']);
select policies_are('public', 'assessments', array['assessment_owner_select', 'assessment_owner_insert']);
select policies_are('public', 'action_plans', array['action_owner_select', 'action_owner_insert', 'action_owner_update']);
select policies_are('public', 'check_ins', array['checkin_owner_select', 'checkin_owner_insert', 'checkin_owner_update']);
```

Run:

```bash
pnpm exec supabase start
pnpm exec supabase test db
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 2: Create the complete database migration**

The migration must:

1. Enable `pgcrypto`.
2. Create all ten tables with UUID primary keys, `timestamptz` timestamps, foreign keys, and check constraints for status values; enforce one store per buyer with a unique constraint on `stores.user_id`.
3. Store only `code_hash`, never invite code plaintext.
4. Make `pending_registrations.email` unique and keep its PII inaccessible to `anon` and `authenticated` roles.
5. Add `user_id` indexes to every user-owned table.
6. Enable RLS on every public table.
7. Revoke all privileges on `invite_codes`, `invite_attempts`, and `pending_registrations` from `anon` and `authenticated`.
8. Add owner select/insert/update policies using `(select auth.uid()) = user_id`.
9. Create `finalize_buyer_registration` as `security definer set search_path = public`.
10. Create `save_assessment_with_goal` as an authenticated-user function that verifies store ownership and inserts the assessment and goal atomically.

`finalize_buyer_registration` must atomically lock the pending row by normalized email, verify the reserved invite has not expired, insert an active profile and one store, insert both required and optional consent events, mark the invite `redeemed`, delete the pending row, and return the store ID. It must raise `registration_not_ready` when the reservation is absent or invalid.

- [ ] **Step 3: Implement shared HTTP helpers**

Create `supabase/functions/_shared/http.ts` with:

```ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "http://localhost:5173",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
```

- [ ] **Step 4: Implement `redeem-invite`**

The function must handle `OPTIONS`, accept only `POST`, validate name/email/region/businessName/inviteCode and both consent booleans, and create two Supabase clients: anonymous for Auth email sending and service-role for protected tables.

Use `sha256(INVITE_HASH_PEPPER + normalizedInviteCode)` to query `invite_codes.code_hash`. Before validation, hash the client IP and count `invite_attempts` from the last 15 minutes; reject the sixth attempt with HTTP 429. For a valid unused and unexpired code, upsert `pending_registrations`, reserve the code for the normalized email, then call:

```ts
await authClient.auth.signInWithOtp({
  email,
  options: {
    emailRedirectTo: `${Deno.env.get("SITE_URL")}/?auth=callback`,
    shouldCreateUser: true,
  },
});
```

Return HTTP 202 with `{ accepted: true }`. Return the same HTTP 400 body `{ error: "코드를 확인할 수 없습니다. 입력 내용을 다시 확인해 주세요." }` for nonexistent, expired, used, or mismatched codes.

- [ ] **Step 5: Implement `finalize-registration`**

Require a bearer token, create a user-scoped client with that header, call `auth.getUser()`, reject users without an email, and call the service-role RPC:

```ts
await adminClient.rpc("finalize_buyer_registration", {
  p_user_id: user.id,
  p_email: user.email.toLowerCase(),
});
```

Return `{ active: true }` on success and a generic 403 response on any registration mismatch. Do not return pending profile or invite data.

- [ ] **Step 6: Verify database tests and commit**

Run:

```bash
pnpm exec supabase db reset
pnpm exec supabase test db
pnpm exec supabase functions serve redeem-invite --env-file supabase/.env.local
```

Expected: pgTAP reports `9 tests, 0 failures`; the function server starts without TypeScript errors. Stop the function server after the startup check.

Commit:

```bash
git add supabase/config.toml supabase/migrations/202607190001_init.sql supabase/functions/_shared/http.ts supabase/functions/redeem-invite/index.ts supabase/functions/finalize-registration/index.ts supabase/tests/database/rls.test.sql
git commit -m "feat: add secure buyer invite backend"
```

---

### Task 7: Live Supabase Service and Onboarding UI

**Files:**
- Create: `.env.example`
- Create: `src/env.d.ts`
- Create: `src/services/supabase-client.ts`
- Create: `src/services/supabase-service.ts`
- Create: `src/ui/onboarding.ts`
- Modify: `src/main.ts`
- Modify: `src/app.ts`
- Modify: `src/styles.css`
- Create: `tests/onboarding-ui.test.ts`

**Interfaces:**
- Consumes: `AppService`, `BuyerRegistration`, `readConfig`
- Produces: `createSupabaseService(url: string, anonKey: string): AppService`
- Produces: `renderOnboarding(root, service, callbacks): void`

- [ ] **Step 1: Write failing onboarding tests**

Create `tests/onboarding-ui.test.ts` with a fake service that captures calls without network access:

```ts
import { beforeEach, expect, test, vi } from "vitest";
import type { AppService, BuyerRegistration } from "../src/services/contracts";
import { renderOnboarding } from "../src/ui/onboarding";

const registrationCalls: BuyerRegistration[] = [];
const service = (): AppService => ({
  getSession: vi.fn(async () => ({ mode: "live", profile: null })),
  registerBuyer: vi.fn(async (input) => { registrationCalls.push(input); }),
  sendLoginLink: vi.fn(async () => undefined),
  finalizeRegistration: vi.fn(async () => ({ mode: "live", profile: null })),
  signOut: vi.fn(async () => undefined),
  saveAssessment: vi.fn(async () => { throw new Error("unused"); }),
  getLatestAssessment: vi.fn(async () => null),
  saveActionPlan: vi.fn(async () => { throw new Error("unused"); }),
  listActionPlans: vi.fn(async () => []),
  completeActionPlan: vi.fn(async () => { throw new Error("unused"); }),
});
const set = (name: string, value: string) => {
  const input = document.querySelector<HTMLInputElement>(`[name='${name}']`);
  if (!input) throw new Error(`missing ${name}`);
  input.value = value;
};

beforeEach(() => {
  registrationCalls.length = 0;
  document.body.innerHTML = '<div id="app"></div>';
});

test("keeps marketing consent optional", async () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  renderOnboarding(root, service(), { onAuthenticated: vi.fn() });
  set("name", "구매자"); set("email", "buyer@example.com"); set("region", "서울"); set("businessName", "구매자 식당"); set("inviteCode", "BUYER-001");
  document.querySelector<HTMLInputElement>("[name='serviceConsent']")?.click();
  document.querySelector<HTMLFormElement>("[data-registration-form]")?.requestSubmit();
  await Promise.resolve();
  expect(registrationCalls[0]).toMatchObject({ serviceConsent: true, marketingConsent: false });
  expect(document.body.textContent).toContain("이메일을 확인해 주세요");
});

test("requires service consent", () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  renderOnboarding(root, service(), { onAuthenticated: vi.fn() });
  const button = document.querySelector<HTMLButtonElement>("[data-register-submit]");
  expect(button?.disabled).toBe(true);
});
```

Append these tests using the same helpers:

```ts
test("shows a generic invite failure", async () => {
  const failing = service();
  failing.registerBuyer = vi.fn(async () => { throw new Error("코드를 확인할 수 없습니다. 입력 내용을 다시 확인해 주세요."); });
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  renderOnboarding(root, failing, { onAuthenticated: vi.fn() });
  set("name", "구매자"); set("email", "buyer@example.com"); set("region", "서울"); set("businessName", "구매자 식당"); set("inviteCode", "WRONG");
  document.querySelector<HTMLInputElement>("[name='serviceConsent']")?.click();
  document.querySelector<HTMLFormElement>("[data-registration-form]")?.requestSubmit();
  await Promise.resolve();
  await Promise.resolve();
  expect(document.body.textContent).toContain("코드를 확인할 수 없습니다");
});

test("sends an existing buyer login link", async () => {
  const fake = service();
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  renderOnboarding(root, fake, { onAuthenticated: vi.fn() });
  set("loginEmail", "buyer@example.com");
  document.querySelector<HTMLFormElement>("[data-login-form]")?.requestSubmit();
  await Promise.resolve();
  expect(fake.sendLoginLink).toHaveBeenCalledWith("buyer@example.com");
  expect(document.body.textContent).toContain("로그인 링크를 보냈습니다");
});
```

- [ ] **Step 2: Run the onboarding tests and confirm failure**

Run `pnpm test -- tests/onboarding-ui.test.ts`.

Expected: FAIL because onboarding UI does not exist.

- [ ] **Step 3: Implement the Supabase client and service**

`src/services/supabase-client.ts` must call `createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })` and export the client type for injection.

`src/services/supabase-service.ts` must implement every `AppService` method:

- `registerBuyer`: invoke `redeem-invite` with the exact registration fields.
- `sendLoginLink`: call `auth.signInWithOtp` with `shouldCreateUser: false`.
- `finalizeRegistration`: invoke `finalize-registration`, then select the authenticated profile.
- `getSession`: return null profile without a session; otherwise select active profile.
- `signOut`: call `auth.signOut`.
- `saveAssessment`: call `save_assessment_with_goal` so the assessment and target are committed atomically.
- Assessment and action methods: select or mutate only the current user's rows and map snake_case database rows to camelCase service types. `completeActionPlan` inserts a `check_ins` row with before and after values, then updates the plan status to `completed`.
- Every method must throw a Korean user-safe error and must not include raw Supabase messages in rendered UI.

Create `.env.example`:

```dotenv
VITE_APP_MODE=demo
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-anon-key
```

- [ ] **Step 4: Implement registration and login screens**

`renderOnboarding` must include labeled controls for name, email, region, business name, invite code, required service consent, optional marketing consent, and a separate existing-user login form. The invite code input uses `autocomplete="one-time-code"`; email uses `autocomplete="email"`. Do not put email or invite code in URL parameters.

Disable submission while pending, announce status with `role="status"`, render field errors adjacent to controls, and show only generic invite failures.

- [ ] **Step 5: Select live or demo service at startup**

In `src/main.ts`:

```ts
const config = readConfig(import.meta.env);
const service = config.mode === "live" && config.supabaseUrl && config.supabaseAnonKey
  ? createSupabaseService(config.supabaseUrl, config.supabaseAnonKey)
  : createDemoService();
```

Live mode must show onboarding when no active profile exists and dashboard/diagnosis after `finalizeRegistration`. Demo mode must never render personal registration fields; it enters through the explicit sample button.

- [ ] **Step 6: Verify and commit live onboarding**

Run:

```bash
pnpm test -- tests/onboarding-ui.test.ts
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands pass and the production bundle contains no service-role key name or sample invite code.

Commit:

```bash
git add .env.example src/env.d.ts src/services/supabase-client.ts src/services/supabase-service.ts src/ui/onboarding.ts src/main.ts src/app.ts src/styles.css tests/onboarding-ui.test.ts
git commit -m "feat: connect buyer email onboarding"
```

---

### Task 8: Personal Dashboard and Action Check-In

**Files:**
- Create: `src/ui/dashboard.ts`
- Modify: `src/app.ts`
- Modify: `src/ui/result.ts`
- Modify: `src/styles.css`
- Create: `tests/dashboard-ui.test.ts`

**Interfaces:**
- Consumes: `AppService.getLatestAssessment`, `saveActionPlan`, `listActionPlans`, and `completeActionPlan`
- Produces: `renderDashboard(root: HTMLElement, session: AppSession, service: AppService, onStartDiagnosis: () => void): Promise<void>`

- [ ] **Step 1: Write failing dashboard tests**

Create `tests/dashboard-ui.test.ts` with one complete state-and-check-in test:

```ts
import { expect, test, vi } from "vitest";
import type { ActionPlanRecord, AppService } from "../src/services/contracts";
import { renderDashboard } from "../src/ui/dashboard";

test("shows the next action and saves before-after results", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing root");
  const planned: ActionPlanRecord = {
    id: "plan-1", assessmentId: "assessment-1", actionKey: "local-discovery",
    metric: "길찾기 수", checkInDueAt: "2026-07-26", status: "planned",
    beforeValue: null, afterValue: null, note: null,
  };
  const saved: string[] = [];
  const fake = {
    getSession: vi.fn(async () => ({ mode: "demo", profile: { id: "demo", name: "샘플 사장님", email: "demo@example.invalid", region: "샘플", businessName: "샘플 식당" } })),
    registerBuyer: vi.fn(), sendLoginLink: vi.fn(), finalizeRegistration: vi.fn(), signOut: vi.fn(),
    saveAssessment: vi.fn(),
    getLatestAssessment: vi.fn(async () => ({ id: "assessment-1", inputs: { averageMonthlyRevenue: 30_000_000 }, metrics: { maxNewCustomers: 400 }, diagnosis: {}, createdAt: "2026-07-19T00:00:00.000Z" })),
    saveActionPlan: vi.fn(), listActionPlans: vi.fn(async () => [planned]),
    completeActionPlan: vi.fn(async (_id: string, before: string, after: string, note: string) => {
      saved.push(before, after, note);
      return { ...planned, status: "completed" as const, beforeValue: before, afterValue: after, note };
    }),
  } as unknown as AppService;

  await renderDashboard(root, await fake.getSession(), fake, vi.fn());
  expect(document.body.textContent).toContain("오늘 할 행동 찾기");
  expect(document.body.textContent).toContain("결과 확인 예정");
  document.querySelector<HTMLButtonElement>("[data-complete-plan='plan-1']")?.click();
  const set = (name: string, value: string) => {
    const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name='${name}']`);
    if (!input) throw new Error(`missing ${name}`);
    input.value = value;
  };
  set("beforeValue", "길찾기 7회"); set("afterValue", "길찾기 12회"); set("note", "대표사진 변경");
  document.querySelector<HTMLFormElement>("[data-checkin-form]")?.requestSubmit();
  await Promise.resolve();
  expect(saved).toEqual(["길찾기 7회", "길찾기 12회", "대표사진 변경"]);
  expect(document.body.textContent).toContain("결과 기록 완료");
  expect(window.location.href).not.toContain("30000000");
});
```

- [ ] **Step 2: Run the tests and confirm failure**

Run `pnpm test -- tests/dashboard-ui.test.ts`.

Expected: FAIL because `renderDashboard` does not exist.

- [ ] **Step 3: Implement dashboard states**

Render:

- Profile greeting with business name.
- Latest target and maximum new-customer ceiling when an assessment exists.
- One primary CTA `오늘 할 행동 찾기`.
- Planned actions ordered by nearest `checkInDueAt`.
- Completed actions with result value and note.
- Empty states that describe the next smallest action without blame.
- Sign-out button in live mode.

The result screen's `실행할게요` button must call `saveActionPlan` with an ISO date exactly seven calendar days after the assessment. The dashboard result form requires both `beforeValue` and `afterValue`; `note` is optional. Pass all four arguments to `completeActionPlan(id, beforeValue, afterValue, note)`. Never build a share URL containing assessment inputs.

- [ ] **Step 4: Verify and commit dashboard records**

Run:

```bash
pnpm test -- tests/dashboard-ui.test.ts
pnpm test
pnpm typecheck
```

Expected: all dashboard and regression tests pass.

Commit:

```bash
git add src/ui/dashboard.ts src/app.ts src/ui/result.ts src/styles.css tests/dashboard-ui.test.ts
git commit -m "feat: track coaching actions and results"
```

---

### Task 9: CI, GitHub Pages Demo, and Operations Guide

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/pages.yml`
- Create: `README.md`
- Modify: `package.json`
- Test: all `tests/*.test.ts`

**Interfaces:**
- Consumes: `pnpm verify`, Vite `dist/`, demo mode
- Produces: repeatable pull-request checks and `main` GitHub Pages artifact

- [ ] **Step 1: Write the deployment build assertion**

Add `tests/build-config.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("deployment configuration", () => {
  test("uses the repository base path in GitHub Actions", () => {
    const source = readFileSync("vite.config.ts", "utf8");
    expect(source).toContain('process.env.GITHUB_ACTIONS ? "/marketing/" : "/"');
  });

  test("never exposes service role configuration to Vite", () => {
    const envExample = readFileSync(".env.example", "utf8");
    expect(envExample).not.toContain("SERVICE_ROLE");
    expect(envExample).not.toContain("INVITE_HASH_PEPPER");
  });
});
```

- [ ] **Step 2: Run the deployment test and confirm the workflow gap**

Run `pnpm test -- tests/build-config.test.ts`.

Expected: the test passes for config safety; `Test-Path .github/workflows/ci.yml` returns `False` because workflows do not exist.

- [ ] **Step 3: Add CI and Pages workflows**

`ci.yml` must trigger on pull requests and pushes to `main`, use `actions/checkout`, `pnpm/action-setup` with 11.9.0, `actions/setup-node` with Node 24 and pnpm cache, then run `pnpm install --frozen-lockfile` and `pnpm verify`.

`pages.yml` must trigger on pushes to `main` and manual dispatch, use the same verified install, run `VITE_APP_MODE=demo pnpm build`, upload `dist` with `actions/upload-pages-artifact`, and deploy using `actions/deploy-pages`. Set Pages `contents: read`, `pages: write`, and `id-token: write` permissions only.

- [ ] **Step 4: Write the operations guide**

`README.md` must include:

1. Product promise and explicit non-goals.
2. `pnpm install`, `pnpm dev`, and `pnpm verify` commands.
3. Demo mode statement: synthetic data only, no real registration.
4. Supabase setup: `supabase start`, `supabase db reset`, `supabase test db`, project link, migrations push, function secrets, function deploy.
5. Secret locations: `SUPABASE_SERVICE_ROLE_KEY`, `INVITE_HASH_PEPPER`, `SITE_URL`, and `ALLOWED_ORIGIN` exist only in Supabase function secrets.
6. Browser variables: only URL and publishable anon key.
7. Initial invite generation command that hashes a code locally and inserts only its hash through an authenticated admin SQL session.
8. GitHub Pages demo deployment and the reason live auth is not enabled without Supabase configuration.
9. Privacy review required before collecting production user data.

- [ ] **Step 5: Run full verification**

Run:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm exec supabase db reset
pnpm exec supabase test db
git diff --check
```

Expected: every command exits 0, Vitest reports all tests passing, pgTAP reports 9 tests with 0 failures, and `dist/` is ignored by git.

- [ ] **Step 6: Commit the delivery configuration**

```bash
git add .github/workflows/ci.yml .github/workflows/pages.yml README.md package.json tests/build-config.test.ts
git commit -m "ci: verify and deploy buyer coach demo"
```

- [ ] **Step 7: Final branch verification before publish**

Run:

```bash
git status --short --branch
git log --oneline --decorate -10
pnpm verify
```

Expected: clean working tree, nine focused implementation commits after the design and plan commits, and `pnpm verify` exits 0.

Publish through the GitHub workflow selected for the execution session. If implementing directly on `main` is not explicitly approved for the implementation phase, create `agent/buyer-sales-coach-mvp`, push it, and open a draft pull request into `main`.
