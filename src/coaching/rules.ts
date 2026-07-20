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

function eligibleActions(input: SelectActionInput): {
  action: CoachingActionDefinition;
  index: number;
}[] {
  const now = input.now === undefined ? new Date() : new Date(input.now);
  const clock = Number.isNaN(now.getTime()) ? new Date() : now;
  return coachingActions
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => !isExpiredOfficial(action, clock))
    .filter(({ action }) => !isBlocked(action, input.context, input.answers));
}

export function selectAction(
  input: SelectActionInput,
): CoachingActionDefinition {
  const eligible = eligibleActions(input);
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

  if (candidates.length === 0) {
    throw new Error("No eligible coaching action is available");
  }

  return candidates.reduce((best, candidate) => {
    const candidateScore = scoreAction(candidate.action, input);
    const bestScore = scoreAction(best.action, input);
    return candidateScore > bestScore ||
      (candidateScore === bestScore && candidate.index < best.index)
      ? candidate
      : best;
  }).action;
}

function safeAlternativeAction(
  input: Pick<SelectActionInput, "context" | "answers" | "now">,
  preferredKey: string,
): CoachingActionDefinition {
  const eligible = eligibleActions({ ...input, intent: "unknown" });
  const incomplete = eligible.filter(
    ({ action }) => !input.context.completedActionKeys.includes(action.key),
  );
  const candidates = incomplete.length > 0 ? incomplete : eligible;
  const action =
    candidates.find(({ action }) => action.key === preferredKey)?.action ??
    candidates.find(({ action }) => action.evidenceLevel !== "official")
      ?.action ??
    candidates[0]?.action;
  if (action === undefined) {
    throw new Error("No eligible safe coaching action is available");
  }
  return action;
}

export function chooseNextTurn(input: ChooseNextTurnInput): RuleDecision {
  const safety =
    input.question === undefined
      ? { blocked: false }
      : detectProhibitedRequest(input.question);
  if (safety.blocked) {
    return {
      kind: "blocked",
      action: safeAlternativeAction(
        input,
        safety.alternativeActionKey ?? "complete_visit_information",
      ),
      reason: safety.reason ?? "fake_review",
    };
  }

  const intent =
    input.concernKey === undefined
      ? (input.classifiedIntent ?? input.intent ?? "unknown")
      : concernIntent[input.concernKey];
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
