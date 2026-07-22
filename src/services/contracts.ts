import type {
  CoachingFeedback,
  CoachingTurnRequest,
  CoachingTurnResponse,
} from "../coaching/types";

export interface BuyerRegistration {
  name: string;
  email: string;
  region: string;
  businessName: string;
  inviteCode: string;
  serviceConsent: boolean;
  marketingConsent: boolean;
}

export interface BuyerProfile {
  id: string;
  name: string;
  email: string;
  region: string;
  businessName: string;
}

export interface AppSession {
  mode: "demo" | "live";
  profile: BuyerProfile | null;
}

export interface AssessmentSnapshot {
  id: string;
  goalTargetRevenue: number | null;
  inputs: Record<string, unknown>;
  metrics: Record<string, unknown>;
  diagnosis: Record<string, unknown>;
  createdAt: string;
}

export interface ActionPlanDraft {
  assessmentId: string;
  actionKey: string;
  metric: string;
  checkInDueAt: string;
}

export interface ActionPlanRecord extends ActionPlanDraft {
  id: string;
  status: "planned" | "completed";
  beforeValue: string | null;
  afterValue: string | null;
  note: string | null;
}

export interface AppService {
  getSession(): Promise<AppSession>;
  registerBuyer(input: BuyerRegistration): Promise<AppSession>;
  sendLoginLink(email: string): Promise<void>;
  finalizeRegistration(): Promise<AppSession>;
  signOut(): Promise<void>;
  saveAssessment(
    snapshot: Omit<
      AssessmentSnapshot,
      "id" | "createdAt" | "goalTargetRevenue"
    >,
  ): Promise<AssessmentSnapshot>;
  getLatestAssessment(): Promise<AssessmentSnapshot | null>;
  saveActionPlan(draft: ActionPlanDraft): Promise<ActionPlanRecord>;
  listActionPlans(): Promise<ActionPlanRecord[]>;
  completeActionPlan(
    id: string,
    beforeValue: string,
    afterValue: string,
    note: string,
  ): Promise<ActionPlanRecord>;
  askCoach(request: CoachingTurnRequest): Promise<CoachingTurnResponse>;
  rateCoaching(
    recommendationId: string,
    feedback: CoachingFeedback,
  ): Promise<void>;
}
