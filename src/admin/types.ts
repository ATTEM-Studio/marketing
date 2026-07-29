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
    total: number;
    today: number;
    last7Days: number;
    last30Days: number;
  };
  daily: Array<{ date: string; count: number }>;
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
  duplicatePeers: {
    members: AdminMemberSummary[];
    totalCount: number;
    truncated: boolean;
  };
  latestAssessment: {
    id: string;
    createdAt: string;
    inputData: Record<string, unknown>;
    calculatedMetrics: Record<string, unknown>;
    diagnosis: Record<string, unknown>;
    goal: {
      targetRevenue: number | null;
      allocation: Record<string, unknown>;
      periodStart: string | null;
      periodEnd: string | null;
      createdAt: string | null;
    };
  } | null;
  assessmentHistory: {
    entries: Array<{ id: string; createdAt: string }>;
    totalCount: number;
  };
  actionPlans: Array<{
    id: string;
    assessmentId: string;
    actionKey: string;
    actionSnapshot: Record<string, unknown>;
    status: string;
    scheduledFor: string | null;
    checkInDueAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  coachingUsage: { count: number; latestAt: string | null };
}

export interface AdminSession {
  authenticated: true;
}

export interface AdminDetailItem {
  label: string;
  value: string;
}

export interface AdminDetailSection {
  title: string;
  items: AdminDetailItem[];
}
