import { expect, test } from "vitest";
import { diagnosisSections } from "../src/admin/labels";
import type { AdminMemberDetail, AdminDetailSection } from "../src/admin/types";

function detailWithRestaurant(
  restaurant: Record<string, unknown>,
): AdminMemberDetail {
  return {
    profile: {
      id: "fb13dc6f-8d15-4493-8a01-64093f88b008",
      name: "홍길동",
      email: "hong@example.com",
      region: "서울",
      businessName: "한강김밥",
      joinedAt: "2026-07-01T10:00:00.000Z",
      consents: { serviceTerms: true, marketing: false },
    },
    duplicatePeers: { members: [], totalCount: 1, truncated: false },
    latestAssessment: {
      id: "1a13dc6f-8d15-4493-8a01-64093f88b008",
      createdAt: "2026-07-20T10:00:00.000Z",
      inputData: {
        revenue: {
          averageMonthlyRevenue: 8_500_000,
          targetMonthlyRevenue: 10_000_000,
          averageOrderValue: 12_000,
          operatingDays: 25,
          monthlyCustomerCount: 500,
          monthlyCustomerCountStatus: "exact",
        },
        advertising: { visitConversionRate: 0.12, costPerClick: 150 },
        restaurant,
        unknownInput: "절대 표시하면 안 되는 값",
      },
      calculatedMetrics: {
        shortfallRevenue: 1_500_000,
        maxNewCustomers: 125,
        maxNewCustomersPerDay: 5,
        monthlyCustomerCount: 500,
        customerCountSource: "actual",
        targetReached: false,
        advertising: { requiredClicks: 1042, estimatedAdSpend: 156_300 },
        restaurant: { status: "available", requiredPartiesPerDay: 3 },
        unknownMetric: "절대 표시하면 안 되는 계산값",
      },
      diagnosis: {
        bottleneck: {
          key: "visit",
          status: "known",
          changeRate: -0.15,
          reason: "방문이 줄었습니다.",
        },
        actionKey: "local-discovery",
        effectiveCapacity: "yes",
        aiConversation: "AI 대화 내용은 표시하면 안 됩니다.",
      },
      goal: {
        targetRevenue: 10_000_000,
        allocation: { newCustomerRevenue: 500_000 },
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        createdAt: "2026-07-20T10:00:00.000Z",
      },
    },
    assessmentHistory: {
      entries: [
        {
          id: "1a13dc6f-8d15-4493-8a01-64093f88b008",
          createdAt: "2026-07-20T10:00:00.000Z",
        },
      ],
      totalCount: 1,
    },
    actionPlans: [
      {
        id: "2a13dc6f-8d15-4493-8a01-64093f88b008",
        assessmentId: "1a13dc6f-8d15-4493-8a01-64093f88b008",
        actionKey: "local-discovery",
        actionSnapshot: { messages: "AI 대화 내용은 표시하면 안 됩니다." },
        status: "pending",
        scheduledFor: "2026-07-21",
        checkInDueAt: null,
        createdAt: "2026-07-20T10:00:00.000Z",
        updatedAt: "2026-07-20T10:00:00.000Z",
      },
    ],
    coachingUsage: { count: 2, latestAt: "2026-07-21T10:00:00.000Z" },
  };
}

function sectionValue(sections: AdminDetailSection[], label: string): string {
  const item = sections
    .flatMap((section) => section.items)
    .find((entry) => entry.label === label);
  if (!item) throw new Error(`Missing label: ${label}`);
  return item.value;
}

test("labels restaurant and diagnosis fields with Korean units and missing values", () => {
  const sections = diagnosisSections(detailWithRestaurant({ seats: 24 }));

  expect(sections.map((section) => section.title)).toEqual([
    "기본 정보",
    "최근 진단 요약",
    "고객과 운영",
    "광고",
    "음식점 선택 정보",
    "계산 결과와 추천",
  ]);
  expect(sectionValue(sections, "좌석 수")).toBe("24석");
  expect(sectionValue(sections, "평균 체류 시간")).toBe("입력하지 않음");
  expect(sectionValue(sections, "최근 월평균 매출")).toBe("8,500,000원");
  expect(sectionValue(sections, "방문 전환율")).toBe("12%");
  expect(sectionValue(sections, "병목 변화율")).toBe("-15%");
  expect(sectionValue(sections, "코칭 이용 횟수")).toBe("2회");
});

test("renders only approved named assessment fields and never conversation content", () => {
  const sections = diagnosisSections(detailWithRestaurant({ seats: 24 }));
  const rendered = sections
    .flatMap((section) => section.items)
    .map((item) => `${item.label}:${item.value}`)
    .join("\n");

  expect(rendered).toContain("방문이 줄었습니다.");
  expect(rendered).not.toContain("절대 표시하면 안 되는 값");
  expect(rendered).not.toContain("절대 표시하면 안 되는 계산값");
  expect(rendered).not.toContain("AI 대화 내용은 표시하면 안 됩니다.");
});
