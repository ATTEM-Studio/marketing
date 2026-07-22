import { describe, expect, it } from "vitest";
import { sanitizeQuestion } from "../src/coaching/safety";

describe("critical coaching privacy redaction", () => {
  it.each([
    ["도와줘. 전자책 원문: 비공개 전체 문구", /전자책 원문|비공개 전체 문구/],
    ["도와줘. 출처: internal-book.pdf", /출처:|internal-book\.pdf/],
    ["도와줘. source: paid-guide.epub", /source:|paid-guide\.epub/],
  ])(
    "removes an inline source remainder while keeping the question: %s",
    (question, redacted) => {
      const result = sanitizeQuestion(question);

      expect(result).toContain("도와줘.");
      expect(result).not.toMatch(redacted);
    },
  );

  it.each(["02-123-4567", "031 123 4567", "070-1234-5678", "080 123 4567"])(
    "redacts Korean business phone numbers: %s",
    (phone) => {
      expect(sanitizeQuestion(`연락처 ${phone}`)).not.toContain(phone);
    },
  );

  it("keeps ordinary revenue numbers that are not phone numbers", () => {
    const result = sanitizeQuestion(
      "오늘 매출은 2,000,000원이고 객단가는 20,000원입니다",
    );

    expect(result).toContain("2,000,000원");
    expect(result).toContain("20,000원");
  });
});
