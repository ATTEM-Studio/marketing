import { buildCoachingContext } from "../../src/coaching/context.js";
import { chooseNextTurn, selectAction } from "../../src/coaching/rules.js";
import { sanitizeQuestion } from "../../src/coaching/safety.js";
import type {
  CoachingConcernKey,
  CoachingContext,
  CoachingFeedback,
  CoachingFollowUp,
  CoachingIntent,
  CoachingResponse,
  CoachingTurnResponse,
} from "../../src/coaching/types.js";
import type { CoachingActionDefinition } from "../../src/coaching/types.js";
import {
  buildProviderQuestionSignals,
  type ComposeCoachingInput,
  type IntentResult,
  type ProviderQuestionSignals,
} from "./openai.js";
import type {
  CoachingAdmin,
  CoachingSessionRecord,
  OwnedCoachingAssessment,
} from "./supabase-admin.js";

export type {
  CoachingAdmin,
  CoachingSessionRecord,
  OwnedCoachingAssessment,
} from "./supabase-admin.js";

export interface CoachingHttpRequest {
  method?: string;
  headers: Record<string, string | readonly string[] | undefined>;
  body?: unknown;
}

export interface CoachingHttpResponse {
  status: number;
  body: Record<string, unknown> | CoachingTurnResponse;
  headers?: Record<string, string>;
}

export interface CoachingHandlerDependencies {
  admin: CoachingAdmin;
  classifyQuestion(
    questionSignals: ProviderQuestionSignals,
  ): Promise<IntentResult>;
  composeCoachingResponse(
    input: ComposeCoachingInput,
  ): Promise<CoachingResponse>;
  now?: () => Date;
  newId?: () => string;
}

interface TurnBody {
  kind: "turn";
  assessmentId: string;
  sessionId?: string;
  concernKey?: CoachingConcernKey;
  question?: string;
  answer?: { questionKey: string; value: string };
}

interface FeedbackBody {
  kind: "feedback";
  recommendationId: string;
  feedback: CoachingFeedback;
}

type RequestBody = TurnBody | FeedbackBody;

const concerns: readonly CoachingConcernKey[] = [
  "not_visible",
  "visible_no_visit",
  "ads_no_customers",
  "low_average_order_value",
  "low_returning",
  "unknown",
];
const feedbackValues: readonly CoachingFeedback[] = [
  "helpful",
  "too_hard",
  "not_relevant",
];
const concernIntent: Record<CoachingConcernKey, CoachingIntent> = {
  not_visible: "discovery",
  visible_no_visit: "confidence",
  ads_no_customers: "visit",
  low_average_order_value: "profit",
  low_returning: "returning",
  unknown: "unknown",
};

const followUpCatalog: Record<string, CoachingFollowUp> = {
  visit_purpose: {
    key: "visit_purpose",
    prompt: "고객이 주로 어떤 목적으로 매장을 찾나요?",
    options: ["식사", "모임", "포장·배달", "아직 모름"],
  },
  customer_choice_reason: {
    key: "customer_choice_reason",
    prompt: "고객이 우리 매장을 선택하는 가장 큰 이유는 무엇인가요?",
    options: ["메뉴", "가격", "분위기", "아직 모름"],
  },
  ad_conversion_known: {
    key: "ad_conversion_known",
    prompt: "광고를 본 고객의 실제 방문 여부를 확인할 수 있나요?",
    options: ["예", "아니요", "일부만 가능"],
  },
  visit_path_stage: {
    key: "visit_path_stage",
    prompt: "클릭 뒤 어느 단계까지 확인할 수 있나요?",
    options: ["전화", "예약", "실제 방문", "아직 모름"],
  },
  return_reason_known: {
    key: "return_reason_known",
    prompt: "고객이 다시 오는 이유를 확인한 적이 있나요?",
    options: ["예", "아니요", "일부 고객만"],
  },
  customer_consent: {
    key: "customer_consent",
    prompt: "고객에게 다시 연락할 수 있는 동의를 받았나요?",
    options: ["예", "아니요"],
  },
  peak_hours_known: {
    key: "peak_hours_known",
    prompt: "주문이 가장 몰리는 시간대를 기록하고 있나요?",
    options: ["예", "아니요", "대략 알고 있음"],
  },
  order_channel_capacity: {
    key: "order_channel_capacity",
    prompt: "좌석·포장·배달 중 아직 여유가 있는 채널은 무엇인가요?",
    options: ["좌석", "포장", "배달", "아직 모름"],
  },
};
const followUpKeys = new Set(Object.keys(followUpCatalog));

function response(
  status: number,
  body: CoachingHttpResponse["body"],
  headers?: Record<string, string>,
): CoachingHttpResponse {
  return { status, body, ...(headers ? { headers } : {}) };
}

function error(status: number, code: string): CoachingHttpResponse {
  return response(status, { error: code });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function onlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function nonEmptyString(value: unknown, maximum = 500): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum
  );
}

function parsedBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function parseRequestBody(rawBody: unknown): RequestBody | null {
  const value = parsedBody(rawBody);
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "feedback") {
    if (
      !onlyKeys(value, ["kind", "recommendationId", "feedback"]) ||
      !nonEmptyString(value.recommendationId, 100) ||
      !feedbackValues.includes(value.feedback as CoachingFeedback)
    ) {
      return null;
    }
    return {
      kind: "feedback",
      recommendationId: value.recommendationId,
      feedback: value.feedback as CoachingFeedback,
    };
  }
  if (value.kind !== "turn") return null;
  if (
    !onlyKeys(value, [
      "kind",
      "assessmentId",
      "sessionId",
      "concernKey",
      "question",
      "answer",
    ]) ||
    !nonEmptyString(value.assessmentId, 100) ||
    (value.sessionId !== undefined && !nonEmptyString(value.sessionId, 100)) ||
    (value.concernKey !== undefined &&
      !concerns.includes(value.concernKey as CoachingConcernKey)) ||
    (value.question !== undefined && !nonEmptyString(value.question))
  ) {
    return null;
  }
  let answer: TurnBody["answer"];
  if (value.answer !== undefined) {
    if (
      !isRecord(value.answer) ||
      !onlyKeys(value.answer, ["questionKey", "value"]) ||
      !nonEmptyString(value.answer.questionKey, 120) ||
      !followUpKeys.has(value.answer.questionKey) ||
      !nonEmptyString(value.answer.value)
    ) {
      return null;
    }
    answer = {
      questionKey: value.answer.questionKey,
      value: value.answer.value,
    };
  }
  const hasInitialInput =
    value.concernKey !== undefined || value.question !== undefined;
  if (value.sessionId === undefined && !hasInitialInput) return null;
  if (value.sessionId !== undefined && answer === undefined) return null;
  if (value.concernKey !== undefined && value.question !== undefined) {
    return null;
  }
  return {
    kind: "turn",
    assessmentId: value.assessmentId,
    ...(typeof value.sessionId === "string"
      ? { sessionId: value.sessionId }
      : {}),
    ...(typeof value.concernKey === "string"
      ? { concernKey: value.concernKey as CoachingConcernKey }
      : {}),
    ...(typeof value.question === "string" ? { question: value.question } : {}),
    ...(answer ? { answer } : {}),
  };
}

function header(
  headers: CoachingHttpRequest["headers"],
  key: string,
): string | undefined {
  const entry = Object.entries(headers).find(
    ([name]) => name.toLocaleLowerCase("en-US") === key,
  )?.[1];
  return typeof entry === "string" ? entry : entry?.[0];
}

function bearerToken(request: CoachingHttpRequest): string | null {
  const authorization = header(request.headers, "authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/iu);
  return match?.[1] ?? null;
}

function evidence(context: CoachingContext): string[] {
  const values: string[] = [];
  if (context.targetRevenue !== null) {
    values.push(`목표 매출 ${context.targetRevenue}원`);
  }
  if (context.averageOrderValue !== null) {
    values.push(`평균 객단가 ${context.averageOrderValue}원`);
  }
  if (context.currentCustomerCount !== null) {
    values.push(`현재 고객 수 ${context.currentCustomerCount}명`);
  }
  if (context.requiredCustomerCount !== null) {
    values.push(`최대 필요 신규 고객 수 ${context.requiredCustomerCount}명`);
  }
  if (
    context.returningCustomerKnown &&
    context.returningCustomerRate !== null
  ) {
    values.push(`확인된 재방문 고객 비율 ${context.returningCustomerRate}`);
  }
  if (context.tableCount !== null)
    values.push(`좌석 수 ${context.tableCount}석`);
  if (context.dailyTurnover !== null) {
    values.push(`하루 회전 수 ${context.dailyTurnover}회`);
  }
  return values.length > 0
    ? values.slice(0, 5)
    : ["저장된 진단에서 확인 가능한 수치가 제한적입니다."];
}

function templateResponse(
  action: CoachingActionDefinition,
  approvedEvidence: readonly string[],
): CoachingResponse {
  return {
    situation: action.reasonTemplate,
    stage: action.intent,
    evidence: approvedEvidence,
    actionTitle: action.title,
    steps: action.steps.slice(0, 3),
    metric: action.metric,
    avoid: action.avoid,
    ...(action.evidenceLevel === "hypothesis"
      ? {
          disclaimer:
            "결과를 보장하지 않으므로 작게 시험하고 숫자로 확인하세요.",
        }
      : {}),
  };
}

function followUpFor(
  action: CoachingActionDefinition,
  answers: Record<string, string>,
): CoachingFollowUp | null {
  const key = action.followUpQuestions.find(
    (questionKey) => answers[questionKey] === undefined,
  );
  if (!key) return null;
  return (
    followUpCatalog[key] ?? {
      key,
      prompt: "이 행동을 고르기 위해 한 가지만 더 확인할게요.",
      options: ["예", "아니요", "모름"],
    }
  );
}

async function authenticatedUser(
  request: CoachingHttpRequest,
  deps: CoachingHandlerDependencies,
): Promise<string | CoachingHttpResponse> {
  const token = bearerToken(request);
  if (!token) return error(401, "UNAUTHORIZED");
  const verified = await deps.admin.verifyToken(token);
  if (!verified) return error(401, "UNAUTHORIZED");
  return verified.userId;
}

async function handleTurn(
  body: TurnBody,
  userId: string,
  deps: CoachingHandlerDependencies,
): Promise<CoachingHttpResponse> {
  const source = await deps.admin.getOwnedAssessment(userId, body.assessmentId);
  if (!source) return error(404, "ASSESSMENT_NOT_FOUND");
  if (!source.completed) return error(409, "DIAGNOSIS_INCOMPLETE");
  if (!(await deps.admin.consumeRate(userId))) {
    return error(429, "RATE_LIMITED");
  }

  const context = buildCoachingContext(source);
  let currentSession: CoachingSessionRecord | null = null;
  let question: string | undefined;
  let intent: CoachingIntent;
  let confidence: number;
  let concernKey: CoachingConcernKey;
  let answers: Record<string, string>;
  let sanitizedAnswer: TurnBody["answer"];
  let providerQuestionSignals: ProviderQuestionSignals | null = null;
  let answerAlreadyConsumed = false;

  if (body.sessionId) {
    currentSession = await deps.admin.getOwnedSession(userId, body.sessionId);
    if (!currentSession || currentSession.assessmentId !== body.assessmentId) {
      return error(404, "SESSION_NOT_FOUND");
    }
    if (currentSession.status === "answered") {
      const retryValue = body.answer ? sanitizeQuestion(body.answer.value) : "";
      if (
        !body.answer ||
        !retryValue ||
        currentSession.answers[body.answer.questionKey] !== retryValue
      ) {
        return error(409, "FOLLOW_UP_MISMATCH");
      }
      const finalized = await deps.admin.getFinalizedResult(
        userId,
        currentSession.id,
      );
      return finalized
        ? response(200, {
            kind: "answer",
            sessionId: currentSession.id,
            recommendationId: finalized.recommendationId,
            response: finalized.response,
          })
        : error(409, "SESSION_STATE_CHANGED");
    }
    intent = currentSession.intent;
    confidence = currentSession.confidence;
    concernKey = currentSession.concernKey;
    if (body.answer) {
      const value = sanitizeQuestion(body.answer.value);
      if (!value) return error(400, "INVALID_REQUEST");
      answerAlreadyConsumed =
        currentSession.pendingFollowUpKey === null &&
        currentSession.answers[body.answer.questionKey] === value;
      if (
        currentSession.pendingFollowUpKey !== body.answer.questionKey &&
        !answerAlreadyConsumed
      ) {
        return error(409, "FOLLOW_UP_MISMATCH");
      }
      sanitizedAnswer = { questionKey: body.answer.questionKey, value };
    }
    answers = {
      ...currentSession.answers,
      ...(sanitizedAnswer
        ? { [sanitizedAnswer.questionKey]: sanitizedAnswer.value }
        : {}),
    };
    if (
      sanitizedAnswer &&
      !answerAlreadyConsumed &&
      !(await deps.admin.consumeFollowUp({
        userId,
        sessionId: currentSession.id,
        questionKey: sanitizedAnswer.questionKey,
        answerPayload: { kind: "follow_up_answer", answer: sanitizedAnswer },
        context,
        answers,
      }))
    ) {
      return error(409, "SESSION_STATE_CHANGED");
    }
    providerQuestionSignals = buildProviderQuestionSignals(
      currentSession.initialQuestion,
      concernKey,
    );
  } else {
    question = body.question ? sanitizeQuestion(body.question) : undefined;
    if (body.question !== undefined && !question) {
      return error(400, "INVALID_REQUEST");
    }
    concernKey = body.concernKey ?? "unknown";
    answers = {};
    if (question) {
      providerQuestionSignals = buildProviderQuestionSignals(
        question,
        concernKey,
      );
      try {
        if (!providerQuestionSignals) throw new Error("NO_SAFE_SIGNAL");
        const classification = await deps.classifyQuestion(
          providerQuestionSignals,
        );
        intent = classification.intent;
        confidence = classification.confidence;
        providerQuestionSignals = {
          ...providerQuestionSignals,
          requestedOutcome: classification.requestedOutcome ?? "unknown",
        };
      } catch {
        intent = "unknown";
        confidence = 0;
      }
    } else {
      intent = concernIntent[concernKey];
      confidence = 1;
      providerQuestionSignals = buildProviderQuestionSignals(
        concernKey,
        concernKey,
      );
    }
    const inserted = await deps.admin.insertSession({
      id: deps.newId?.() ?? crypto.randomUUID(),
      userId,
      storeId: source.storeId,
      assessmentId: body.assessmentId,
      concernKey,
      initialQuestion: question ?? concernKey,
      intent,
      confidence,
      status: "active",
      followUpCount: 0,
      pendingFollowUpKey: null,
      answers,
      context,
    });
    currentSession = inserted;
  }

  const userPayload: Record<string, unknown> = question
    ? { kind: "question", question }
    : { kind: "concern", concernKey };
  if (!sanitizedAnswer) {
    await deps.admin.insertMessage({
      userId,
      sessionId: currentSession.id,
      role: "user",
      payload: userPayload,
    });
  }

  const decision = chooseNextTurn({
    classifiedIntent: intent,
    context,
    answers,
    followUpsAsked: currentSession.followUpCount,
    ...(!body.sessionId && body.concernKey
      ? { concernKey: body.concernKey }
      : {}),
    ...(question ? { question } : {}),
  });
  const action =
    decision.kind === "follow_up"
      ? selectAction({ intent, context, answers })
      : decision.action;
  const nextFollowUp =
    currentSession.followUpCount < 2
      ? decision.kind === "follow_up"
        ? decision.question
        : decision.kind === "action"
          ? followUpFor(action, answers)
          : null
      : null;
  if (nextFollowUp) {
    const followUpCount = await deps.admin.issueFollowUp({
      userId,
      sessionId: currentSession.id,
      expectedFollowUpCount: currentSession.followUpCount,
      questionKey: nextFollowUp.key,
      questionPayload: { kind: "follow_up", question: nextFollowUp },
      context,
      answers,
    });
    if (followUpCount === null) return error(409, "SESSION_STATE_CHANGED");
    return response(200, {
      kind: "follow_up",
      sessionId: currentSession.id,
      question: nextFollowUp,
      remaining: 2 - followUpCount,
    });
  }

  const approvedEvidence = evidence(context);
  let coachingResponse: CoachingResponse;
  if (decision.kind === "blocked") {
    coachingResponse = {
      ...templateResponse(action, approvedEvidence),
      situation: `요청한 방식은 안내할 수 없습니다. 대신 ${action.reasonTemplate}`,
    };
  } else if (providerQuestionSignals) {
    try {
      coachingResponse = await deps.composeCoachingResponse({
        questionSignals: providerQuestionSignals,
        action,
        evidence: approvedEvidence,
        context,
      });
    } catch {
      coachingResponse = templateResponse(action, approvedEvidence);
    }
  } else {
    coachingResponse = templateResponse(action, approvedEvidence);
  }
  const finalized = await deps.admin.finalizeSession({
    userId,
    sessionId: currentSession.id,
    actionKey: action.key,
    actionVersion: action.version,
    evidenceKeys: action.requiredEvidence,
    metricSnapshot: {
      targetRevenue: context.targetRevenue,
      averageOrderValue: context.averageOrderValue,
      currentCustomerCount: context.currentCustomerCount,
      requiredCustomerCount: context.requiredCustomerCount,
      returningCustomerRate: context.returningCustomerRate,
      tableCount: context.tableCount,
      dailyTurnover: context.dailyTurnover,
    },
    response: coachingResponse,
    context,
    answers,
    answeredAt: (deps.now?.() ?? new Date()).toISOString(),
  });
  if (!finalized) return error(409, "SESSION_STATE_CHANGED");
  return response(200, {
    kind: "answer",
    sessionId: currentSession.id,
    recommendationId: finalized.recommendationId,
    response: finalized.response,
  });
}

export async function handleCoachingRequest(
  request: CoachingHttpRequest,
  deps: CoachingHandlerDependencies,
): Promise<CoachingHttpResponse> {
  try {
    if (request.method?.toUpperCase() !== "POST") {
      return response(405, { error: "METHOD_NOT_ALLOWED" }, { allow: "POST" });
    }
    const authenticated = await authenticatedUser(request, deps);
    if (typeof authenticated !== "string") return authenticated;
    const body = parseRequestBody(request.body);
    if (!body) return error(400, "INVALID_REQUEST");
    if (!(await deps.admin.hasActiveProfile(authenticated))) {
      return error(403, "PROFILE_INACTIVE");
    }
    if (body.kind === "feedback") {
      if (!(await deps.admin.consumeRate(authenticated))) {
        return error(429, "RATE_LIMITED");
      }
      const updated = await deps.admin.updateFeedback(
        authenticated,
        body.recommendationId,
        body.feedback,
      );
      return updated
        ? response(200, {
            kind: "feedback",
            recommendationId: body.recommendationId,
            feedback: body.feedback,
          })
        : error(404, "RECOMMENDATION_NOT_FOUND");
    }
    return await handleTurn(body, authenticated, deps);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    const safeCode = /^[A-Z][A-Z0-9_]{2,80}$/.test(message)
      ? message
      : "UNEXPECTED_ERROR";

    console.error("COACHING_REQUEST_FAILED", safeCode);
    return error(500, "COACHING_REQUEST_FAILED");
  }
}
