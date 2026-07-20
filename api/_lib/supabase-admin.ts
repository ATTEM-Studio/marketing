import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { calculateRevenueMetrics } from "../../src/domain/revenue";
import type { RevenueInputs } from "../../src/domain/types";
import type {
  CoachingAssessmentRecord,
  CoachingContextSource,
  CoachingGoalRecord,
  CoachingPlanRecord,
} from "../../src/coaching/context";
import type {
  CoachingConcernKey,
  CoachingContext,
  CoachingFeedback,
  CoachingIntent,
  CoachingResponse,
} from "../../src/coaching/types";

type Row = Record<string, unknown>;

export interface OwnedCoachingAssessment extends CoachingContextSource {
  completed: boolean;
  storeId: string;
}

export interface CoachingSessionRecord {
  id: string;
  userId: string;
  storeId: string;
  assessmentId: string;
  concernKey: CoachingConcernKey;
  initialQuestion: string;
  intent: CoachingIntent;
  confidence: number;
  status: "active" | "answered";
  followUpCount: number;
  pendingFollowUpKey: string | null;
  answers: Record<string, string>;
}

export interface InsertSessionInput extends CoachingSessionRecord {
  context: CoachingContext;
}

export interface IssueFollowUpInput {
  userId: string;
  sessionId: string;
  expectedFollowUpCount: number;
  questionKey: string;
  questionPayload: Record<string, unknown>;
  context: CoachingContext;
  answers: Record<string, string>;
}

export interface InsertMessageInput {
  userId: string;
  sessionId: string;
  role: "user" | "assistant";
  payload: Record<string, unknown>;
}

export interface ConsumeFollowUpInput {
  userId: string;
  sessionId: string;
  questionKey: string;
  answerPayload: Record<string, unknown>;
  context: CoachingContext;
  answers: Record<string, string>;
}

export interface FinalizeSessionInput {
  userId: string;
  sessionId: string;
  actionKey: string;
  actionVersion: number;
  evidenceKeys: readonly string[];
  metricSnapshot: Record<string, unknown>;
  response: CoachingResponse;
  context: CoachingContext;
  answers: Record<string, string>;
  answeredAt: string;
}

export interface FinalizedSessionResult {
  recommendationId: string;
  response: CoachingResponse;
  created: boolean;
}

export interface CoachingAdmin {
  verifyToken(token: string): Promise<{ userId: string } | null>;
  hasActiveProfile(userId: string): Promise<boolean>;
  getOwnedAssessment(
    userId: string,
    assessmentId: string,
  ): Promise<OwnedCoachingAssessment | null>;
  consumeRate(userId: string): Promise<boolean>;
  getOwnedSession(
    userId: string,
    sessionId: string,
  ): Promise<CoachingSessionRecord | null>;
  insertSession(input: InsertSessionInput): Promise<CoachingSessionRecord>;
  insertMessage(input: InsertMessageInput): Promise<void>;
  issueFollowUp(input: IssueFollowUpInput): Promise<number | null>;
  consumeFollowUp(input: ConsumeFollowUpInput): Promise<boolean>;
  finalizeSession(
    input: FinalizeSessionInput,
  ): Promise<FinalizedSessionResult | null>;
  getFinalizedResult(
    userId: string,
    sessionId: string,
  ): Promise<FinalizedSessionResult | null>;
  updateFeedback(
    userId: string,
    recommendationId: string,
    feedback: CoachingFeedback,
  ): Promise<boolean>;
}

function record(value: unknown): Row {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function answers(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record(value)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function finite(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function oneOf(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

function nullableFinite(value: unknown): boolean {
  return value === null || finite(value);
}

function hasFields(value: Row, fields: readonly string[]): boolean {
  return fields.every((field) => Object.hasOwn(value, field));
}

function comparableMetric(value: unknown): boolean {
  const metric = record(value);
  return (
    hasFields(metric, ["previous", "current"]) &&
    nullableFinite(metric.previous) &&
    nullableFinite(metric.current)
  );
}

export function isCompletedPersistedAssessment(
  row: Row,
  goalValue?: Row | null,
): boolean {
  const input = record(row.input_data);
  const revenue = record(input.revenue);
  const metrics = record(row.calculated_metrics);
  const diagnosis = record(row.diagnosis);
  const goal = record(goalValue);
  const allocation = record(input.allocation);
  const advertisingInput = record(input.advertising);
  const bottleneckInput = record(input.bottleneck);
  const restaurantInput = record(input.restaurant);
  const channelShares = record(restaurantInput.channelShares);
  const advertisingMetrics = record(metrics.advertising);
  const restaurantMetrics = record(metrics.restaurant);
  const diagnosisBottleneck = record(diagnosis.bottleneck);
  let expectedRevenueMetrics: ReturnType<typeof calculateRevenueMetrics>;
  try {
    expectedRevenueMetrics = calculateRevenueMetrics(
      revenue as unknown as RevenueInputs,
    );
  } catch {
    return false;
  }
  const allocationValid =
    Object.keys(allocation).length === 0 ||
    (hasFields(allocation, [
      "newCustomerRevenue",
      "returningCustomerRevenue",
      "averageOrderValueRevenue",
    ]) &&
      [
        allocation.newCustomerRevenue,
        allocation.returningCustomerRevenue,
        allocation.averageOrderValueRevenue,
      ].every((value) => finite(value) && (value as number) >= 0));
  return (
    [
      revenue.averageMonthlyRevenue,
      revenue.targetMonthlyRevenue,
      revenue.averageOrderValue,
      revenue.operatingDays,
      metrics.shortfallRevenue,
      metrics.maxNewCustomers,
      metrics.maxNewCustomersPerDay,
      metrics.monthlyCustomerCount,
      metrics.newCustomerTarget,
      goal.target_revenue,
    ].every(finite) &&
    goal.target_revenue === revenue.targetMonthlyRevenue &&
    metrics.shortfallRevenue === expectedRevenueMetrics.shortfallRevenue &&
    metrics.maxNewCustomers === expectedRevenueMetrics.maxNewCustomers &&
    metrics.maxNewCustomersPerDay ===
      expectedRevenueMetrics.maxNewCustomersPerDay &&
    metrics.monthlyCustomerCount ===
      expectedRevenueMetrics.monthlyCustomerCount &&
    metrics.customerCountSource ===
      expectedRevenueMetrics.customerCountSource &&
    metrics.targetReached === expectedRevenueMetrics.targetReached &&
    (revenue.monthlyCustomerCount === null ||
      finite(revenue.monthlyCustomerCount)) &&
    oneOf(revenue.monthlyCustomerCountStatus, [
      "exact",
      "approximate",
      "unknown",
    ]) &&
    oneOf(input.primaryConcern, [
      "customers",
      "ads",
      "averageOrderValue",
      "returning",
      "unknown",
    ]) &&
    oneOf(input.capacity, ["yes", "sometimes", "no"]) &&
    oneOf(input.returningDataStatus, ["known", "sampled", "unknown"]) &&
    [
      input.hasConsentDb,
      input.canChangeMenu,
      input.adsRunning,
      input.adAttributionKnown,
      metrics.targetReached,
    ].every((value) => typeof value === "boolean") &&
    oneOf(metrics.customerCountSource, [
      "actual",
      "approximate",
      "estimated",
    ]) &&
    allocationValid &&
    hasFields(advertisingInput, [
      "visitConversionRate",
      "costPerClick",
      "actualAdNewCustomers",
      "actualAdSpend",
    ]) &&
    Object.values(advertisingInput).every(nullableFinite) &&
    ["exposure", "click", "visit", "averageOrderValue", "returning"].every(
      (key) => comparableMetric(bottleneckInput[key]),
    ) &&
    oneOf(bottleneckInput.returningDataStatus, [
      "known",
      "sampled",
      "unknown",
    ]) &&
    hasFields(restaurantInput, [
      "seats",
      "hallHours",
      "peakOccupancy",
      "averagePartySize",
      "averageStayBand",
      "channelShares",
    ]) &&
    [
      restaurantInput.seats,
      restaurantInput.hallHours,
      restaurantInput.averagePartySize,
      channelShares.dineIn,
      channelShares.takeout,
      channelShares.delivery,
    ].every(nullableFinite) &&
    (restaurantInput.peakOccupancy === null ||
      oneOf(restaurantInput.peakOccupancy, [
        "spacious",
        "half",
        "almost_full",
        "waiting",
      ])) &&
    (restaurantInput.averageStayBand === null ||
      oneOf(restaurantInput.averageStayBand, [
        "under_30",
        "30_60",
        "60_90",
        "over_90",
        "unknown",
      ])) &&
    hasFields(advertisingMetrics, [
      "status",
      "newCustomerTarget",
      "requiredClicks",
      "estimatedAdSpend",
      "customerAcquisitionCost",
    ]) &&
    oneOf(advertisingMetrics.status, ["measured", "needs_measurement"]) &&
    [
      advertisingMetrics.newCustomerTarget,
      advertisingMetrics.requiredClicks,
      advertisingMetrics.estimatedAdSpend,
      advertisingMetrics.customerAcquisitionCost,
    ].every(nullableFinite) &&
    hasFields(restaurantMetrics, [
      "status",
      "requiredPartiesPerDay",
      "theoreticalTurns",
    ]) &&
    oneOf(restaurantMetrics.status, [
      "available",
      "time_limited",
      "saturated",
      "insufficient",
    ]) &&
    nullableFinite(restaurantMetrics.requiredPartiesPerDay) &&
    (restaurantMetrics.theoreticalTurns === null ||
      hasFields(record(restaurantMetrics.theoreticalTurns), ["min", "max"])) &&
    oneOf(diagnosis.actionKey, [
      "profit-review",
      "average-order-value",
      "measure-acquisition-source",
      "returning-message",
      "off-peak-offer",
      "local-discovery",
    ]) &&
    hasFields(diagnosisBottleneck, ["key", "status", "changeRate", "reason"]) &&
    (diagnosisBottleneck.key === null ||
      oneOf(diagnosisBottleneck.key, [
        "exposure",
        "click",
        "visit",
        "averageOrderValue",
        "returning",
      ])) &&
    oneOf(diagnosisBottleneck.status, ["known", "stable", "insufficient"]) &&
    nullableFinite(diagnosisBottleneck.changeRate) &&
    typeof diagnosisBottleneck.reason === "string" &&
    oneOf(diagnosis.effectiveCapacity, ["yes", "sometimes", "no"])
  );
}

function assessment(row: Row): CoachingAssessmentRecord {
  return {
    id: text(row.id),
    inputs: record(row.input_data),
    metrics: record(row.calculated_metrics),
    diagnosis: record(row.diagnosis),
    createdAt: row.created_at,
  };
}

function session(row: Row): CoachingSessionRecord {
  const context = record(row.context);
  return {
    id: text(row.id),
    userId: text(row.user_id),
    storeId: text(row.store_id),
    assessmentId: text(row.assessment_id),
    concernKey: text(row.concern_key) as CoachingConcernKey,
    initialQuestion: text(row.initial_question),
    intent: text(row.intent) as CoachingIntent,
    confidence: number(row.confidence),
    status: row.status === "answered" ? "answered" : "active",
    followUpCount: number(row.follow_up_count),
    pendingFollowUpKey:
      typeof row.pending_follow_up_key === "string"
        ? row.pending_follow_up_key
        : null,
    answers: answers(context.answers),
  };
}

function requiredEnvironment(): { url: string; serviceRoleKey: string } {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("SUPABASE_SERVER_ENV_MISSING");
  return { url, serviceRoleKey };
}

export function createSupabaseAdmin(
  injectedClient?: SupabaseClient,
): CoachingAdmin {
  const client =
    injectedClient ??
    (() => {
      const env = requiredEnvironment();
      return createClient(env.url, env.serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
    })();

  const finalize = async (
    userId: string,
    sessionId: string,
    parameters: Row,
  ): Promise<FinalizedSessionResult | null> => {
    const { data, error } = await client.rpc("finalize_coaching_session", {
      p_user_id: userId,
      p_session_id: sessionId,
      ...parameters,
    });
    if (error) throw new Error("COACHING_DATA_ERROR");
    const result = record(data);
    if (
      typeof result.recommendationId !== "string" ||
      Object.keys(record(result.response)).length === 0
    ) {
      return null;
    }
    return {
      recommendationId: result.recommendationId,
      response: result.response as CoachingResponse,
      created: result.created === true,
    };
  };

  return {
    async verifyToken(token) {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;
      return { userId: data.user.id };
    },

    async hasActiveProfile(userId) {
      const { data, error } = await client
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .eq("access_status", "active")
        .maybeSingle();
      if (error) throw new Error("COACHING_DATA_ERROR");
      return data !== null;
    },

    async getOwnedAssessment(userId, assessmentId) {
      const { data, error } = await client
        .from("assessments")
        .select(
          "id, store_id, input_data, calculated_metrics, diagnosis, created_at",
        )
        .eq("id", assessmentId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error("COACHING_DATA_ERROR");
      if (!data) return null;
      const assessmentRow = data as Row;
      const storeId = text(assessmentRow.store_id);
      const [goalResult, storeResult, plansResult] = await Promise.all([
        client
          .from("goals")
          .select("target_revenue")
          .eq("assessment_id", assessmentId)
          .eq("user_id", userId)
          .maybeSingle(),
        client
          .from("stores")
          .select("id, name, region, business_type")
          .eq("id", storeId)
          .eq("user_id", userId)
          .maybeSingle(),
        client
          .from("action_plans")
          .select("action_key, status")
          .eq("assessment_id", assessmentId)
          .eq("user_id", userId),
      ]);
      if (goalResult.error || storeResult.error || plansResult.error) {
        throw new Error("COACHING_DATA_ERROR");
      }
      if (!storeResult.data) return null;
      const goal = goalResult.data as Row | null;
      return {
        completed: isCompletedPersistedAssessment(assessmentRow, goal),
        storeId,
        assessment: assessment(assessmentRow),
        goal: goal
          ? ({ target_revenue: goal.target_revenue } as CoachingGoalRecord)
          : null,
        store: storeResult.data as Row,
        completedPlans: (plansResult.data ?? []) as CoachingPlanRecord[],
      };
    },

    async consumeRate(userId) {
      const { data, error } = await client.rpc("consume_coaching_request", {
        p_user_id: userId,
      });
      if (error) throw new Error("COACHING_DATA_ERROR");
      return data === true;
    },

    async getOwnedSession(userId, sessionId) {
      const { data, error } = await client
        .from("coaching_sessions")
        .select(
          "id, user_id, store_id, assessment_id, concern_key, initial_question, intent, confidence, status, follow_up_count, pending_follow_up_key, context",
        )
        .eq("id", sessionId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error("COACHING_DATA_ERROR");
      return data ? session(data as Row) : null;
    },

    async insertSession(input) {
      const { data, error } = await client
        .from("coaching_sessions")
        .insert({
          id: input.id,
          user_id: input.userId,
          store_id: input.storeId,
          assessment_id: input.assessmentId,
          concern_key: input.concernKey,
          initial_question: input.initialQuestion,
          intent: input.intent,
          confidence: input.confidence,
          status: input.status,
          follow_up_count: input.followUpCount,
          context: { ...input.context, answers: input.answers },
        })
        .select(
          "id, user_id, store_id, assessment_id, concern_key, initial_question, intent, confidence, status, follow_up_count, pending_follow_up_key, context",
        )
        .single();
      if (error || !data) throw new Error("COACHING_DATA_ERROR");
      return session(data as Row);
    },

    async insertMessage(input) {
      const { error } = await client.from("coaching_messages").insert({
        user_id: input.userId,
        session_id: input.sessionId,
        role: input.role,
        payload: input.payload,
      });
      if (error) throw new Error("COACHING_DATA_ERROR");
    },

    async issueFollowUp(input) {
      const { data, error } = await client.rpc("issue_coaching_follow_up", {
        p_user_id: input.userId,
        p_session_id: input.sessionId,
        p_expected_follow_up_count: input.expectedFollowUpCount,
        p_question_key: input.questionKey,
        p_question_payload: input.questionPayload,
        p_context: input.context,
        p_answers: input.answers,
      });
      if (error) throw new Error("COACHING_DATA_ERROR");
      return typeof data === "number" ? data : null;
    },

    async consumeFollowUp(input) {
      const { data, error } = await client.rpc("consume_coaching_follow_up", {
        p_user_id: input.userId,
        p_session_id: input.sessionId,
        p_question_key: input.questionKey,
        p_answer_payload: input.answerPayload,
        p_context: input.context,
        p_answers: input.answers,
      });
      if (error) throw new Error("COACHING_DATA_ERROR");
      return data === true;
    },

    async finalizeSession(input) {
      return await finalize(input.userId, input.sessionId, {
        p_action_key: input.actionKey,
        p_action_version: input.actionVersion,
        p_evidence_keys: input.evidenceKeys,
        p_metric_snapshot: input.metricSnapshot,
        p_response: input.response,
        p_context: input.context,
        p_answers: input.answers,
        p_answered_at: input.answeredAt,
      });
    },

    async getFinalizedResult(userId, sessionId) {
      return await finalize(userId, sessionId, {
        p_action_key: null,
        p_action_version: null,
        p_evidence_keys: null,
        p_metric_snapshot: null,
        p_response: null,
        p_context: null,
        p_answers: null,
        p_answered_at: null,
      });
    },

    async updateFeedback(userId, recommendationId, feedback) {
      const { data, error } = await client
        .from("coaching_recommendations")
        .update({ feedback })
        .eq("id", recommendationId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();
      if (error) throw new Error("COACHING_DATA_ERROR");
      return data !== null;
    },
  };
}
