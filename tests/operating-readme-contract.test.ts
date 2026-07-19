import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const readme = readFileSync("README.md", "utf8");

test("normalizes invite codes exactly like the redeem Edge Function before hashing", () => {
  expect(readme).toContain("INVITE_CODE_NORMALIZED");
  expect(readme).toContain("value.trim().toUpperCase()");
  expect(readme).toContain("${INVITE_HASH_PEPPER}${INVITE_CODE_NORMALIZED}");
});

test("seeds an invite in the available database state", () => {
  expect(readme).toContain(
    "values ('<paste-local-sha256-hash>', 'available', now() + interval '30 days');",
  );
  expect(readme).not.toContain("'unused'");
});

test("warns that hashing an unnormalized lowercase code cannot be redeemed", () => {
  expect(readme).toContain("소문자·혼합 대소문자 또는 앞뒤 공백");
  expect(readme).toContain("해시가 일치하지 않아 사용할 수 없습니다");
});
