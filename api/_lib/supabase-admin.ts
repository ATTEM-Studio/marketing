import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
  answers: Record<string, string>;
}

export interface InsertSessionInput extends CoachingSessionRecord {
  context: CoachingContext;
}

export interface UpdateSessionInput {
  context: CoachingContext;
  answers: Record<string, string>;
  followUpCount?: number;
  status?: "active" | "answered";
  answeredAt?: string;
}

export interface InsertMessageInput {
  userId: string;
  sessionId: string;
  role: "user" | "assistant";
  payload: Record<string, unknown>;
}

export interface InsertRecommendationInput {
  userId: string;
  sessionId: string;
  actionKey: string;
  actionVersion: number;
  evidenceKeys: readonly string[];
  metricSnapshot: Record<string, unknown>;
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
  insertRecommendation(
    input: InsertRecommendationInput,
  ): Promise<{ id: string }>;
  updateSession(
    userId: string,
    sessionId: string,
    input: UpdateSessionInput,
  ): Promise<void>;
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

function completedAssessment(row: Row): boolean {
  return [row.input_data, row.calculated_metrics, row.diagnosis].every(
    (value) => Object.keys(record(value)).length > 0,
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
        completed: completedAssessment(assessmentRow),
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
          "id, user_id, store_id, assessment_id, concern_key, initial_question, intent, confidence, status, follow_up_count, context",
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
          "id, user_id, store_id, assessment_id, concern_key, initial_question, intent, confidence, status, follow_up_count, context",
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

    async insertRecommendation(input) {
      const { data, error } = await client
        .from("coaching_recommendations")
        .insert({
          user_id: input.userId,
          session_id: input.sessionId,
          action_key: input.actionKey,
          action_version: input.actionVersion,
          evidence_keys: input.evidenceKeys,
          metric_snapshot: input.metricSnapshot,
        })
        .select("id")
        .single();
      if (error || !data || typeof data.id !== "string") {
        throw new Error("COACHING_DATA_ERROR");
      }
      return { id: data.id };
    },

    async updateSession(userId, sessionId, input) {
      const changes: Row = {
        context: { ...input.context, answers: input.answers },
        updated_at: new Date().toISOString(),
      };
      if (input.followUpCount !== undefined) {
        changes.follow_up_count = input.followUpCount;
      }
      if (input.status !== undefined) changes.status = input.status;
      if (input.answeredAt !== undefined)
        changes.answered_at = input.answeredAt;
      const { error } = await client
        .from("coaching_sessions")
        .update(changes)
        .eq("id", sessionId)
        .eq("user_id", userId);
      if (error) throw new Error("COACHING_DATA_ERROR");
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
