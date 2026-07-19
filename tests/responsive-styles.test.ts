import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "styles.css"), "utf8");

test("defines mobile, desktop, touch, and reduced-motion safeguards", () => {
  expect(css).toContain("@media (min-width: 1024px)");
  expect(css).toContain("@media (max-width: 720px)");
  expect(css).toContain("min-height: 48px");
  expect(css).toContain("prefers-reduced-motion: reduce");
  expect(css).toContain("overflow-wrap: anywhere");
});

test("separates the dark brand surface from light work surfaces", () => {
  expect(css).toMatch(/--brand-bg:\s*#0b1512/);
  expect(css).toMatch(/--work-bg:\s*#f4f6f1/);
  expect(css).toContain(".brand-page");
  expect(css).toContain(".work-header");
});

test("keeps the skip link fully off-screen until keyboard focus", () => {
  expect(css).toContain("transform: translateY(-200%)");
  expect(css).toMatch(
    /\.skip-link:focus\s*{[^}]*transform:\s*translateY\(0\)/s,
  );
});

test("keeps Korean words intact while long machine tokens remain safe", () => {
  expect(css).toContain("word-break: keep-all");
  expect(css).toContain("text-wrap: balance");
  expect(css).toContain("text-wrap: pretty");
  expect(css).not.toMatch(
    /h1,\s*\n?h2,\s*\n?h3,[^{]+\{[^}]*overflow-wrap:\s*anywhere/s,
  );
  expect(css).toMatch(/\.long-token,[^{]+\{[^}]*overflow-wrap:\s*anywhere/s);
});
