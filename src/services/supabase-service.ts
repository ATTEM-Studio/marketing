import type {
  ActionPlanDraft,
  ActionPlanRecord,
  AppService,
  AppSession,
  AssessmentSnapshot,
  BuyerProfile,
  BuyerRegistration,
} from "./contracts";
import {
  createSupabaseClient,
  type BuyerSupabaseClient,
} from "./supabase-client";

const INVITE_ERROR =
  "코드를 확인할 수 없습니다. 입력 내용을 다시 확인해 주세요.";
const LOGIN_ERROR = "로그인을 진행하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const DATA_ERROR = "정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
const SAVE_ERROR = "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

type Row = Record<string, unknown>;

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asValueText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function profileFromRow(row: Row): BuyerProfile {
  return {
    id: asText(row.id),
    name: asText(row.name),
    email: asText(row.email),
    region: asText(row.region),
    businessName: asText(row.business_name),
  };
}

function assessmentFromRow(row: Row): AssessmentSnapshot {
  return {
    id: asText(row.id),
    inputs: asObject(row.input_data),
    metrics: asObject(row.calculated_metrics),
    diagnosis: asObject(row.diagnosis),
    createdAt: asText(row.created_at),
  };
}

function actionPlanFromRow(row: Row, checkIn?: Row | null): ActionPlanRecord {
  const snapshot = asObject(row.action_snapshot);
  return {
    id: asText(row.id),
    assessmentId: asText(row.assessment_id),
    actionKey: asText(row.action_key),
    metric: asText(snapshot.metric),
    checkInDueAt: asText(row.check_in_due_at),
    status: row.status === "completed" ? "completed" : "planned",
    beforeValue: checkIn ? asValueText(checkIn.before_value) || null : null,
    afterValue: checkIn ? asValueText(checkIn.after_value) || null : null,
    note: checkIn ? asText(checkIn.note) || null : null,
  };
}

function latestCheckIn(row: Row): Row | null {
  const checkIns = row.check_ins;
  return Array.isArray(checkIns) &&
    checkIns[0] &&
    typeof checkIns[0] === "object"
    ? (checkIns[0] as Row)
    : null;
}

function targetRevenue(inputs: Record<string, unknown>): number {
  const revenue = asObject(inputs.revenue);
  const raw = revenue.targetMonthlyRevenue;
  const value =
    typeof raw === "number" ? raw : Number(String(raw).replaceAll(",", ""));
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function goalAllocation(
  inputs: Record<string, unknown>,
): Record<string, number> {
  const allocation = asObject(inputs.allocation);
  const keys = [
    "newCustomerRevenue",
    "returningCustomerRevenue",
    "averageOrderValueRevenue",
  ] as const;
  if (keys.every((key) => !(key in allocation))) return {};
  if (
    !keys.every(
      (key) =>
        typeof allocation[key] === "number" &&
        Number.isFinite(allocation[key]) &&
        allocation[key] >= 0,
    )
  ) {
    return {};
  }
  return Object.fromEntries(
    keys.map((key) => [key, allocation[key]]),
  ) as Record<string, number>;
}

export function koreaBusinessMonthPeriod(now = new Date()): {
  start: string;
  end: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const part = (type: "year" | "month") =>
    Number(parts.find((item) => item.type === type)?.value);
  const year = part("year");
  const month = part("month");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const formattedMonth = String(month).padStart(2, "0");
  return {
    start: `${year}-${formattedMonth}-01`,
    end: `${year}-${formattedMonth}-${String(lastDay).padStart(2, "0")}`,
  };
}

async function userId(client: BuyerSupabaseClient): Promise<string | null> {
  const { data, error } = await client.auth.getUser();
  if (error) throw new Error(DATA_ERROR);
  return data.user?.id ?? null;
}

async function activeProfile(
  client: BuyerSupabaseClient,
  id: string,
): Promise<BuyerProfile | null> {
  const { data, error } = await client
    .from("profiles")
    .select("id, name, email, region, business_name")
    .eq("id", id)
    .eq("access_status", "active")
    .maybeSingle();
  if (error) throw new Error(DATA_ERROR);
  return data ? profileFromRow(data as Row) : null;
}

async function currentStoreId(
  client: BuyerSupabaseClient,
  id: string,
): Promise<string> {
  const { data, error } = await client
    .from("stores")
    .select("id")
    .eq("user_id", id)
    .maybeSingle();
  if (error || !data || typeof data.id !== "string")
    throw new Error(SAVE_ERROR);
  return data.id;
}

export function createSupabaseService(
  url: string,
  anonKey: string,
): AppService {
  const client = createSupabaseClient(url, anonKey);

  return {
    async registerBuyer(input: BuyerRegistration): Promise<void> {
      const { error } = await client.functions.invoke("redeem-invite", {
        body: {
          name: input.name,
          email: input.email,
          region: input.region,
          businessName: input.businessName,
          inviteCode: input.inviteCode,
          requiredConsent: input.serviceConsent,
          marketingConsent: input.marketingConsent,
        },
      });
      if (error) throw new Error(INVITE_ERROR);
    },

    async sendLoginLink(email: string): Promise<void> {
      try {
        await client.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${window.location.origin}${window.location.pathname}?auth=callback`,
          },
        });
      } catch {
        // The acknowledgement deliberately does not reveal whether this address exists.
      }
    },

    async finalizeRegistration(): Promise<AppSession> {
      const { error } = await client.functions.invoke("finalize-registration", {
        body: { confirm: true },
      });
      if (error) throw new Error(LOGIN_ERROR);
      return this.getSession();
    },

    async getSession(): Promise<AppSession> {
      const id = await userId(client);
      if (!id) return { mode: "live", profile: null };
      return { mode: "live", profile: await activeProfile(client, id) };
    },

    async signOut(): Promise<void> {
      const { error } = await client.auth.signOut();
      if (error) throw new Error(LOGIN_ERROR);
    },

    async saveAssessment(snapshot): Promise<AssessmentSnapshot> {
      const id = await userId(client);
      if (!id) throw new Error(SAVE_ERROR);
      const storeId = await currentStoreId(client, id);
      const dates = koreaBusinessMonthPeriod();
      const { error } = await client.rpc("save_assessment_with_goal", {
        p_store_id: storeId,
        p_input_data: snapshot.inputs,
        p_calculated_metrics: snapshot.metrics,
        p_diagnosis: snapshot.diagnosis,
        p_target_revenue: targetRevenue(snapshot.inputs),
        p_allocation: goalAllocation(snapshot.inputs),
        p_period_start: dates.start,
        p_period_end: dates.end,
      });
      if (error) throw new Error(SAVE_ERROR);
      const latest = await this.getLatestAssessment();
      if (!latest) throw new Error(SAVE_ERROR);
      return latest;
    },

    async getLatestAssessment(): Promise<AssessmentSnapshot | null> {
      const id = await userId(client);
      if (!id) return null;
      const { data, error } = await client
        .from("assessments")
        .select("id, input_data, calculated_metrics, diagnosis, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(DATA_ERROR);
      return data ? assessmentFromRow(data as Row) : null;
    },

    async saveActionPlan(draft: ActionPlanDraft): Promise<ActionPlanRecord> {
      const id = await userId(client);
      if (!id) throw new Error(SAVE_ERROR);
      const storeId = await currentStoreId(client, id);
      const { data, error } = await client
        .from("action_plans")
        .insert({
          user_id: id,
          store_id: storeId,
          assessment_id: draft.assessmentId,
          action_key: draft.actionKey,
          action_snapshot: { metric: draft.metric },
          status: "scheduled",
          check_in_due_at: draft.checkInDueAt,
        })
        .select(
          "id, assessment_id, action_key, action_snapshot, status, check_in_due_at, check_ins(before_value, after_value, note, recorded_at)",
        )
        .single();
      if (error || !data) throw new Error(SAVE_ERROR);
      return actionPlanFromRow(data as Row);
    },

    async listActionPlans(): Promise<ActionPlanRecord[]> {
      const id = await userId(client);
      if (!id) return [];
      const { data, error } = await client
        .from("action_plans")
        .select(
          "id, assessment_id, action_key, action_snapshot, status, check_in_due_at, check_ins(before_value, after_value, note, recorded_at)",
        )
        .eq("user_id", id)
        .order("recorded_at", {
          referencedTable: "check_ins",
          ascending: false,
        })
        .limit(1, { referencedTable: "check_ins" })
        .order("created_at", { ascending: false });
      if (error) throw new Error(DATA_ERROR);
      return (data ?? []).map((row) => {
        const record = row as Row;
        return actionPlanFromRow(record, latestCheckIn(record));
      });
    },

    async completeActionPlan(
      id,
      beforeValue,
      afterValue,
      note,
    ): Promise<ActionPlanRecord> {
      const { data, error } = await client.rpc("complete_action_plan", {
        p_action_plan_id: id,
        p_before_value: beforeValue,
        p_after_value: afterValue,
        p_note: note,
      });
      if (error || !data) throw new Error(SAVE_ERROR);
      return actionPlanFromRow(data as Row, asObject(data).check_in as Row);
    },
  };
}
