import { coachingActions } from "./content";
import { detectProhibitedRequest } from "./safety";
import type {
  CoachingActionDefinition,
  CoachingConcernKey,
  CoachingContext,
  CoachingFollowUp,
  CoachingIntent,
} from "./types";

export type RuleDecision =
  | { kind: "follow_up"; question: CoachingFollowUp }
  | {
      kind: "action";
      action: CoachingActionDefinition;
      reasonKeys: string[];
    }
  | { kind: "blocked"; action: CoachingActionDefinition; reason: string };

export interface SelectActionInput {
  intent: CoachingIntent;
  context: CoachingContext;
  answers: Record<string, string>;
  now?: string | Date;
}

export interface ChooseNextTurnInput extends Omit<SelectActionInput, "intent"> {
  intent?: CoachingIntent;
  concernKey?: CoachingConcernKey;
  classifiedIntent?: CoachingIntent;
  question?: string;
  followUpsAsked?: number;
}

const concernIntent: Record<CoachingConcernKey, CoachingIntent> = {
  not_visible: "discovery",
  visible_no_visit: "confidence",
  ads_no_customers: "visit",
  low_average_order_value: "profit",
  low_returning: "returning",
  unknown: "unknown",
};

const followUps: Record<
  "average_order_value" | "table_count",
  CoachingFollowUp
> = {
  average_order_value: {
    key: "average_order_value",
    prompt: "현재 평균 객단가를 알려주세요.",
    options: ["모름", "직접 입력"],
  },
  table_count: {
    key: "table_count",
    prompt: "운영 가능한 테이블 또는 좌석 수를 알려주세요.",
    options: ["모름", "직접 입력"],
  },
};

function isExpiredOfficial(
  action: CoachingActionDefinition,
  now: Date,
): boolean {
  return (
    action.evidenceLevel === "official" &&
    action.reviewAfter !== undefined &&
    action.reviewAfter < now.toISOString().slice(0, 10)
  );
}

function answerIsNo(answers: Record<string, string>, key: string): boolean {
  return ["no", "false", "아니오", "없음"].includes(
    answers[key]?.trim().toLocaleLowerCase("en-US") ?? "",
  );
}

function isBlocked(
  action: CoachingActionDefinition,
  context: CoachingContext,
  answers: Record<string, string>,
): boolean {
  return action.blockerKeys.some((blocker) => {
    if (blocker === "advertising_inactive")
      return context.advertisingActive !== true;
    if (blocker === "visit_path_unmeasured")
      return !context.advertisingConversionKnown;
    if (blocker === "customer_consent_missing") {
      return (
        answers.customer_consent?.trim().toLocaleLowerCase("en-US") !== "yes"
      );
    }
    if (blocker === "menu_change_unavailable")
      return answerIsNo(answers, "menu_change_available");
    if (blocker === "search_visibility_unknown")
      return answerIsNo(answers, "search_visibility_known");
    if (blocker === "questions_unclassified")
      return answerIsNo(answers, "customer_questions_classified");
    return false;
  });
}

function scoreAction(
  action: CoachingActionDefinition,
  input: SelectActionInput,
): number {
  let score = 0;
  if (action.intent === input.intent) score += 100;
  if (input.intent === "visit" && !input.context.advertisingConversionKnown) {
    score += action.key === "track_ad_to_visit_path" ? 50 : 0;
  }
  if (input.intent === "returning" && !input.context.returningCustomerKnown) {
    score += action.key === "identify_return_reason" ? 50 : 0;
  }
  if (input.intent === "profit" && input.context.averageOrderValue === null) {
    score += action.key === "offer_natural_add_on" ? 10 : 0;
  }
  return score;
}

export function selectAction(
  input: SelectActionInput,
): CoachingActionDefinition {
  const now = input.now === undefined ? new Date() : new Date(input.now);
  const clock = Number.isNaN(now.getTime()) ? new Date() : now;
  const eligible = coachingActions
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => !isExpiredOfficial(action, clock))
    .filter(({ action }) => !isBlocked(action, input.context, input.answers));
  const matching = eligible.filter(
    ({ action }) => action.intent === input.intent,
  );
  const incomplete = matching.filter(
    ({ action }) => !input.context.completedActionKeys.includes(action.key),
  );
  const alternatives = eligible.filter(
    ({ action }) => !input.context.completedActionKeys.includes(action.key),
  );
  const candidates =
    incomplete.length > 0
      ? incomplete
      : matching.length > 0
        ? matching
        : alternatives.length > 0
          ? alternatives
          : eligible;

  if (candidates.length === 0) return coachingActions[0]!;

  return candidates.reduce((best, candidate) => {
    const candidateScore = scoreAction(candidate.action, input);
    const bestScore = scoreAction(best.action, input);
    return candidateScore > bestScore ||
      (candidateScore === bestScore && candidate.index < best.index)
      ? candidate
      : best;
  }).action;
}

function requiredFollowUp(
  input: ChooseNextTurnInput,
  intent: CoachingIntent,
): CoachingFollowUp | null {
  if (intent !== "profit") return null;
  if (
    input.context.averageOrderValue === null &&
    input.answers.average_order_value === undefined
  ) {
    return followUps.average_order_value;
  }
  if (
    input.context.tableCount === null &&
    input.answers.table_count === undefined
  ) {
    return followUps.table_count;
  }
  return null;
}

function actionByKey(key: string): CoachingActionDefinition {
  return (
    coachingActions.find((action) => action.key === key) ?? coachingActions[0]!
  );
}

export function chooseNextTurn(input: ChooseNextTurnInput): RuleDecision {
  const safety =
    input.question === undefined
      ? { blocked: false }
      : detectProhibitedRequest(input.question);
  if (safety.blocked) {
    return {
      kind: "blocked",
      action: actionByKey(
        safety.alternativeActionKey ?? "complete_visit_information",
      ),
      reason: safety.reason ?? "fake_review",
    };
  }

  const intent =
    input.concernKey === undefined
      ? (input.classifiedIntent ?? input.intent ?? "unknown")
      : concernIntent[input.concernKey];
  const followUp = requiredFollowUp(input, intent);
  if (followUp !== null && (input.followUpsAsked ?? 0) < 2) {
    return { kind: "follow_up", question: followUp };
  }

  const action = selectAction({ ...input, intent });
  return {
    kind: "action",
    action,
    reasonKeys: [
      `intent:${intent}`,
      ...(input.context.advertisingConversionKnown
        ? []
        : ["evidence:conversion_unknown"]),
    ],
  };
}
