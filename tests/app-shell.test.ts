import { beforeEach, describe, expect, test } from "vitest";
import { mountApp } from "../src/main";

describe("app shell", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  test("shows the product promise and buyer entry action", () => {
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) throw new Error("missing test root");
    mountApp(root);
    expect(document.querySelector("h1")?.textContent).toContain(
      "매출이 막힌 지점",
    );
    expect(
      document.querySelector("[data-action='register']")?.textContent,
    ).toContain("구매자 인증");
    expect(
      document.querySelector("[data-action='demo']")?.textContent,
    ).toContain("샘플로 둘러보기");
  });
});
