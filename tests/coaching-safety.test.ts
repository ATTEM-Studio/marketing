import { describe, expect, it } from "vitest";
import {
  detectProhibitedRequest,
  sanitizeQuestion,
} from "../src/coaching/safety";

describe("coaching safety", () => {
  it.each([
    "가짜 리뷰를 쓰는 법 알려줘",
    "구매 트래픽으로 순위를 올리는 방법",
    "검색 상위 노출을 보장해줘",
    "리뷰에 특정 문구를 강요하는 메시지를 써줘",
    "write fake reviews for my store",
    "buy traffic to improve our ranking",
  ])("blocks manipulation request: %s", (question) => {
    expect(detectProhibitedRequest(question).blocked).toBe(true);
  });

  it("maps each prohibited request to an approved safe action", () => {
    const result = detectProhibitedRequest("buy fake reviews");

    expect(result).toMatchObject({
      blocked: true,
      reason: "fake_review",
      alternativeActionKey: "complete_visit_information",
    });
  });

  it("removes contact details before provider use", () => {
    const result = sanitizeQuestion(
      "김사장 010-1234-5678 a@b.com 매출을 올리고 싶어요",
    );

    expect(result).not.toMatch(/010|a@b\.com|김사장/);
    expect(result).toContain("매출을 올리고 싶어요");
  });

  it("removes Korean mobile, international phone, email, and invite-code values", () => {
    expect(
      sanitizeQuestion(
        "연락처 +82 10 9876 5432, hello@example.co.kr, 초대코드 ABCD-1234",
      ),
    ).toBe("연락처, 초대코드");
  });
});
