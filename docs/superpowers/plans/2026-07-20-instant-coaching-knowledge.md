# Instant Coaching Knowledge System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기본 진단을 완료한 장사네비게이션 사용자가 여섯 가지 고민 카드 또는 자유 질문으로 현재 문제를 묻고, 승인된 계산·규칙·콘텐츠에 근거한 실행 행동 한 가지를 즉시 받게 한다.

**Architecture:** 브라우저는 Vercel 서버 함수에 Supabase 액세스 토큰과 최소 입력만 전송한다. 서버는 사용자와 진단 소유권을 검증하고, 개인정보를 제거한 진단 문맥을 구성한 뒤, AI에는 질문 분류와 자연어 구성을 맡기고 결정론적 규칙 엔진에는 후속 질문·행동 선택·금지 조건을 맡긴다. 세션·메시지·추천·피드백은 Supabase에 사용자별로 격리해 저장하며, AI 장애 시에도 동일한 규칙 결과를 템플릿으로 반환한다.

**Tech Stack:** React, TypeScript, Vite, Vitest, happy-dom, Supabase Auth/Postgres/RLS, Vercel Functions, OpenAI Responses API (`gpt-5-mini`, strict JSON schema), pnpm.

## Global Constraints

- AI가 행동 키, 계산 결과, 근거 등급 또는 금지 여부를 새로 만들지 못하게 한다.
- 이름, 이메일, 연락처, 초대 코드와 전자책 원문은 AI 요청에 포함하지 않는다.
- 자유 질문은 500자, 추가 질문은 세션당 최대 2개, API 호출은 사용자당 최근 1시간 20회로 제한한다.
- 최초 행동은 승인된 15개 행동만 사용하고, 같은 입력은 같은 행동을 선택해야 한다.
- 조작·허위 리뷰·트래픽 구매·순위 보장 요청은 거절하고 합법적인 대안 한 가지를 제시한다.
- 클라이언트가 보낸 진단 수치와 행동 키를 신뢰하지 않고 서버가 Supabase에서 다시 조회한다.
- 공식 정보는 검토 기한이 지나면 자동 추천 대상에서 제외한다.
- 모바일에서 카드와 버튼의 최소 터치 높이는 44px이며 한국어 단어가 글자 중간에서 잘리지 않게 한다.

## File Structure

```text
api/
  _lib/
    coaching-handler.ts       # 인증·소유권·속도 제한·규칙·AI 조합
    openai.ts                 # Responses API strict JSON 어댑터
    supabase-admin.ts         # 서버 전용 Supabase REST 호출
  coaching.ts                 # Vercel HTTP 진입점
src/
  coaching/
    content.ts                # 승인된 15개 행동과 근거 메타데이터
    context.ts                # 진단 레코드를 비식별 코칭 문맥으로 변환
    rules.ts                  # 후속 질문과 행동의 결정론적 선택
    safety.ts                 # 금지 요청 탐지와 안전 대안
    types.ts                  # 서버·클라이언트 공용 코칭 계약
  services/
    contracts.ts              # AppService 코칭 메서드
    demo-service.ts           # 데모용 결정론 응답
    supabase-service.ts       # 인증 토큰을 포함한 코칭 API 호출
  ui/
    coaching.ts               # 고민 선택·질문·응답·피드백 화면
    styles.css                # 반응형 코칭 화면
src/app.ts                    # 대시보드와 코칭 화면 전환
src/ui/dashboard.ts           # 진단 완료 사용자용 코칭 진입 버튼
supabase/migrations/
  202607200010_instant_coaching.sql
tests/
  coaching-api.test.ts
  coaching-content.test.ts
  coaching-database-contract.test.ts
  coaching-openai.test.ts
  coaching-rules.test.ts
  coaching-safety.test.ts
  coaching-ui.test.ts
  dashboard-ui.test.ts
  live-app.test.ts
  supabase-service.test.ts
```

---

### Task 1: Define the coaching contracts and curated action catalog

**Files:**

- Create: `src/coaching/types.ts`
- Create: `src/coaching/content.ts`
- Create: `tests/coaching-content.test.ts`

**Interfaces produced:** `CoachingConcernKey`, `CoachingIntent`, `CoachingContext`, `CoachingActionDefinition`, `CoachingTurnRequest`, `CoachingTurnResponse`, `CoachingResponse`, `CoachingFeedback`.

- [ ] **Step 1: Write the failing catalog contract test**

```ts
import { describe, expect, it } from "vitest";
import { coachingActions } from "../src/coaching/content";

describe("coaching action catalog", () => {
  it("contains 15 unique, reviewable, executable actions", () => {
    expect(coachingActions).toHaveLength(15);
    expect(new Set(coachingActions.map((action) => action.key)).size).toBe(15);
    for (const action of coachingActions) {
      expect(action.steps.length).toBeGreaterThanOrEqual(2);
      expect(action.steps.length).toBeLessThanOrEqual(3);
      expect(action.metric).not.toBe("");
      expect(action.avoid).not.toBe("");
      expect(["official", "principle", "hypothesis"]).toContain(
        action.evidenceLevel,
      );
      if (action.evidenceLevel === "official") {
        expect(action.reviewAfter).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing-module failure**

Run: `pnpm test tests/coaching-content.test.ts`

Expected: FAIL because `src/coaching/content.ts` does not exist.

- [ ] **Step 3: Add exact shared contracts**

```ts
export type CoachingConcernKey =
  | "not_visible"
  | "visible_no_visit"
  | "ads_no_customers"
  | "low_average_order_value"
  | "low_returning"
  | "unknown";

export type CoachingIntent =
  | "discovery"
  | "selection"
  | "confidence"
  | "visit"
  | "returning"
  | "profit"
  | "unknown";

export type CoachingFeedback = "helpful" | "too_hard" | "not_relevant";
export type EvidenceLevel = "official" | "principle" | "hypothesis";

export interface CoachingContext {
  assessmentId: string;
  targetRevenue: number | null;
  averageOrderValue: number | null;
  currentCustomerCount: number | null;
  requiredCustomerCount: number | null;
  returningCustomerKnown: boolean;
  returningCustomerRate: number | null;
  advertisingActive: boolean | null;
  advertisingConversionKnown: boolean;
  tableCount: number | null;
  dailyTurnover: number | null;
  completedActionKeys: string[];
}

export interface CoachingActionDefinition {
  key: string;
  intent: CoachingIntent;
  title: string;
  triggerKeys: string[];
  blockerKeys: string[];
  requiredEvidence: string[];
  followUpQuestions: string[];
  reasonTemplate: string;
  steps: string[];
  metric: string;
  avoid: string;
  evidenceLevel: EvidenceLevel;
  verifiedAt: string;
  reviewAfter?: string;
  version: number;
}

export interface CoachingResponse {
  situation: string;
  stage: string;
  evidence: string[];
  actionTitle: string;
  steps: string[];
  metric: string;
  avoid: string;
  disclaimer?: string;
}

export interface CoachingFollowUp {
  key: string;
  prompt: string;
  options: string[];
}

export interface CoachingTurnRequest {
  assessmentId: string;
  sessionId?: string;
  concernKey?: CoachingConcernKey;
  question?: string;
  answer?: { questionKey: string; value: string };
}

export type CoachingTurnResponse =
  | {
      kind: "follow_up";
      sessionId: string;
      question: CoachingFollowUp;
      remaining: number;
    }
  | {
      kind: "answer";
      sessionId: string;
      recommendationId: string;
      response: CoachingResponse;
    };
```

- [ ] **Step 4: Implement all 15 catalog records**

Implement the following immutable definitions. Each record must include its listed intent, exact title, 2–3 concrete steps, one observable metric, one avoid warning, triggers, blockers, evidence metadata and version `1`.

| Key                             | Intent     | Exact Korean title                           | Primary metric                |
| ------------------------------- | ---------- | -------------------------------------------- | ----------------------------- |
| `verify_search_visibility`      | discovery  | 우리 가게가 실제로 노출되는 검색어 확인하기  | 검색어별 노출 여부            |
| `rewrite_search_intent_profile` | discovery  | 방문 목적이 보이는 소개 문장으로 바꾸기      | 수정 전후 상세 진입 수        |
| `audit_cover_photo`             | selection  | 대표사진 한 장으로 선택 이유 보여주기        | 대표사진 변경 후 상세 진입률  |
| `clarify_signature_menu`        | selection  | 대표 메뉴·가격·주문 조합 정리하기            | 대표 메뉴 조회 또는 주문 비중 |
| `define_selection_reason`       | selection  | 우리 가게를 선택할 이유 한 가지 정하기       | 선택 이유를 언급한 고객 수    |
| `complete_visit_information`    | confidence | 영업시간·주차·예약·대기 정보를 완성하기      | 동일 문의 건수 변화           |
| `classify_customer_questions`   | confidence | 반복되는 고객 질문과 불만 분류하기           | 상위 질문 유형별 건수         |
| `rewrite_detail_answers`        | confidence | 상세 설명을 고객 질문의 답으로 바꾸기        | 문의 후 방문 전환 수          |
| `track_ad_to_visit_path`        | visit      | 광고부터 실제 방문까지 경로 기록하기         | 광고 유입 대비 실제 방문 수   |
| `find_visit_dropoff`            | visit      | 클릭·전화·예약·방문 중 이탈 지점 찾기        | 단계별 전환율                 |
| `identify_return_reason`        | returning  | 첫 방문에서 다시 올 이유 확인하기            | 재방문 이유 응답 수           |
| `offer_consent_based_return`    | returning  | 동의한 고객에게 재방문 이유 안내하기         | 동의 고객의 재방문 수         |
| `offer_natural_add_on`          | profit     | 대표 메뉴 옆에 자연스러운 추가 주문 제안하기 | 추가 주문 선택률과 객단가     |
| `separate_peak_operations`      | profit     | 붐비는 시간과 한산한 시간 운영을 나누기      | 시간대별 회전율과 매출        |
| `audit_capacity_channels`       | profit     | 좌석·포장·배달 구조로 수용력 점검하기        | 채널별 주문 수와 처리 시간    |

`offer_consent_based_return` must include a consent blocker. Advertising actions must require actual conversion evidence or select measurement first. Official actions must have a future `reviewAfter` date; principle and hypothesis actions must not present outcomes as guarantees.

- [ ] **Step 5: Run focused verification**

Run: `pnpm test tests/coaching-content.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```text
feat: add curated coaching action catalog
```

---

### Task 2: Build privacy, safety, context, and deterministic rules

**Files:**

- Create: `src/coaching/safety.ts`
- Create: `src/coaching/context.ts`
- Create: `src/coaching/rules.ts`
- Create: `tests/coaching-safety.test.ts`
- Create: `tests/coaching-rules.test.ts`

**Interfaces consumed:** `CoachingContext`, `CoachingActionDefinition`, `CoachingIntent`.

**Interfaces produced:** `sanitizeQuestion`, `detectProhibitedRequest`, `buildCoachingContext`, `chooseNextTurn`, `selectAction`.

- [ ] **Step 1: Write failing safety and determinism tests**

```ts
it.each([
  "영수증 리뷰를 사는 법",
  "트래픽 구매로 순위 올리기",
  "상위노출 보장해줘",
])("blocks manipulation request: %s", (question) =>
  expect(detectProhibitedRequest(question).blocked).toBe(true),
);

it("removes contact details before provider use", () => {
  expect(
    sanitizeQuestion("김대표 010-1234-5678 a@b.com 매출이 안 나요"),
  ).not.toMatch(/010|a@b\.com|김대표/);
});

it("selects the same action for the same normalized input", () => {
  const first = selectAction({ intent: "profit", context, answers: {} });
  const second = selectAction({ intent: "profit", context, answers: {} });
  expect(second.key).toBe(first.key);
});

it("does not recommend ad optimization without conversion evidence", () => {
  const result = selectAction({
    intent: "visit",
    context: {
      ...context,
      advertisingActive: true,
      advertisingConversionKnown: false,
    },
    answers: {},
  });
  expect(result.key).toBe("track_ad_to_visit_path");
});
```

- [ ] **Step 2: Confirm failures**

Run: `pnpm test tests/coaching-safety.test.ts tests/coaching-rules.test.ts`

Expected: FAIL because safety and rules modules are missing.

- [ ] **Step 3: Implement privacy and prohibited-request handling**

Use explicit Korean and English patterns for phone, email, fake reviews, purchased traffic, ranking guarantees and review wording coercion. Return:

```ts
export interface SafetyResult {
  blocked: boolean;
  reason?:
    "fake_review" | "paid_traffic" | "ranking_guarantee" | "review_coercion";
  alternativeActionKey?: string;
}
```

Blocked requests must map to one approved action key such as `complete_visit_information` or `track_ad_to_visit_path`, never instructions for the prohibited act.

- [ ] **Step 4: Implement server-owned context mapping**

`buildCoachingContext` accepts the existing assessment, goal, store, recommendation and completed-plan records. It returns only `CoachingContext`; it must omit name, email, region, store name, contact details and invite code. Unknown returning-customer data must produce `returningCustomerKnown: false` and `returningCustomerRate: null`, not zero.

- [ ] **Step 5: Implement deterministic next-turn selection**

Rules run in this order:

1. Reject prohibited requests and select a safe alternative.
2. Normalize explicit concern card to an intent; otherwise use classified intent.
3. Ask a follow-up only when a required field can change the selected action.
4. Never ask more than two follow-ups.
5. Prefer measurement actions when evidence is unknown.
6. Remove blocked and expired-official actions.
7. Score remaining actions with stable numeric weights and break ties by catalog order.
8. Avoid a completed action unless it is a required prerequisite.

Return a discriminated union:

```ts
type RuleDecision =
  | { kind: "follow_up"; question: CoachingFollowUp }
  | { kind: "action"; action: CoachingActionDefinition; reasonKeys: string[] }
  | { kind: "blocked"; action: CoachingActionDefinition; reason: string };
```

- [ ] **Step 6: Add edge-case tests**

Cover unknown return rate, missing AOV, missing table count, expired official evidence, completed-action avoidance, consent blocker, two-question maximum, and all six intents selecting a catalog action.

- [ ] **Step 7: Run focused verification and commit**

Run: `pnpm test tests/coaching-safety.test.ts tests/coaching-rules.test.ts && pnpm typecheck`

Expected: PASS.

Commit:

```text
feat: add deterministic coaching rules and safety
```

---

### Task 3: Add protected coaching persistence and rate limiting

**Files:**

- Create: `supabase/migrations/202607200010_instant_coaching.sql`
- Create: `tests/coaching-database-contract.test.ts`
- Modify: `supabase/tests/database/rls.test.sql`

**Interfaces produced:** `coaching_sessions`, `coaching_messages`, `coaching_recommendations`, `coaching_request_events`, `consume_coaching_request(uuid)`.

- [ ] **Step 1: Write the failing migration contract test**

```ts
const sql = readFileSync(
  "supabase/migrations/202607200010_instant_coaching.sql",
  "utf8",
);

expect(sql).toContain("create table public.coaching_sessions");
expect(sql).toContain("create table public.coaching_messages");
expect(sql).toContain("create table public.coaching_recommendations");
expect(sql).toContain("enable row level security");
expect(sql).toContain("consume_coaching_request");
expect(sql).toMatch(/revoke all.+coaching_request_events/is);
expect(sql).toMatch(/grant execute.+service_role/is);
```

- [ ] **Step 2: Confirm the missing migration failure**

Run: `pnpm test tests/coaching-database-contract.test.ts`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create exact schema and constraints**

Create:

- `coaching_sessions`: UUID id, user/store/assessment UUIDs, concern key, initial question, intent, confidence, active/answered status, `follow_up_count` constrained to 0–2, JSONB context, timestamps, unique `(id, user_id)`.
- `coaching_messages`: UUID id, user/session UUIDs, user/assistant role, JSONB payload, timestamp, composite foreign key `(session_id, user_id)`.
- `coaching_recommendations`: UUID id, user/session UUIDs, action key/version, JSONB evidence keys and metric snapshot, nullable feedback constrained to `helpful|too_hard|not_relevant`, timestamp, composite foreign key.
- `coaching_request_events`: user UUID and timestamp, with no authenticated/client grants.

Add indexes for user/session lookup and recent rate events.

- [ ] **Step 4: Add RLS and server-only write policy**

Enable RLS on all four tables. Active users may select only their own sessions/messages/recommendations. Do not create authenticated insert/update/delete policies. Grant the service role the required server writes. The request-events table and rate function remain inaccessible to browser roles.

- [ ] **Step 5: Implement atomic rolling-hour limiter**

`consume_coaching_request(p_user_id uuid)` must be `security definer`, set a fixed `search_path`, take a transaction advisory lock derived from the user ID, delete that user's rows older than one hour, reject when count is at least 20, otherwise insert the event and return true. Revoke public/authenticated execution; grant only service role.

- [ ] **Step 6: Extend pgTAP assertions**

Assert cross-user select denial, browser insert denial, service-role function access, follow-up count constraint and feedback enum constraint.

- [ ] **Step 7: Verify and commit**

Run: `pnpm test tests/coaching-database-contract.test.ts && pnpm exec supabase db lint --local`

Expected: PASS with local Supabase running; if it is unavailable, run the TypeScript contract test now and record the SQL check as a required pre-deploy gate.

Commit:

```text
feat: add secure coaching persistence
```

---

### Task 4: Implement the OpenAI adapter and testable server handler

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tsconfig.json`
- Modify: `.env.example`
- Create: `api/_lib/openai.ts`
- Create: `api/_lib/supabase-admin.ts`
- Create: `api/_lib/coaching-handler.ts`
- Create: `api/coaching.ts`
- Create: `tests/coaching-openai.test.ts`
- Create: `tests/coaching-api.test.ts`

**Interfaces consumed:** coaching types, safety functions, context builder, rule engine.

**Interfaces produced:** `classifyQuestion`, `composeCoachingResponse`, `handleCoachingRequest`, Vercel `/api/coaching` endpoint.

- [ ] **Step 1: Add server typings**

Run: `pnpm add -D @vercel/node@5.3.26 @types/node@24.3.0`

Modify `tsconfig.json` to include `api` and Node types while preserving strict settings.

- [ ] **Step 2: Write failing provider schema test**

```ts
it("uses strict structured output and the configured model", async () => {
  const fetcher = vi.fn().mockResolvedValue(okResponse(validProviderPayload));
  await composeCoachingResponse(input, {
    fetcher,
    apiKey: "test-key",
    model: "gpt-5-mini",
  });
  const [, init] = fetcher.mock.calls[0];
  const body = JSON.parse(init.body);
  expect(body.model).toBe("gpt-5-mini");
  expect(body.text.format.type).toBe("json_schema");
  expect(body.text.format.strict).toBe(true);
});

it("rejects an action title invented by the provider", async () => {
  await expect(
    composeCoachingResponse(input, inventedActionDeps),
  ).rejects.toThrow("INVALID_COACHING_RESPONSE");
});
```

- [ ] **Step 3: Write failing handler tests**

Cover: missing bearer token → 401, wrong assessment owner → 404, incomplete diagnosis → 409, 501st question character → 400, exhausted limiter → 429, second follow-up allowed, third prevented, provider failure → template answer, feedback by non-owner → 404.

Run: `pnpm test tests/coaching-openai.test.ts tests/coaching-api.test.ts`

Expected: FAIL because the API modules do not exist.

- [ ] **Step 4: Implement provider adapter using raw fetch**

POST to `https://api.openai.com/v1/responses`. Read `OPENAI_API_KEY` only on the server and default `OPENAI_COACHING_MODEL` to `gpt-5-mini`. Use strict JSON schema for both classification and composition. The composition prompt receives only sanitized question, rule-selected action, approved evidence, approved steps, metric and avoid text. Validate the decoded response again and reject:

- unknown keys,
- more than three steps,
- numbers not present in approved context or action,
- unapproved action titles,
- claims of guaranteed results.

- [ ] **Step 5: Implement the Supabase admin boundary**

Use server env variables `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Provide injected methods for tests: token verification, owned-assessment retrieval, rate consumption, session/message/recommendation insert, session update and feedback update. No service key may be exported to browser code or logged.

- [ ] **Step 6: Implement pure request orchestration**

`handleCoachingRequest(request, dependencies)` must:

1. accept POST only;
2. validate the bearer token;
3. parse a discriminated request body for `turn` or `feedback`;
4. verify active profile and assessment ownership/completion;
5. enforce limits;
6. sanitize input and build context from server records;
7. create or load an owned session;
8. classify only free-text questions;
9. run safety and deterministic rules;
10. store a follow-up or compose and validate an answer;
11. fall back to the catalog template on provider timeout/error;
12. persist the answer and return only client-safe fields.

The thin `api/coaching.ts` maps `VercelRequest`/`VercelResponse` to the pure handler.

- [ ] **Step 7: Document server variables**

Add to `.env.example` without values:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_COACHING_MODEL=gpt-5-mini
```

- [ ] **Step 8: Verify and commit**

Run: `pnpm test tests/coaching-openai.test.ts tests/coaching-api.test.ts && pnpm typecheck`

Expected: PASS.

Commit:

```text
feat: add secure instant coaching api
```

---

### Task 5: Connect coaching to the application service layer

**Files:**

- Modify: `src/services/contracts.ts`
- Modify: `src/services/supabase-service.ts`
- Modify: `src/services/demo-service.ts`
- Modify: `tests/supabase-service.test.ts`
- Modify: the existing demo-service test file

**Interfaces consumed:** `CoachingTurnRequest`, `CoachingTurnResponse`, `CoachingFeedback`.

**Interfaces produced:** `AppService.askCoach`, `AppService.rateCoaching`.

- [ ] **Step 1: Write failing service tests**

```ts
it("posts a coaching turn with the current access token", async () => {
  auth.getSession.mockResolvedValue({
    data: { session: { access_token: "token" } },
  });
  fetcher.mockResolvedValue(jsonResponse(answer));
  await service.askCoach({ assessmentId: "a1", concernKey: "not_visible" });
  expect(fetcher).toHaveBeenCalledWith(
    "/api/coaching",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    }),
  );
});

it("sends feedback through the protected endpoint", async () => {
  await service.rateCoaching("r1", "helpful");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    operation: "feedback",
    recommendationId: "r1",
    feedback: "helpful",
  });
});
```

- [ ] **Step 2: Confirm interface failures**

Run: `pnpm test tests/supabase-service.test.ts`

Expected: FAIL because the methods do not exist.

- [ ] **Step 3: Extend `AppService`**

```ts
askCoach(request: CoachingTurnRequest): Promise<CoachingTurnResponse>;
rateCoaching(recommendationId: string, feedback: CoachingFeedback): Promise<void>;
```

- [ ] **Step 4: Implement live and demo methods**

The live service obtains the current Supabase session immediately before each request, rejects an absent session with the existing authentication error convention, posts JSON, and converts non-2xx results into a Korean user-safe message plus machine-readable status. The demo service returns a deterministic, clearly labeled sample from the curated catalog without network access.

- [ ] **Step 5: Verify and commit**

Run: `pnpm test tests/supabase-service.test.ts tests/demo-service.test.ts && pnpm typecheck`

Expected: PASS; use the repository's actual demo test filename if it differs.

Commit:

```text
feat: connect coaching api to app services
```

---

### Task 6: Build the responsive coaching experience

**Files:**

- Create: `src/ui/coaching.ts`
- Modify: `src/ui/styles.css`
- Create: `tests/coaching-ui.test.ts`

**Interfaces consumed:** `AppService`, `CoachingTurnResponse`, assessment ID.

**Interfaces produced:** `renderCoaching(root, assessmentId, service, onBack)`.

- [ ] **Step 1: Write failing UI flow tests**

```ts
it("starts from a concern card and renders one follow-up at a time", async () => {
  renderCoaching(root, "a1", service, onBack);
  click('[data-concern="not_visible"]');
  await flushPromises();
  expect(root.querySelectorAll("[data-follow-up]")).toHaveLength(1);
  expect(root.querySelector("[data-coaching-answer]")).toBeNull();
});

it("renders the seven answer sections and feedback controls", async () => {
  service.askCoach.mockResolvedValue(answerResponse);
  renderCoaching(root, "a1", service, onBack);
  submitQuestion("광고를 하는데 손님이 늘지 않아요");
  await flushPromises();
  expect(root.querySelectorAll("[data-answer-section]")).toHaveLength(7);
  expect(root.querySelectorAll("[data-feedback]")).toHaveLength(3);
});

it("prevents empty and over-500-character submissions", () => {
  renderCoaching(root, "a1", service, onBack);
  expect(submitButton()).toBeDisabled();
  typeQuestion("가".repeat(501));
  expect(root.textContent).toContain("500자 이내");
});
```

- [ ] **Step 2: Confirm UI failures**

Run: `pnpm test tests/coaching-ui.test.ts`

Expected: FAIL because `renderCoaching` does not exist.

- [ ] **Step 3: Implement the initial coach screen**

Render six cards:

- 검색해도 우리 가게가 잘 안 보여요
- 플레이스는 보는데 방문하지 않아요
- 광고비는 쓰는데 손님이 늘지 않아요
- 손님은 오는데 객단가가 낮아요
- 한 번 온 고객이 다시 오지 않아요
- 무엇이 문제인지 모르겠어요

Below them add a 500-character free-text input, visible remaining count, disabled empty-submit state and a back button. Preserve focus and announce async status with `aria-live`.

- [ ] **Step 4: Implement follow-up and answer states**

Show only one follow-up card at a time with large choice buttons. For an answer render: current situation, bottleneck stage, evidence, one immediate action, 2–3 numbered steps, metric, and avoid warning. Add `도움됐어요`, `너무 어려워요`, `내 상황과 달라요` feedback buttons. Prevent duplicate submits and show retry on recoverable errors.

- [ ] **Step 5: Add responsive and Korean text styling**

Use a centered desktop column and edge-safe mobile layout. Set `word-break: keep-all`, `overflow-wrap: break-word`, appropriate line height, 44px controls, visible focus rings, and a sticky mobile primary action that does not cover content. Honor reduced motion.

- [ ] **Step 6: Add accessibility assertions**

Test keyboard activation, label associations, focus movement to the follow-up/answer heading, busy state, feedback selected state and error announcement.

- [ ] **Step 7: Verify and commit**

Run: `pnpm test tests/coaching-ui.test.ts && pnpm typecheck`

Expected: PASS.

Commit:

```text
feat: build responsive instant coaching ui
```

---

### Task 7: Gate and integrate coaching into the app flow

**Files:**

- Modify: `src/ui/dashboard.ts`
- Modify: `src/app.ts`
- Modify: `tests/dashboard-ui.test.ts`
- Modify: `tests/live-app.test.ts`

**Interfaces consumed:** `renderCoaching`, latest completed assessment ID.

- [ ] **Step 1: Write failing integration tests**

```ts
it("shows the coach entry only with a completed assessment", async () => {
  service.getLatestAssessment.mockResolvedValue(completedAssessment);
  await renderDashboard(
    root,
    session,
    service,
    onDiagnosis,
    onSignedOut,
    onCoaching,
  );
  click("[data-start-coaching]");
  expect(onCoaching).toHaveBeenCalledWith(completedAssessment.id);
});

it("does not show coaching before diagnosis completion", async () => {
  service.getLatestAssessment.mockResolvedValue(null);
  await renderDashboard(
    root,
    session,
    service,
    onDiagnosis,
    onSignedOut,
    onCoaching,
  );
  expect(root.querySelector("[data-start-coaching]")).toBeNull();
});
```

- [ ] **Step 2: Confirm failures**

Run: `pnpm test tests/dashboard-ui.test.ts tests/live-app.test.ts`

Expected: FAIL because the dashboard has no coaching callback or button.

- [ ] **Step 3: Add the dashboard entry point**

Extend `renderDashboard` with `onStartCoaching(assessmentId: string)`. Render `지금 고민 해결하기` only when the latest assessment is complete. Keep diagnosis retry and sign-out behavior unchanged.

- [ ] **Step 4: Add app navigation**

Create a `showCoaching(assessmentId)` view in `createApp`, pass it to the dashboard, and return from the coach to a freshly loaded dashboard. Do not add a public route that bypasses session and diagnosis checks.

- [ ] **Step 5: Run regression tests and commit**

Run: `pnpm test tests/dashboard-ui.test.ts tests/live-app.test.ts tests/coaching-ui.test.ts && pnpm typecheck`

Expected: PASS.

Commit:

```text
feat: integrate coaching into diagnosed user flow
```

---

### Task 8: Harden, verify, migrate, and deploy

**Files:**

- Modify: `README.md`
- Modify: `scripts/security-scan.mjs`
- Modify: test files only if verification exposes a real defect

**Interfaces verified:** production authentication, diagnosis gate, coaching API, persistence, feedback, fallback and mobile/desktop UX.

- [ ] **Step 1: Extend security scanning**

Add assertions that reject committed values matching OpenAI keys or Supabase service-role JWTs and reject `VITE_`-prefixed server secrets. Add a test fixture if the scanner has an existing fixture convention.

- [ ] **Step 2: Document operation without exposing secrets**

README must explain required Supabase migration, four server environment variables, Vercel environment scopes, 20/hour limit, 500-character limit, AI fallback, no-email/contact prompt rule, official-content review process and rollback instructions.

- [ ] **Step 3: Run complete local verification**

Run: `pnpm verify`

Expected: formatting, typecheck, all Vitest suites, security scan and production build PASS.

- [ ] **Step 4: Run local database verification**

Run: `pnpm exec supabase start`

Run: `pnpm exec supabase db reset`

Run: `pnpm exec supabase test db`

Expected: all migrations apply and pgTAP tests PASS. Do not deploy if the database checks fail.

- [ ] **Step 5: Perform browser acceptance checks**

Start the app and verify at 390×844 and 1440×900:

1. incomplete diagnosis has no coaching entry;
2. completed diagnosis shows the entry;
3. each concern card submits once;
4. free text enforces 500 characters;
5. one follow-up is displayed at a time and never exceeds two;
6. answer has all seven sections;
7. prohibited prompt returns a safe alternative;
8. feedback persists;
9. provider failure produces a usable template answer;
10. Korean words do not split awkwardly and controls remain reachable.

- [ ] **Step 6: Apply production migration**

Link the confirmed Supabase project and run the migration through the established repository deployment workflow. Inspect the migration diff before approval. After application, verify RLS with two separate test users and confirm browser roles cannot write coaching rows directly.

- [ ] **Step 7: Configure Vercel server variables and deploy preview**

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, and `OPENAI_COACHING_MODEL` for Preview and Production without echoing values. Deploy Preview first, execute the complete acceptance flow, then promote the verified deployment.

- [ ] **Step 8: Verify production and rollback readiness**

Confirm the production URL returns the updated build, a real diagnosed account completes a coaching turn, the recommendation row excludes PII, request limiting returns 429 after exhaustion in a controlled test environment, and logs contain no token/question PII. Keep the prior Vercel deployment available for immediate rollback; database rollback must disable the endpoint before removing any table.

- [ ] **Step 9: Final commit and push**

Run: `git status --short && git diff --check && git log -8 --oneline`

Expected: only intentional changes, no whitespace errors, and task commits visible.

Commit any final documentation-only adjustments as:

```text
docs: document instant coaching operations
```

Push the feature branch and update the existing pull request with verification evidence and the production URL.

## Completion Checklist

- [ ] All 15 approved actions are complete, versioned and tested.
- [ ] Rule selection is deterministic and prohibited requests are safely redirected.
- [ ] Unknown customer data stays unknown rather than becoming zero.
- [ ] AI receives no profile/contact/invite-code data and cannot invent actions or calculations.
- [ ] Assessment ownership, active-user state, rate limit and RLS are enforced server-side.
- [ ] Provider failure returns an approved template answer.
- [ ] Coaching appears only after a completed diagnosis.
- [ ] PC and mobile acceptance checks pass.
- [ ] Supabase migration and Vercel production deployment are verified.
- [ ] README, security scan, rollback notes and pull request evidence are current.
