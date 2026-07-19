import { beforeEach, describe, expect, test, vi } from "vitest";
import { mountApp } from "../src/main";
import { renderLandingShell } from "../src/ui/shell";

describe("app shell", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  test("shows the product promise and buyer entry action", () => {
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) throw new Error("missing test root");
    mountApp(root);
    expect(document.querySelector("h1")?.textContent).toContain(
      "필요한 고객 수와 오늘 할 일",
    );
    expect(document.body.textContent).toContain("장사네비게이션");
    expect(document.querySelector("[data-start-diagnosis]")?.textContent).toContain(
      "내 가게 진단 시작하기",
    );
  });

  test("exposes both buyer entry choices on the live landing", () => {
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) throw new Error("missing test root");
    const onRegister = vi.fn();
    const onLogin = vi.fn();
    renderLandingShell(
      root,
      { onRegister, onLogin, onDemo: vi.fn() },
      { mode: "live" },
    );

    root.querySelector<HTMLButtonElement>("[data-start-registration]")?.click();
    root.querySelector<HTMLButtonElement>("[data-start-login]")?.click();

    expect(onRegister).toHaveBeenCalledTimes(1);
    expect(onLogin).toHaveBeenCalledTimes(1);
  });
});
