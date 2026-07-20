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

test("never lets grid declarations override hidden diagnosis content", () => {
  expect(css).toMatch(
    /\.step-panel\[hidden\],[^{]*\.question-card\[hidden\]\s*\{[^}]*display:\s*none\s*!important/,
  );
});

test("defines a focused diagnosis stage and mobile action layout", () => {
  expect(css).toContain(".diagnosis-stage");
  expect(css).toContain(".question-card");
  expect(css).toContain(".question-actions");
  expect(css).toMatch(/@media \(max-width: 720px\)[\s\S]*\.question-actions/);
  expect(css).toMatch(/\.choice-card[^{]*\{[^}]*min-height:\s*44px/);
});

test("gives every disclosure summary a touch-safe interactive height", () => {
  expect(css).toMatch(
    /details\s*>\s*summary\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*min-height:\s*44px/s,
  );
});

test("keeps diagnosis content flexible without stretching the action row", () => {
  expect(css).toMatch(
    /\.diagnosis-stage\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto\s+auto\s+auto/s,
  );
  expect(css).toMatch(
    /\.diagnosis-stage\s*>\s*\.step-panel\s*\{[^}]*grid-row:\s*1/s,
  );
  expect(css).toMatch(
    /\.diagnosis-stage\s*>\s*\.coaching-feedback\s*\{[^}]*grid-row:\s*2/s,
  );
  expect(css).toMatch(
    /\.question-actions\s*\{[^}]*grid-row:\s*3[^}]*align-self:\s*end/s,
  );
  expect(css).toMatch(
    /\.diagnosis-stage\s*>\s*\[data-save-status\]\s*\{[^}]*grid-row:\s*4/s,
  );
});

test("removes question transitions when reduced motion is requested", () => {
  expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.question-card/);
});
