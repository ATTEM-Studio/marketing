import { createClient } from "@supabase/supabase-js";

interface RpcClient {
  rpc(
    name: string,
    parameters: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
}

interface QueryResult<Row> {
  data: Row[] | Row | null;
  error: unknown;
  count?: number | null;
}

interface Query<Row extends Record<string, unknown>> extends PromiseLike<
  QueryResult<Row>
> {
  select(
    columns: string,
    options?: { count?: "exact"; head?: boolean },
  ): Query<Row>;
  eq(column: string, value: unknown): Query<Row>;
  gte(column: string, value: string): Query<Row>;
  lt(column: string, value: string): Query<Row>;
  in(column: string, values: string[]): Query<Row>;
  order(column: string, options?: { ascending?: boolean }): Query<Row>;
  range(from: number, to: number): Query<Row>;
  limit(count: number): Query<Row>;
  maybeSingle(): Promise<QueryResult<Row>>;
}

interface ReportingClient extends RpcClient {
  from<Row extends Record<string, unknown>>(table: string): Query<Row>;
}

export interface AdminLoginLimiter {
  isAllowed(ipHash: string): Promise<boolean>;
  recordFailure(ipHash: string): Promise<boolean>;
  clearFailures(ipHash: string): Promise<void>;
}

export type DuplicateSeverity = "high" | "review";

export interface AdminOverviewQuery {
  search: string;
  duplicate: "all" | DuplicateSeverity;
  page: number;
  pageSize: number;
}

export interface AdminMemberSummary {
  id: string;
  name: string;
  email: string;
  region: string;
  businessName: string;
  joinedAt: string;
  duplicate: { severity: DuplicateSeverity; peerCount: number } | null;
}

export interface AdminOverview {
  totals: {
    activeMembers: number;
    joinedToday: number;
    completedAssessments: number;
    coachingSessions: number;
  };
  daily: {
    date: string;
    joinedMembers: number;
    completedAssessments: number;
    coachingSessions: number;
  };
  members: AdminMemberSummary[];
  page: number;
  pageSize: number;
  totalRows: number;
}

export interface AdminMemberDetail {
  profile: {
    id: string;
    name: string;
    email: string;
    region: string;
    businessName: string;
    joinedAt: string;
    consents: { serviceTerms: boolean; marketing: boolean };
  };
  duplicatePeers: AdminMemberSummary[];
  latestAssessment: { id: string; createdAt: string } | null;
  assessmentHistory: Array<{ id: string; createdAt: string }>;
  actionPlans: Array<{
    id: string;
    assessmentId: string;
    status: string;
    scheduledFor: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  coachingUsage: { count: number; latestAt: string | null };
}

export interface DuplicateProfile {
  id: string;
  email: string;
  region: string;
  businessName: string;
}

export type DuplicateGroup = {
  severity: DuplicateSeverity;
  peerIds: string[];
};

export interface AdminDataStore extends AdminLoginLimiter {
  overview(query: AdminOverviewQuery): Promise<AdminOverview>;
  member(id: string): Promise<AdminMemberDetail | null>;
}

const QUERY_CHUNK_SIZE = 200;
const MAX_DUPLICATE_PROFILES = 10_000;

export function normalizeIdentity(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

export function normalizeBusinessIdentity(value: string): string {
  return normalizeIdentity(value).replace(/[\s\p{P}\p{S}_]+/gu, "");
}

export function classifyDuplicates(
  profiles: readonly DuplicateProfile[],
): Map<string, DuplicateGroup> {
  const emailGroups = new Map<string, string[]>();
  const businessGroups = new Map<string, string[]>();

  for (const profile of profiles) {
    const email = normalizeIdentity(profile.email);
    if (email) {
      const group = emailGroups.get(email) ?? [];
      group.push(profile.id);
      emailGroups.set(email, group);
    }

    const region = normalizeIdentity(profile.region);
    const business = normalizeBusinessIdentity(profile.businessName);
    if (region && business) {
      const key = `${region}\u0000${business}`;
      const group = businessGroups.get(key) ?? [];
      group.push(profile.id);
      businessGroups.set(key, group);
    }
  }

  const result = new Map<string, DuplicateGroup>();
  const add = (ids: string[], severity: DuplicateSeverity) => {
    if (ids.length < 2) return;
    for (const id of ids) {
      const peers = ids.filter((peerId) => peerId !== id).sort();
      const current = result.get(id);
      result.set(id, {
        severity:
          current?.severity === "high" || severity === "high"
            ? "high"
            : "review",
        peerIds: [...new Set([...(current?.peerIds ?? []), ...peers])].sort(),
      });
    }
  };

  for (const ids of businessGroups.values()) add(ids, "review");
  for (const ids of emailGroups.values()) add(ids, "high");
  return result;
}

function stringValue(row: Record<string, unknown>, key: string): string {
  return typeof row[key] === "string" ? row[key] : "";
}

function koreaDayBounds(now = new Date()): {
  date: string;
  start: string;
  end: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const component = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const date = `${component("year")}-${component("month")}-${component("day")}`;
  const start = new Date(`${date}T00:00:00+09:00`);
  return {
    date,
    start: start.toISOString(),
    end: new Date(start.getTime() + 86_400_000).toISOString(),
  };
}

function mapMember(
  row: Record<string, unknown>,
  duplicates: Map<string, DuplicateGroup>,
): AdminMemberSummary {
  const id = stringValue(row, "id");
  const duplicate = duplicates.get(id);
  return {
    id,
    name: stringValue(row, "name"),
    email: stringValue(row, "email"),
    region: stringValue(row, "region"),
    businessName: stringValue(row, "business_name"),
    joinedAt: stringValue(row, "created_at"),
    duplicate: duplicate
      ? { severity: duplicate.severity, peerCount: duplicate.peerIds.length }
      : null,
  };
}

function requiredServerEnvironment(): { url: string; serviceRoleKey: string } {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("ADMIN_SERVER_ENV_MISSING");
  return { url, serviceRoleKey };
}

function rpcClient(): ReportingClient {
  const { url, serviceRoleKey } = requiredServerEnvironment();
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }) as unknown as ReportingClient;
}

export function createAdminDataStore(
  injectedClient?: RpcClient | ReportingClient,
): AdminDataStore {
  const client = injectedClient ?? rpcClient();
  const reportingClient = client as ReportingClient;

  async function call(name: string, ipHash: string): Promise<unknown> {
    const { data, error } = await client.rpc(name, { p_ip_hash: ipHash });
    if (error) throw new Error("ADMIN_DATA_ERROR");
    return data;
  }

  async function countRows(
    table: string,
    query?: (
      source: Query<Record<string, unknown>>,
    ) => Query<Record<string, unknown>>,
  ): Promise<number> {
    let source = reportingClient
      .from<Record<string, unknown>>(table)
      .select("id", { count: "exact", head: true });
    if (query) source = query(source);
    const { count, error } = await source;
    if (error) throw new Error("ADMIN_DATA_ERROR");
    return count ?? 0;
  }

  async function activeProfiles(): Promise<Record<string, unknown>[]> {
    const profiles: Record<string, unknown>[] = [];
    for (
      let offset = 0;
      offset < MAX_DUPLICATE_PROFILES;
      offset += QUERY_CHUNK_SIZE
    ) {
      const { data, error } = await reportingClient
        .from<Record<string, unknown>>("profiles")
        .select("id,name,email,region,business_name,created_at")
        .eq("access_status", "active")
        .order("id")
        .range(offset, offset + QUERY_CHUNK_SIZE - 1);
      if (error || !Array.isArray(data)) throw new Error("ADMIN_DATA_ERROR");
      profiles.push(...data);
      if (data.length < QUERY_CHUNK_SIZE) break;
    }
    return profiles;
  }

  async function duplicateProfiles(): Promise<Map<string, DuplicateGroup>> {
    return classifyDuplicates(
      (await activeProfiles()).map((row) => ({
        id: stringValue(row, "id"),
        email: stringValue(row, "email"),
        region: stringValue(row, "region"),
        businessName: stringValue(row, "business_name"),
      })),
    );
  }

  return {
    async isAllowed(ipHash) {
      return (await call("check_admin_login_attempt", ipHash)) === true;
    },
    async recordFailure(ipHash) {
      return (await call("record_admin_login_failure", ipHash)) === true;
    },
    async clearFailures(ipHash) {
      await call("clear_admin_login_failures", ipHash);
    },
    async overview(query) {
      const [profiles, totalRows, allAssessments, allCoaching] =
        await Promise.all([
          activeProfiles(),
          countRows("profiles", (source) =>
            source.eq("access_status", "active"),
          ),
          countRows("assessments"),
          countRows("coaching_sessions"),
        ]);
      const duplicates = classifyDuplicates(
        profiles.map((row) => ({
          id: stringValue(row, "id"),
          email: stringValue(row, "email"),
          region: stringValue(row, "region"),
          businessName: stringValue(row, "business_name"),
        })),
      );
      const needle = normalizeIdentity(query.search);
      const matching = profiles
        .map((row) => mapMember(row, duplicates))
        .filter((member) => {
          const duplicate = member.duplicate?.severity;
          const matchesDuplicate =
            query.duplicate === "all" || duplicate === query.duplicate;
          const matchesSearch =
            !needle ||
            [
              member.name,
              member.email,
              member.region,
              member.businessName,
            ].some((value) => normalizeIdentity(value).includes(needle));
          return matchesDuplicate && matchesSearch;
        })
        .sort(
          (a, b) =>
            b.joinedAt.localeCompare(a.joinedAt) || a.id.localeCompare(b.id),
        );
      const start = (query.page - 1) * query.pageSize;
      const bounds = koreaDayBounds();
      const [joinedToday, assessmentsToday, coachingToday] = await Promise.all([
        countRows("profiles", (source) =>
          source
            .eq("access_status", "active")
            .gte("created_at", bounds.start)
            .lt("created_at", bounds.end),
        ),
        countRows("assessments", (source) =>
          source.gte("created_at", bounds.start).lt("created_at", bounds.end),
        ),
        countRows("coaching_sessions", (source) =>
          source.gte("created_at", bounds.start).lt("created_at", bounds.end),
        ),
      ]);
      return {
        totals: {
          activeMembers: totalRows,
          joinedToday,
          completedAssessments: allAssessments,
          coachingSessions: allCoaching,
        },
        daily: {
          date: bounds.date,
          joinedMembers: joinedToday,
          completedAssessments: assessmentsToday,
          coachingSessions: coachingToday,
        },
        members: matching.slice(start, start + query.pageSize),
        page: query.page,
        pageSize: query.pageSize,
        totalRows: matching.length,
      };
    },
    async member(id) {
      const profileResult = await reportingClient
        .from<Record<string, unknown>>("profiles")
        .select("id,name,email,region,business_name,created_at")
        .eq("id", id)
        .eq("access_status", "active")
        .maybeSingle();
      if (profileResult.error) throw new Error("ADMIN_DATA_ERROR");
      if (!profileResult.data || Array.isArray(profileResult.data)) return null;
      const profile = profileResult.data;
      const [
        consentsResult,
        assessmentsResult,
        actionPlansResult,
        coachingCountResult,
        coachingLatestResult,
        duplicates,
      ] = await Promise.all([
        reportingClient
          .from<Record<string, unknown>>("consent_events")
          .select("consent_type,granted,recorded_at")
          .eq("user_id", id)
          .order("recorded_at", { ascending: false }),
        reportingClient
          .from<Record<string, unknown>>("assessments")
          .select("id,created_at")
          .eq("user_id", id)
          .order("created_at", { ascending: false }),
        reportingClient
          .from<Record<string, unknown>>("action_plans")
          .select("id,assessment_id,status,scheduled_for,created_at,updated_at")
          .eq("user_id", id)
          .order("created_at", { ascending: false }),
        reportingClient
          .from<Record<string, unknown>>("coaching_sessions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", id),
        reportingClient
          .from<Record<string, unknown>>("coaching_sessions")
          .select("created_at")
          .eq("user_id", id)
          .order("created_at", { ascending: false })
          .limit(1),
        duplicateProfiles(),
      ]);
      if (
        consentsResult.error ||
        assessmentsResult.error ||
        actionPlansResult.error ||
        coachingCountResult.error ||
        coachingLatestResult.error
      ) {
        throw new Error("ADMIN_DATA_ERROR");
      }
      const assessments = Array.isArray(assessmentsResult.data)
        ? assessmentsResult.data
        : [];
      const actionPlans = Array.isArray(actionPlansResult.data)
        ? actionPlansResult.data
        : [];
      const latestCoaching = Array.isArray(coachingLatestResult.data)
        ? coachingLatestResult.data[0]
        : null;
      const consentEvents = Array.isArray(consentsResult.data)
        ? consentsResult.data
        : [];
      const mostRecentConsent = (type: string) =>
        consentEvents.find(
          (event) => stringValue(event, "consent_type") === type,
        );
      const peers = (duplicates.get(id)?.peerIds ?? []).slice(0, 50);
      const allProfiles = await activeProfiles();
      const profileById = new Map(
        allProfiles.map((row) => [stringValue(row, "id"), row]),
      );
      return {
        profile: {
          id,
          name: stringValue(profile, "name"),
          email: stringValue(profile, "email"),
          region: stringValue(profile, "region"),
          businessName: stringValue(profile, "business_name"),
          joinedAt: stringValue(profile, "created_at"),
          consents: {
            serviceTerms: mostRecentConsent("service_terms")?.granted === true,
            marketing: mostRecentConsent("marketing")?.granted === true,
          },
        },
        duplicatePeers: peers.map((peerId) =>
          mapMember(profileById.get(peerId) ?? {}, duplicates),
        ),
        latestAssessment: assessments[0]
          ? {
              id: stringValue(assessments[0], "id"),
              createdAt: stringValue(assessments[0], "created_at"),
            }
          : null,
        assessmentHistory: assessments.map((assessment) => ({
          id: stringValue(assessment, "id"),
          createdAt: stringValue(assessment, "created_at"),
        })),
        actionPlans: actionPlans.map((plan) => ({
          id: stringValue(plan, "id"),
          assessmentId: stringValue(plan, "assessment_id"),
          status: stringValue(plan, "status"),
          scheduledFor:
            typeof plan.scheduled_for === "string" ? plan.scheduled_for : null,
          createdAt: stringValue(plan, "created_at"),
          updatedAt: stringValue(plan, "updated_at"),
        })),
        coachingUsage: {
          count: coachingCountResult.count ?? 0,
          latestAt: latestCoaching
            ? stringValue(latestCoaching, "created_at")
            : null,
        },
      };
    },
  };
}
