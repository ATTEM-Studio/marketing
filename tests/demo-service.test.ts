import { describe, expect, test } from "vitest";
import { createDemoService } from "../src/services/demo-service";

describe("demo service", () => {
  test("returns only the fixed synthetic buyer", async () => {
    const service = createDemoService();

    expect(await service.getSession()).toMatchObject({
      mode: "demo",
      profile: { name: "샘플 사장님", businessName: "샘플 식당" },
    });
  });

  test("rejects real registration data in demo mode", async () => {
    const service = createDemoService();

    await expect(
      service.registerBuyer({
        name: "실명",
        email: "real@example.com",
        region: "서울",
        businessName: "실제 업체",
        inviteCode: "ABC",
        serviceConsent: true,
        marketingConsent: false,
      }),
    ).rejects.toThrow("데모에서는 개인정보를 저장하지 않습니다.");
  });

  test("stores action status only in memory", async () => {
    const service = createDemoService();

    await service.saveActionPlan({
      assessmentId: "demo-assessment",
      actionKey: "local-discovery",
      metric: "7일간 전화 수",
      checkInDueAt: "2026-07-26",
    });

    expect(await service.listActionPlans()).toHaveLength(1);
    expect(localStorage.length).toBe(0);
  });
});
