import type {
  ActionPlanDraft,
  ActionPlanRecord,
  AppService,
  AppSession,
  AssessmentSnapshot,
  BuyerRegistration,
} from "./contracts";

const DEMO_PRIVACY_ERROR = "데모에서는 개인정보를 저장하지 않습니다.";
const DEMO_ASSESSMENT_ID = "demo-assessment";
const DEMO_ASSESSMENT_CREATED_AT = "2026-07-19T00:00:00.000Z";
const DEMO_PROFILE = {
  id: "demo-buyer",
  name: "샘플 사장님",
  email: "sample@example.com",
  region: "서울",
  businessName: "샘플 식당",
} as const;

function clone<Value>(value: Value): Value {
  return structuredClone(value);
}

export function createDemoService(): AppService {
  let latestAssessment: AssessmentSnapshot | null = null;
  let actionPlans: ActionPlanRecord[] = [];

  const session: AppSession = {
    mode: "demo",
    profile: DEMO_PROFILE,
  };

  return {
    async getSession() {
      return clone(session);
    },

    async registerBuyer(_input: BuyerRegistration) {
      throw new Error(DEMO_PRIVACY_ERROR);
    },

    async sendLoginLink(_email: string) {
      throw new Error(DEMO_PRIVACY_ERROR);
    },

    async finalizeRegistration() {
      return clone(session);
    },

    async signOut() {
      latestAssessment = null;
      actionPlans = [];
    },

    async saveAssessment(snapshot) {
      latestAssessment = {
        ...clone(snapshot),
        id: DEMO_ASSESSMENT_ID,
        createdAt: DEMO_ASSESSMENT_CREATED_AT,
      };

      return clone(latestAssessment);
    },

    async getLatestAssessment() {
      return latestAssessment === null ? null : clone(latestAssessment);
    },

    async saveActionPlan(draft: ActionPlanDraft) {
      const actionPlan: ActionPlanRecord = {
        ...clone(draft),
        id: `demo-action-${actionPlans.length + 1}`,
        status: "planned",
        beforeValue: null,
        afterValue: null,
        note: null,
      };
      actionPlans.push(actionPlan);

      return clone(actionPlan);
    },

    async listActionPlans() {
      return clone(actionPlans);
    },

    async completeActionPlan(id, beforeValue, afterValue, note) {
      const actionPlan = actionPlans.find((item) => item.id === id);
      if (actionPlan === undefined) {
        throw new Error("실행 기록을 찾을 수 없습니다.");
      }

      const completedActionPlan: ActionPlanRecord = {
        ...actionPlan,
        status: "completed",
        beforeValue,
        afterValue,
        note,
      };
      actionPlans = actionPlans.map((item) =>
        item.id === id ? completedActionPlan : item,
      );

      return clone(completedActionPlan);
    },
  };
}
