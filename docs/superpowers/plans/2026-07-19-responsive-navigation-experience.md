# 장사네비게이션 반응형 고객 경험 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영 기능과 Supabase 보안 흐름을 유지하면서 장사네비게이션의 소개, 가입, 진단, 결과, 대시보드를 PC와 모바일에서 읽고 사용하기 쉬운 혼합형 반응형 경험으로 개편한다.

**Architecture:** 현재의 프레임워크 없는 TypeScript 렌더링 모듈과 `AppService` 경계를 유지한다. `shell`이 비로그인 사용자의 소개와 진입 선택을 담당하고, `app`이 가입·로그인·진단 화면 전환을 연결하며, 각 UI 모듈은 의미 있는 클래스와 접근성 속성을 출력한다. 스타일은 하나의 전역 토큰 시스템과 1024px·720px 반응형 구간으로 통합한다.

**Tech Stack:** TypeScript 7, Vite 8, Vitest 4, happy-dom, plain CSS, Supabase JavaScript client

## Global Constraints

- 제품명은 모든 핵심 화면에서 `장사네비게이션`으로 표시한다.
- 첫 화면은 짙은 네이비·차콜, 가입·진단·결과·대시보드는 밝은 배경을 사용한다.
- 강조색은 초록과 따뜻한 주황으로 제한한다.
- 현재 TypeScript 렌더링 구조와 `AppService` 인터페이스를 유지하며 React로 전환하지 않는다.
- 인증 완료는 기존처럼 명시적인 사용자 버튼 동작으로만 실행한다.
- 모바일 주요 입력과 버튼은 최소 48px 높이로 만들고 375px에서 가로 스크롤을 만들지 않는다.
- 동작 애니메이션은 약 200ms로 제한하고 `prefers-reduced-motion`을 존중한다.
- 새로운 개인정보 수집 항목, 결제, 전자책 열람, AI 대화, 외부 POS 연동은 추가하지 않는다.

---

### Task 1: 브랜드 소개와 운영 진입 흐름

**Files:**
- Modify: `src/ui/shell.ts`
- Modify: `src/app.ts`
- Modify: `src/main.ts`
- Modify: `index.html`
- Test: `tests/app-shell.test.ts`
- Test: `tests/live-app.test.ts`

**Interfaces:**
- Consumes: `AppService.getSession(): Promise<AppSession>`과 기존 `renderOnboarding` 진입점
- Produces: `LandingCallbacks`, `LandingOptions`, `renderLandingShell(root, callbacks, options)`

- [ ] **Step 1: 운영 소개 화면의 실패 테스트 작성**

```ts
test("brands the landing page and exposes both live entry choices", () => {
  const root = document.querySelector<HTMLElement>("#app")!;
  const onRegister = vi.fn();
  const onLogin = vi.fn();
  renderLandingShell(root, { onRegister, onLogin, onDemo: vi.fn() }, { mode: "live" });

  expect(root.textContent).toContain("장사네비게이션");
  expect(root.textContent).toContain("필요한 고객 수와 오늘 할 일");
  root.querySelector<HTMLButtonElement>("[data-start-registration]")?.click();
  root.querySelector<HTMLButtonElement>("[data-start-login]")?.click();
  expect(onRegister).toHaveBeenCalledTimes(1);
  expect(onLogin).toHaveBeenCalledTimes(1);
});

test("shows the landing page before onboarding for a signed-out live visitor", async () => {
  const fake = liveService();
  fake.getSession = vi.fn(async () => ({ mode: "live" as const, profile: null }));
  const root = document.querySelector<HTMLElement>("#app")!;
  await createApp(root, fake, { isLive: true }).start();

  expect(root.querySelector("[data-start-registration]")).not.toBeNull();
  expect(root.querySelector("[data-registration-form]")).toBeNull();
  root.querySelector<HTMLButtonElement>("[data-start-registration]")?.click();
  expect(root.querySelector("[data-registration-form]")).not.toBeNull();
});
```

- [ ] **Step 2: 실패 이유 확인**

Run: `pnpm vitest run tests/app-shell.test.ts tests/live-app.test.ts`

Expected: FAIL because the current shell does not render `data-start-registration` or `data-start-login`, and a signed-out live session opens onboarding immediately.

- [ ] **Step 3: 소개 화면 계약과 진입 전환 구현**

```ts
export interface LandingCallbacks {
  onRegister(): void;
  onLogin(): void;
  onDemo(): void;
}

export interface LandingOptions {
  mode: "demo" | "live";
}

export function renderLandingShell(
  root: HTMLElement,
  callbacks: LandingCallbacks,
  options: LandingOptions,
): void {
  root.innerHTML = `
    <div class="brand-page">
      <header class="site-header">
        <a class="skip-link" href="#main">본문 바로가기</a>
        <a class="brand-mark" href="#main" aria-label="장사네비게이션 홈">
          <span class="brand-symbol" aria-hidden="true">N</span>
          <strong>장사네비게이션</strong>
        </a>
        ${options.mode === "live" ? '<button class="header-login" type="button" data-start-login>기존 사용자 로그인</button>' : '<span class="demo-badge">샘플 모드</span>'}
      </header>
      <main id="main" class="landing-shell">
        <section class="hero-copy">
          <p class="eyebrow">매출 목표를 행동으로 바꾸는 가게 코치</p>
          <h1>목표 매출까지,<br><strong>필요한 고객 수와 오늘 할 일</strong>을 찾습니다.</h1>
          <p class="hero-description">가게의 현재 수치를 입력하면 목표까지 필요한 고객 수를 계산하고, 지금 먼저 바꿀 행동 하나를 안내합니다.</p>
          <div class="button-row">
            <button type="button" class="primary-cta" ${options.mode === "live" ? "data-start-registration" : "data-start-diagnosis"}>내 가게 진단 시작하기</button>
            ${options.mode === "live" ? '<button type="button" class="secondary-cta" data-start-login>기존 사용자 로그인</button>' : ""}
          </div>
          <ul class="trust-list" aria-label="이용 안내"><li>약 3분</li><li>카드정보 불필요</li><li>매장 맞춤 안내</li></ul>
        </section>
        <ol class="journey-preview" aria-label="장사네비게이션 이용 순서">
          <li><span>01</span><strong>목표 매출 설정</strong></li>
          <li><span>02</span><strong>필요 고객 수 확인</strong></li>
          <li><span>03</span><strong>오늘의 행동 선택</strong></li>
        </ol>
      </main>
    </div>`;

  root.querySelector<HTMLButtonElement>("[data-start-registration]")
    ?.addEventListener("click", callbacks.onRegister);
  root.querySelector<HTMLButtonElement>("[data-start-diagnosis]")
    ?.addEventListener("click", callbacks.onDemo);
  root.querySelectorAll<HTMLButtonElement>("[data-start-login]")
    .forEach((button) => button.addEventListener("click", callbacks.onLogin));
}
```

Add this local transition next to `showOnboarding` and use it for a signed-out live session that is not handling an auth callback:

```ts
const showLanding = () => {
  renderLandingShell(
    root,
    {
      onRegister: () => showOnboarding(false, "register"),
      onLogin: () => showOnboarding(false, "login"),
      onDemo: () => showDiagnosis(),
    },
    { mode: options.isLive ? "live" : "demo" },
  );
};

if (session.mode === "live" && !session.profile) {
  if (options.authCallback) showOnboarding(true, "register");
  else showLanding();
  return;
}
```

Change the document title in `index.html` to:

```html
<title>장사네비게이션 | 목표 매출 행동 코치</title>
```

- [ ] **Step 4: 랜딩과 운영 흐름 테스트 통과 확인**

Run: `pnpm vitest run tests/app-shell.test.ts tests/live-app.test.ts`

Expected: PASS. Existing explicit auth-callback confirmation tests must remain green.

- [ ] **Step 5: 커밋**

```bash
git add index.html src/ui/shell.ts src/app.ts src/main.ts tests/app-shell.test.ts tests/live-app.test.ts
git commit -m "feat: add branded live entry journey"
```

### Task 2: 가입과 로그인 화면 분리

**Files:**
- Modify: `src/ui/onboarding.ts`
- Test: `tests/onboarding-ui.test.ts`

**Interfaces:**
- Consumes: `AppService.registerBuyer`, `AppService.sendLoginLink`, `AppService.finalizeRegistration`
- Produces: `OnboardingView = "register" | "login"`, `registrationScreenMarkup(): string`, `loginScreenMarkup(): string`, `bindRegistration(root, service): void`, `bindLogin(root, service): void`, and `renderOnboarding(root, service, callbacks, initialView?)`

- [ ] **Step 1: 화면 모드와 전환 동작의 실패 테스트 작성**

```ts
test("opens only the requested onboarding form and lets the buyer switch", () => {
  const root = document.querySelector<HTMLElement>("#app")!;
  renderOnboarding(root, service(), { onAuthenticated: vi.fn() }, "login");

  expect(root.querySelector("[data-login-form]")).not.toBeNull();
  expect(root.querySelector("[data-registration-form]")).toBeNull();
  root.querySelector<HTMLButtonElement>("[data-show-register]")?.click();
  expect(root.querySelector("[data-registration-form]")).not.toBeNull();
  expect(root.querySelector("[data-login-form]")).toBeNull();
});

test("labels every registration field as required or optional", () => {
  const root = document.querySelector<HTMLElement>("#app")!;
  renderOnboarding(root, service(), { onAuthenticated: vi.fn() }, "register");
  expect(root.querySelectorAll(".required-label")).toHaveLength(5);
  expect(root.textContent).toContain("선택");
});
```

- [ ] **Step 2: 테스트가 기존 동시 폼 출력 때문에 실패하는지 확인**

Run: `pnpm vitest run tests/onboarding-ui.test.ts`

Expected: FAIL because both forms are rendered together and no view-switch controls exist.

- [ ] **Step 3: 재사용 가능한 화면 렌더링과 기존 이벤트 연결 구현**

```ts
export type OnboardingView = "register" | "login";

export function renderOnboarding(
  root: HTMLElement,
  service: AppService,
  callbacks: OnboardingCallbacks,
  initialView: OnboardingView = "register",
): void {
  if (callbacks.authCallback) {
    renderConfirmation(root, service, callbacks);
    return;
  }

  const renderView = (view: OnboardingView) => {
    root.innerHTML = view === "register"
      ? registrationScreenMarkup()
      : loginScreenMarkup();
    root.querySelector<HTMLButtonElement>("[data-show-register]")
      ?.addEventListener("click", () => renderView("register"));
    root.querySelector<HTMLButtonElement>("[data-show-login]")
      ?.addEventListener("click", () => renderView("login"));
    view === "register"
      ? bindRegistration(root, service, callbacks)
      : bindLogin(root, service);
  };

  renderView(initialView);
}
```

`registrationScreenMarkup()` must output `.onboarding-layout`, `.onboarding-intro`, `.form-card`, five `.required-label` markers, the existing names and error IDs, and `data-show-login`. `loginScreenMarkup()` must retain `loginEmail`, `loginEmail-error`, `data-login-submit`, `.login-status`, and add `data-show-register`. Extract existing event bodies to `bindRegistration` and `bindLogin` without changing validation or generic authentication responses.

- [ ] **Step 4: 가입·로그인과 보안 회귀 테스트 통과 확인**

Run: `pnpm vitest run tests/onboarding-ui.test.ts tests/live-app.test.ts`

Expected: PASS, including the test that prevents automatic finalization after an auth callback.

- [ ] **Step 5: 커밋**

```bash
git add src/ui/onboarding.ts tests/onboarding-ui.test.ts
git commit -m "feat: simplify buyer onboarding views"
```

### Task 3: 진단 단계의 가독성과 입력 맥락

**Files:**
- Modify: `src/ui/diagnosis.ts`
- Test: `tests/diagnosis-ui.test.ts`

**Interfaces:**
- Consumes: existing `Step = 1 | 2 | 3`, `readDiagnosisForm`, and `RenderOptions.onSubmit`
- Produces: `.progress-track`, `[data-progress]`, `.question-grid`, `.choice-card`, `.field-unit`

- [ ] **Step 1: 진행 정보와 선택 카드의 실패 테스트 작성**

```ts
test("shows a readable three-step progress indicator", () => {
  const root = document.querySelector<HTMLElement>("#app")!;
  renderDiagnosis(root, { onSubmit: vi.fn() });
  expect(root.querySelector("[data-step-label]")?.textContent).toBe("1 / 3");
  expect(root.querySelector<HTMLElement>("[data-progress]")?.style.width).toBe("33.3333%");
  root.querySelector<HTMLButtonElement>("[data-next-step]")?.click();
  expect(root.querySelector("[data-step-label]")?.textContent).toBe("2 / 3");
});

test("treats unknown returning data as a normal selectable card", () => {
  const root = document.querySelector<HTMLElement>("#app")!;
  renderDiagnosis(root, { onSubmit: vi.fn() });
  root.querySelectorAll<HTMLButtonElement>("[data-next-step]")[0]?.click();
  root.querySelectorAll<HTMLButtonElement>("[data-next-step]")[0]?.click();
  const unknown = root.querySelector<HTMLInputElement>("[name='returningDataStatus'][value='unknown']");
  expect(unknown?.closest(".choice-card")?.textContent).toContain("잘 모르겠어요");
});
```

- [ ] **Step 2: 새 진행 요소와 카드 클래스가 없어 실패하는지 확인**

Run: `pnpm vitest run tests/diagnosis-ui.test.ts`

Expected: FAIL on missing `data-step-label`, `data-progress`, or `.choice-card`.

- [ ] **Step 3: 단계 헤더와 의미 있는 입력 그룹 구현**

At the start of the diagnosis markup, render:

```html
<header class="work-header">
  <a class="work-brand" href="/">장사네비게이션</a>
  <div class="progress-copy"><span>매장 진단</span><strong data-step-label>1 / 3</strong></div>
  <div class="progress-track" aria-hidden="true"><span data-progress></span></div>
</header>
```

In the existing `showStep(step)` function update both visible panels and progress:

```ts
const label = root.querySelector<HTMLElement>("[data-step-label]");
const progress = root.querySelector<HTMLElement>("[data-progress]");
if (label) label.textContent = `${step} / 3`;
if (progress) progress.style.width = `${(step / 3) * 100}%`;
```

Wrap related numeric fields in `.question-grid`, render visible unit labels with `.field-unit`, and apply `.choice-card` to every radio label. Preserve all input names, values, validation branches, disclosure controls, and submit semantics. Change the unknown repeat-data label to `잘 모르겠어요 — 신규 고객 기준으로 계산할게요` without changing its value from `unknown`.

- [ ] **Step 4: 진단과 계산 회귀 테스트 통과 확인**

Run: `pnpm vitest run tests/diagnosis-ui.test.ts tests/revenue.test.ts tests/recommendation.test.ts`

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/ui/diagnosis.ts tests/diagnosis-ui.test.ts
git commit -m "feat: clarify diagnosis progress and inputs"
```

### Task 4: 결과와 대시보드의 의사결정 위계

**Files:**
- Modify: `src/ui/result.ts`
- Modify: `src/ui/dashboard.ts`
- Test: `tests/dashboard-ui.test.ts`
- Test: `tests/diagnosis-ui.test.ts`

**Interfaces:**
- Consumes: existing result data, `checkInDueDate`, `ActionPlanRecord`, and dashboard service calls
- Produces: `.metric-hero`, `.metric-card`, `.estimate-badge`, `.action-card`, `.before-after`

- [ ] **Step 1: 핵심 결과 순서와 기록 비교의 실패 테스트 작성**

```ts
test("puts the customer target before the recommended action", () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app")!;
  renderResult(root, {
    metrics: {
      shortfallRevenue: 10_000_000,
      maxNewCustomers: 400,
      maxNewCustomersPerDay: 20,
      monthlyCustomerCount: 1200,
      customerCountSource: "estimated",
      targetReached: false,
    },
    bottleneck: {
      key: null,
      status: "insufficient",
      changeRate: null,
      reason: "수치가 부족합니다.",
    },
    action: {
      key: "local-discovery",
      title: "대표 사진을 확인해요",
      reason: "지금 할 수 있어요.",
      steps: ["사진을 봐요", "한 장을 바꿔요", "길찾기를 적어요"],
      metric: "길찾기 수",
      avoid: "광고비를 먼저 늘리지 마세요.",
      minutes: 15,
      coachingKey: "revenue-before-ranking",
    },
  }, { onSaveAction: vi.fn() });
  const metric = root.querySelector(".metric-hero");
  const action = root.querySelector(".action-card");
  expect(metric).not.toBeNull();
  expect(action).not.toBeNull();
  expect(metric!.compareDocumentPosition(action!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(root.querySelector(".estimate-badge")?.textContent).toContain("추정");
});
```

In the existing `shows the business summary, nearest plan, and completed history` dashboard test, append:

```ts
expect(root.querySelector(".before-after")?.textContent).toContain("실행 전");
expect(root.querySelector(".before-after")?.textContent).toContain("실행 후");
```

- [ ] **Step 2: 시각 위계 클래스가 없어 실패하는지 확인**

Run: `pnpm vitest run tests/diagnosis-ui.test.ts tests/dashboard-ui.test.ts`

Expected: FAIL on missing `.metric-hero`, `.action-card`, `.estimate-badge`, or `.before-after`.

- [ ] **Step 3: 결과와 대시보드 마크업 재구성**

Result markup must follow this order:

```html
<header class="work-header"><a class="work-brand" href="/">장사네비게이션</a><span class="status-chip">진단 완료</span></header>
<section class="metric-hero" aria-labelledby="customer-target-title">
  <p class="eyebrow">목표까지 필요한 고객</p>
  <h1 id="customer-target-title"><strong class="metric-value">…명</strong></h1>
  <span class="estimate-badge">추정 기준</span>
</section>
<section class="metric-grid">…</section>
<section class="action-card">…</section>
```

Use existing formatted values and calculation notes; do not change formulas. Render action duration, ordered steps, measurement metric, and avoid guidance as separate child elements. Keep `data-save-action` and the current status region.

Dashboard markup must begin with `.dashboard-hero`, then `.current-action.action-card`, `.upcoming-actions`, and `.action-history`. For a completed plan render:

```html
<div class="before-after">
  <span><small>실행 전</small><strong>${plan.beforeValue}</strong></span>
  <span aria-hidden="true">→</span>
  <span><small>실행 후</small><strong>${plan.afterValue}</strong></span>
</div>
```

Preserve check-in field names, validation, retry focus, data attributes, sign-out, and empty states.

- [ ] **Step 4: 결과·대시보드 회귀 테스트 통과 확인**

Run: `pnpm vitest run tests/diagnosis-ui.test.ts tests/dashboard-ui.test.ts tests/live-app.test.ts`

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/ui/result.ts src/ui/dashboard.ts tests/diagnosis-ui.test.ts tests/dashboard-ui.test.ts
git commit -m "feat: prioritize coaching decisions in results"
```

### Task 5: 반응형 디자인 시스템과 접근성

**Files:**
- Rewrite: `src/styles.css`
- Create: `tests/responsive-styles.test.ts`

**Interfaces:**
- Consumes: semantic classes produced by Tasks 1–4
- Produces: global color/spacing/type tokens, desktop layouts, 1024px and 720px adaptations, reduced-motion behavior

- [ ] **Step 1: 반응형 계약의 실패 테스트 작성**

```ts
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("defines mobile, desktop, touch, and reduced-motion safeguards", () => {
  expect(css).toContain("@media (min-width: 1024px)");
  expect(css).toContain("@media (max-width: 720px)");
  expect(css).toContain("min-height: 48px");
  expect(css).toContain("prefers-reduced-motion: reduce");
  expect(css).toContain("overflow-wrap: anywhere");
});

test("separates the dark brand surface from light work surfaces", () => {
  expect(css).toMatch(/--brand-bg:\s*#0b1512/);
  expect(css).toMatch(/--work-bg:\s*#f4f6f1/);
  expect(css).toContain(".brand-page");
  expect(css).toContain(".work-header");
});
```

- [ ] **Step 2: 기존 스타일에 새 토큰과 구간이 없어 실패하는지 확인**

Run: `pnpm vitest run tests/responsive-styles.test.ts`

Expected: FAIL on missing brand/work tokens, the 1024px breakpoint, 48px touch target, or reduced-motion query.

- [ ] **Step 3: 전체 스타일을 승인된 토큰과 레이아웃으로 교체**

Start `src/styles.css` with:

```css
:root {
  --brand-bg: #0b1512;
  --brand-surface: #11201b;
  --work-bg: #f4f6f1;
  --panel: #ffffff;
  --ink: #132019;
  --muted: #5c685f;
  --green: #1f7a55;
  --green-dark: #14563d;
  --orange: #e8893a;
  --border: #dce3dc;
  --focus: #1263d6;
  --danger: #a32929;
  --shadow: 0 18px 55px rgba(20, 42, 31, 0.1);
  --radius-sm: 12px;
  --radius-md: 20px;
  --radius-lg: 32px;
  --content: 1200px;
  --work-content: 960px;
  font-family: Pretendard, "Noto Sans KR", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

Implement mobile-first one-column layouts, 48px controls, visible focus outlines, complete hover and disabled states, `.brand-page` dark surfaces, `.journey-preview`, `.onboarding-layout`, `.question-grid`, `.choice-card`, `.metric-grid`, `.before-after`, and gentle error/status styling. Add:

```css
@media (min-width: 1024px) {
  .landing-shell { grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr); }
  .onboarding-layout { grid-template-columns: minmax(0, 0.8fr) minmax(420px, 1.2fr); }
  .question-grid, .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 720px) {
  .site-header, .work-header { padding-inline: 16px; }
  .header-login { display: none; }
  .landing-shell, .diagnosis-shell, .result-shell, .onboarding-shell, .dashboard-shell { width: min(100% - 24px, var(--work-content)); }
  .button-row, .form-actions { flex-direction: column; }
  .button-row button, .form-actions button { width: 100%; }
  .before-after { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
```

Apply `overflow-wrap: anywhere` to headings, metric values, cards, and business names. Ensure fields remain at least 16px on mobile to prevent unwanted browser zoom.

- [ ] **Step 4: 스타일 계약과 전체 UI 테스트 통과 확인**

Run: `pnpm vitest run tests/responsive-styles.test.ts tests/app-shell.test.ts tests/onboarding-ui.test.ts tests/diagnosis-ui.test.ts tests/dashboard-ui.test.ts`

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/styles.css tests/responsive-styles.test.ts
git commit -m "feat: add responsive navigation design system"
```

### Task 6: 전체 검증과 운영 재배포

**Files:**
- Modify only if verification exposes a defect: files already listed in Tasks 1–5 and their matching tests

**Interfaces:**
- Consumes: complete site build and Vercel/Supabase production configuration
- Produces: verified production deployment at the stable Vercel alias

- [ ] **Step 1: 전체 정적·동작 검증 실행**

Run: `pnpm verify`

Expected: formatting check, TypeScript, all Vitest files, security scan, and Vite production build all PASS.

- [ ] **Step 2: 375px·768px·1440px 브라우저 확인**

Open the production-like local build and verify at each viewport:

```text
375x812: no horizontal overflow; full-width primary actions; readable form labels; one-column results
768x1024: comfortable card spacing; no clipped headings or currency values
1440x900: dark landing split layout; light work screens use the centered 960px content width
```

Verify the complete demo path: landing → three diagnosis steps → result → save action → dashboard. Verify live signed-out entry exposes register and login, and auth callback still requires explicit confirmation.

- [ ] **Step 3: 최종 변경사항 커밋 및 원격 브랜치 푸시**

```bash
git status --short
git push origin agent/buyer-sales-coach-mvp
```

Expected: only the pre-existing local `.gitignore` adjustment may remain outside the feature commits; the remote feature branch receives all new commits.

- [ ] **Step 4: Vercel 운영 재배포**

```bash
pnpm dlx vercel@50.28.0 --prod --yes
```

Expected: deployment reaches READY and the stable alias remains `https://buyer-sales-coach-mvp.vercel.app`.

- [ ] **Step 5: 운영 주소 점검**

Request `https://buyer-sales-coach-mvp.vercel.app` and confirm HTTP 200, the title `장사네비게이션 | 목표 매출 행동 코치`, and the current hashed JavaScript and stylesheet assets. Check Vercel runtime error logs for the deployment; expected result is no new application errors.
