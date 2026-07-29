import { beforeEach, expect, test, vi } from "vitest";
import { AdminApiError } from "../src/admin/api";
import { renderAdminLogin } from "../src/ui/admin-login";

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

beforeEach(() => {
  document.body.innerHTML =
    '<button type="button" id="trigger">Open</button><div id="app"></div>';
});

function open(
  api: { login(password: string): Promise<void> } = {
    login: vi.fn(async () => undefined),
  },
) {
  const root = document.querySelector<HTMLElement>("#app");
  const trigger = document.querySelector<HTMLButtonElement>("#trigger");
  if (!root || !trigger) throw new Error("missing test elements");
  trigger.focus();
  const onAuthenticated = vi.fn();
  const onClose = vi.fn();
  renderAdminLogin(root, api, {
    onAuthenticated,
    onClose,
    returnFocus: trigger,
  });
  return { api, onAuthenticated, onClose, root, trigger };
}

test("renders a labelled administrator dialog and focuses its password field", () => {
  const { root } = open();

  const dialog = root.querySelector<HTMLElement>("[role='dialog']");
  const password = root.querySelector<HTMLInputElement>("[name='password']");
  expect(dialog?.getAttribute("aria-modal")).toBe("true");
  expect(dialog?.getAttribute("aria-label")).toBe("관리자 로그인");
  expect(password?.autocomplete).toBe("current-password");
  expect(password?.maxLength).toBe(256);
  expect(document.activeElement).toBe(password);
});

test("shows busy state while a login is pending", async () => {
  let resolveLogin: (() => void) | undefined;
  const api = {
    login: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLogin = resolve;
        }),
    ),
  };
  const { root } = open(api);
  const password = root.querySelector<HTMLInputElement>("[name='password']");
  const submit = root.querySelector<HTMLButtonElement>(
    "[data-admin-login-submit]",
  );
  if (!password || !submit) throw new Error("missing login controls");
  password.value = "secret";
  root
    .querySelector<HTMLFormElement>("[data-admin-login-form]")
    ?.requestSubmit();

  expect(submit.disabled).toBe(true);
  expect(submit.textContent).toContain("로그인 중");
  resolveLogin?.();
  await flush();
});

test("clears the password and gives generic copy after an invalid login", async () => {
  const api = {
    login: vi.fn(async () => {
      throw new AdminApiError("invalid");
    }),
  };
  const { root, onAuthenticated } = open(api);
  const password = root.querySelector<HTMLInputElement>("[name='password']");
  if (!password) throw new Error("missing password field");
  password.value = "wrong";
  root
    .querySelector<HTMLFormElement>("[data-admin-login-form]")
    ?.requestSubmit();
  await flush();

  expect(password.value).toBe("");
  expect(root.textContent).toContain("로그인 정보를 확인할 수 없습니다.");
  expect(onAuthenticated).not.toHaveBeenCalled();
});

test("uses the same generic copy for a locked login", async () => {
  const api = {
    login: vi.fn(async () => {
      throw new AdminApiError("locked");
    }),
  };
  const { root } = open(api);
  const password = root.querySelector<HTMLInputElement>("[name='password']");
  if (!password) throw new Error("missing password field");
  password.value = "wrong";
  root
    .querySelector<HTMLFormElement>("[data-admin-login-form]")
    ?.requestSubmit();
  await flush();

  expect(root.textContent).toContain("로그인 정보를 확인할 수 없습니다.");
});

test("closes on Escape and restores focus to the trigger", () => {
  const { root, onClose, trigger } = open();
  root
    .querySelector<HTMLElement>("[role='dialog']")
    ?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

  expect(onClose).toHaveBeenCalledOnce();
  expect(root.querySelector("[role='dialog']")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test("keeps Tab focus inside the administrator dialog", () => {
  const { root } = open();
  const close = root.querySelector<HTMLButtonElement>(
    "[data-admin-login-close]",
  );
  const submit = root.querySelector<HTMLButtonElement>(
    "[data-admin-login-submit]",
  );
  if (!close || !submit) throw new Error("missing dialog controls");

  submit.focus();
  submit.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
  );
  expect(document.activeElement).toBe(close);

  close.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
    }),
  );
  expect(document.activeElement).toBe(submit);
});

test("does not authenticate after the user closes a pending login", async () => {
  let resolveLogin: (() => void) | undefined;
  const api = {
    login: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLogin = resolve;
        }),
    ),
  };
  const { root, onAuthenticated } = open(api);
  const password = root.querySelector<HTMLInputElement>("[name='password']");
  if (!password) throw new Error("missing password field");
  password.value = "correct";
  root
    .querySelector<HTMLFormElement>("[data-admin-login-form]")
    ?.requestSubmit();
  root.querySelector<HTMLButtonElement>("[data-admin-login-close]")?.click();
  resolveLogin?.();
  await flush();

  expect(onAuthenticated).not.toHaveBeenCalled();
});

test("replaces an existing administrator dialog instead of duplicating it", () => {
  const { root } = open();
  renderAdminLogin(
    root,
    { login: vi.fn(async () => undefined) },
    { onAuthenticated: vi.fn(), onClose: vi.fn() },
  );

  expect(root.querySelectorAll("[role='dialog']")).toHaveLength(1);
});

test("does not authenticate from a pending dialog replaced by a new dialog", async () => {
  let resolveFirstLogin: (() => void) | undefined;
  const firstApi = {
    login: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirstLogin = resolve;
        }),
    ),
  };
  const { root, onAuthenticated } = open(firstApi);
  const password = root.querySelector<HTMLInputElement>("[name='password']");
  if (!password) throw new Error("missing password field");
  password.value = "correct";
  root
    .querySelector<HTMLFormElement>("[data-admin-login-form]")
    ?.requestSubmit();

  renderAdminLogin(
    root,
    { login: vi.fn(async () => undefined) },
    { onAuthenticated: vi.fn(), onClose: vi.fn() },
  );
  resolveFirstLogin?.();
  await flush();

  expect(onAuthenticated).not.toHaveBeenCalled();
});

test("notifies the app after a successful 204 login", async () => {
  const api = { login: vi.fn(async () => undefined) };
  const { root, onAuthenticated } = open(api);
  const password = root.querySelector<HTMLInputElement>("[name='password']");
  if (!password) throw new Error("missing password field");
  password.value = "correct";
  root
    .querySelector<HTMLFormElement>("[data-admin-login-form]")
    ?.requestSubmit();
  await flush();

  expect(api.login).toHaveBeenCalledWith("correct");
  expect(onAuthenticated).toHaveBeenCalledOnce();
  expect(root.querySelector("[role='dialog']")).toBeNull();
});
