export interface AdminLoginApi {
  login(password: string): Promise<void>;
}

export interface AdminLoginCallbacks {
  onAuthenticated(): void;
  onClose(): void;
  returnFocus?: HTMLElement | null;
}

const LOGIN_FAILED = "로그인 정보를 확인할 수 없습니다.";

export function renderAdminLogin(
  root: HTMLElement,
  adminApi: AdminLoginApi,
  callbacks: AdminLoginCallbacks,
): void {
  const existing = root.querySelector<HTMLElement>(
    "[data-admin-login-overlay]",
  );
  existing?.dispatchEvent(new Event("admin-login-dispose"));
  existing?.remove();
  const returnFocus = callbacks.returnFocus ?? document.activeElement;
  root.insertAdjacentHTML(
    "beforeend",
    `<section class="admin-login-overlay" data-admin-login-overlay><div class="admin-login-dialog" role="dialog" aria-modal="true" aria-label="관리자 로그인" tabindex="-1"><button type="button" class="quiet-button" data-admin-login-close aria-label="닫기">닫기</button><h2>관리자 로그인</h2><form data-admin-login-form novalidate><label for="admin-password">비밀번호</label><input id="admin-password" name="password" type="password" autocomplete="current-password" maxlength="256" required><p data-admin-login-status role="status" aria-live="polite"></p><button type="submit" data-admin-login-submit>로그인</button></form></div></section>`,
  );

  const overlay = root.querySelector<HTMLElement>("[data-admin-login-overlay]");
  const dialog = overlay?.querySelector<HTMLElement>("[role='dialog']");
  const form = overlay?.querySelector<HTMLFormElement>(
    "[data-admin-login-form]",
  );
  const password =
    overlay?.querySelector<HTMLInputElement>("[name='password']");
  const submit = overlay?.querySelector<HTMLButtonElement>(
    "[data-admin-login-submit]",
  );
  const status = overlay?.querySelector<HTMLElement>(
    "[data-admin-login-status]",
  );
  if (!overlay || !dialog || !form || !password || !submit || !status) return;

  let open = true;
  overlay.addEventListener("admin-login-dispose", () => {
    open = false;
  });
  const close = () => {
    if (!open) return;
    open = false;
    overlay.remove();
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) {
      returnFocus.focus();
    }
    callbacks.onClose();
  };

  overlay
    .querySelector<HTMLButtonElement>("[data-admin-login-close]")
    ?.addEventListener("click", close);
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const submittedPassword = password.value;
    if (submittedPassword.length > 256) {
      password.value = "";
      status.textContent = LOGIN_FAILED;
      password.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = "로그인 중…";
    status.textContent = "";
    try {
      await adminApi.login(submittedPassword);
      if (!open) return;
      open = false;
      overlay.remove();
      callbacks.onAuthenticated();
    } catch {
      if (!open) return;
      password.value = "";
      status.textContent = LOGIN_FAILED;
      submit.disabled = false;
      submit.textContent = "로그인";
      password.focus();
    }
  });
  password.focus();
}
