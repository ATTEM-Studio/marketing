import { expect, test } from "vitest";
import {
  formatKoreanDate,
  formatKoreanDateTime,
} from "../src/admin/date-format";

test("formats a UTC timestamp after Korean midnight with an explicit Korean date and time", () => {
  expect(formatKoreanDateTime("2026-07-28T15:30:00.000Z")).toBe(
    "2026년 7월 29일 00:30",
  );
});

test("formats semantic calendar dates without shifting their day", () => {
  expect(formatKoreanDate("2026-07-28")).toBe("2026년 7월 28일");
});

test("uses the missing-value copy for absent or invalid dates", () => {
  expect(formatKoreanDateTime(null)).toBe("입력하지 않음");
  expect(formatKoreanDateTime("not-a-date")).toBe("입력하지 않음");
  expect(formatKoreanDate("2026-02-30")).toBe("입력하지 않음");
});
