# AI Coaching Loading Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 답변을 기다리는 동안 회전 링, 순차 점 표시, 약한 배경 이동으로 처리 중임을 명확히 보여준다.

**Architecture:** 기존 `renderCoaching` 상태 머신과 `busy` 값은 유지한다. `shell` 함수가 바쁜 상태에서만 접근성 문구와 분리된 장식용 요소를 렌더링하고, 모든 움직임은 `src/styles.css`에서 처리한다.

**Tech Stack:** TypeScript, DOM template rendering, CSS keyframes, Vitest, happy-dom, Vite

## Global Constraints

- 기존 `role="status"`, `aria-live="polite"`, `aria-atomic="true"`를 유지한다.
- 스크린리더가 읽는 문구는 `답변을 준비하고 있습니다.` 한 번뿐이어야 한다.
- 장식용 링과 점은 `aria-hidden="true"`로 숨긴다.
- `prefers-reduced-motion: reduce`에서는 반복 애니메이션을 모두 중지한다.
- 서버 요청, OpenAI 호출, Supabase 저장 흐름은 변경하지 않는다.

---

### Task 1: 로딩 상태의 의미와 시각 요소

**Files:**
- Modify: `tests/coaching-ui.test.ts`
- Modify: `src/ui/coaching.ts`

**Interfaces:**
- Consumes: `shell(content: string, busy: boolean, status: string): string`
- Produces: `[data-coaching-spinner]`, `[data-coaching-dots]`, 세 개의 `.coaching-loading-dot` 요소

- [ ] **Step 1: 로딩 중에만 장식 요소가 나타나는 실패 테스트 작성**

`tests/coaching-ui.test.ts`의 기존 비동기 요청 테스트에 다음 검증을 추가한다.

```ts
const spinner = root().querySelector("[data-coaching-spinner]");
const dots = root().querySelector("[data-coaching-dots]");

expect(spinner?.getAttribute("aria-hidden")).toBe("true");
expect(dots?.getAttribute("aria-hidden")).toBe("true");
expect(dots?.querySelectorAll(".coaching-loading-dot")).toHaveLength(3);
expect(loadingStatus?.textContent?.trim()).toBe(
  "답변을 준비하고 있습니다.",
);

resolveTurn?.(followUpResponse);
await flushPromises();

expect(root().querySelector("[data-coaching-spinner]")).toBeNull();
expect(root().querySelector("[data-coaching-dots]")).toBeNull();
```

- [ ] **Step 2: 테스트가 올바른 이유로 실패하는지 확인**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/coaching-ui.test.ts
```

Expected: `[data-coaching-spinner]` 또는 `[data-coaching-dots]`가 없어 FAIL.

- [ ] **Step 3: 최소 로딩 마크업 구현**

`src/ui/coaching.ts`에 바쁜 상태에서만 다음 구조가 생성되도록 `shell`을 변경한다.

```ts
const loadingVisual = busy
  ? `<span class="coaching-loading-visual" aria-hidden="true">
       <span class="coaching-loading-spinner" data-coaching-spinner></span>
       <span class="coaching-loading-dots" data-coaching-dots>
         <span class="coaching-loading-dot"></span>
         <span class="coaching-loading-dot"></span>
         <span class="coaching-loading-dot"></span>
       </span>
     </span>`
  : "";
```

상태 요소 안에서는 접근성 문구와 장식 요소를 분리한다.

```html
<p class="coaching-loading" role="status" aria-live="polite"
   aria-atomic="true" tabindex="-1" data-coaching-status>
  <span class="coaching-loading-copy">답변을 준비하고 있습니다.</span>
  ${loadingVisual}
</p>
```

`busy`가 거짓일 때는 기존 `sr-only` 상태 요소만 유지하고 장식 요소는 생성하지 않는다.

- [ ] **Step 4: 코칭 UI 테스트 통과 확인**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/coaching-ui.test.ts
```

Expected: PASS.

- [ ] **Step 5: 마크업 변경 커밋**

```powershell
git add src/ui/coaching.ts tests/coaching-ui.test.ts
git commit -m "feat: show active AI coaching progress"
```

---

### Task 2: 반응형 애니메이션과 모션 감소

**Files:**
- Modify: `tests/responsive-styles.test.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `.coaching-loading`, `.coaching-loading-spinner`, `.coaching-loading-dot`
- Produces: `coaching-spin`, `coaching-dot-pulse`, `coaching-loading-sheen` 애니메이션

- [ ] **Step 1: 사용자 관점의 CSS 계약 실패 테스트 작성**

`tests/responsive-styles.test.ts`에 다음 테스트를 추가한다.

```ts
test("animates coaching progress while respecting reduced motion", () => {
  expect(css).toMatch(
    /\.coaching-loading-spinner\s*\{[^}]*animation:\s*coaching-spin/s,
  );
  expect(css).toMatch(
    /\.coaching-loading-dot\s*\{[^}]*animation:\s*coaching-dot-pulse/s,
  );
  expect(css).toMatch(
    /\.coaching-loading::before\s*\{[^}]*animation:\s*coaching-loading-sheen/s,
  );
  expect(css).toMatch(
    /prefers-reduced-motion:\s*reduce[\s\S]*\.coaching-loading-spinner[\s\S]*animation:\s*none/s,
  );
});
```

- [ ] **Step 2: 테스트가 애니메이션 누락으로 실패하는지 확인**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/responsive-styles.test.ts
```

Expected: `coaching-spin` 계약이 없어 FAIL.

- [ ] **Step 3: 최소 애니메이션과 반응형 스타일 구현**

`src/styles.css`의 `.coaching-loading` 주변을 다음 책임으로 확장한다.

```css
.coaching-loading {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  overflow: hidden;
}

.coaching-loading::before {
  position: absolute;
  inset: 0;
  z-index: -1;
  content: "";
  background: linear-gradient(
    110deg,
    transparent 25%,
    rgb(255 255 255 / 55%) 48%,
    transparent 72%
  );
  transform: translateX(-120%);
  animation: coaching-loading-sheen 2.2s ease-in-out infinite;
}

.coaching-loading-visual,
.coaching-loading-dots {
  display: inline-flex;
  align-items: center;
}

.coaching-loading-visual {
  gap: 0.5rem;
}

.coaching-loading-spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgb(17 112 78 / 22%);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: coaching-spin 0.8s linear infinite;
}

.coaching-loading-dots {
  gap: 0.22rem;
}

.coaching-loading-dot {
  width: 0.3rem;
  height: 0.3rem;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.25;
  animation: coaching-dot-pulse 1.2s ease-in-out infinite;
}

.coaching-loading-dot:nth-child(2) {
  animation-delay: 0.16s;
}

.coaching-loading-dot:nth-child(3) {
  animation-delay: 0.32s;
}

@keyframes coaching-spin {
  to { transform: rotate(360deg); }
}

@keyframes coaching-dot-pulse {
  50% { opacity: 1; transform: translateY(-2px); }
}

@keyframes coaching-loading-sheen {
  45%,
  100% { transform: translateX(120%); }
}
```

기존 `@media (prefers-reduced-motion: reduce)` 블록에 다음 규칙을 넣는다.

```css
.coaching-loading::before,
.coaching-loading-spinner,
.coaching-loading-dot {
  animation: none;
}
```

- [ ] **Step 4: 반응형 스타일과 코칭 UI 테스트 통과 확인**

Run:

```powershell
& .\node_modules\.bin\vitest.cmd run tests/responsive-styles.test.ts tests/coaching-ui.test.ts
```

Expected: PASS.

- [ ] **Step 5: 애니메이션 변경 커밋**

```powershell
git add src/styles.css tests/responsive-styles.test.ts
git commit -m "feat: animate AI coaching loading state"
```

---

### Task 3: 전체 검증과 운영 배포

**Files:**
- Verify: `src/ui/coaching.ts`
- Verify: `src/styles.css`
- Verify: `tests/coaching-ui.test.ts`
- Verify: `tests/responsive-styles.test.ts`

**Interfaces:**
- Consumes: Task 1과 Task 2의 로딩 마크업 및 CSS 애니메이션
- Produces: 검증된 GitHub main 커밋과 Vercel 운영 배포

- [ ] **Step 1: 전체 품질 검사 실행**

Run:

```powershell
& .\node_modules\.bin\prettier.cmd --check .
& .\node_modules\.bin\tsc.cmd --noEmit
& .\node_modules\.bin\vitest.cmd run
node scripts\security-scan.mjs
& .\node_modules\.bin\vite.cmd build
```

Expected: 모든 명령 exit 0, 테스트 실패 0개, 보안 검사 통과.

- [ ] **Step 2: 변경 범위 확인**

Run:

```powershell
git diff --check
git status --short --branch
git log --oneline main..HEAD
```

Expected: 로딩 UI, 스타일, 테스트, 설계·계획 문서만 포함.

- [ ] **Step 3: GitHub main 반영**

기능 브랜치를 원격에 게시하고 main에 병합한 뒤 main을 게시한다.

```powershell
git push -u origin agent/coaching-loading-motion
git switch main
git merge --no-ff agent/coaching-loading-motion -m "Merge animated AI coaching loading state"
git push origin main
```

- [ ] **Step 4: Vercel 운영 배포와 공개 번들 확인**

연결된 `buyer-sales-coach-mvp` 프로젝트에 production 배포한다. 배포가 `READY`인지 확인하고 공개 번들에 `coaching-loading-spinner`, `coaching-loading-dots`, `coaching-loading-sheen`이 포함됐는지 확인한다.

- [ ] **Step 5: 운영 로딩 화면 확인**

로그인된 진단 완료 계정에서 AI 질문을 제출하고 다음을 확인한다.

- 답변 대기 중 회전 링이 지속적으로 움직인다.
- 점 3개가 순서대로 강조된다.
- 상태 박스 배경이 은은하게 이동한다.
- 답변 또는 오류가 도착하면 모든 로딩 장식이 사라진다.
- 중복 요청이 생성되지 않는다.
