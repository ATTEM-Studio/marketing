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
