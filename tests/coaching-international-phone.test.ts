import { describe, expect, it } from "vitest";
import { sanitizeQuestion } from "../src/coaching/safety";

describe("international Korean business phone redaction", () => {
  it.each(["+82 2 1234 5678", "+82 31 123 4567", "+82-70-1234-5678"])(
    "redacts a trunk-zero-omitted number: %s",
    (phone) => {
      expect(sanitizeQuestion(`연락처 ${phone}`)).not.toContain(phone);
    },
  );

  it("keeps ordinary numeric revenue values", () => {
    expect(sanitizeQuestion("이번 달 매출 82,312,345원")).toContain(
      "82,312,345원",
    );
  });
});
