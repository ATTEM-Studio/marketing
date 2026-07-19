import type {
  AppService,
  AppSession,
  BuyerRegistration,
} from "../services/contracts";

export interface OnboardingCallbacks {
  onAuthenticated(session: AppSession): void;
  /** True only after Supabase has returned from an email authentication link. */
  authCallback?: boolean;
}

const INVITE_ERROR =
  "코드를 확인할 수 없습니다. 입력 내용을 다시 확인해 주세요.";
const REGISTER_ERROR =
  "가입을 진행하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const FINALIZE_ERROR =
  "확인 처리를 마치지 못했습니다. 잠시 후 다시 시도해 주세요.";

function value(form: HTMLFormElement, name: string): string {
  return new FormData(form).get(name)?.toString().trim() ?? "";
}

function showFieldError(
  root: HTMLElement,
  name: string,
  message: string,
): void {
  const error = root.querySelector<HTMLElement>(`#${name}-error`);
  const input = root.querySelector<HTMLInputElement>(`[name='${name}']`);
  if (error) error.textContent = message;
  if (input) {
    input.setAttribute("aria-invalid", "true");
    input.focus();
  }
}

function clearErrors(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".field-error").forEach((error) => {
    error.textContent = "";
  });
  root
    .querySelectorAll<HTMLInputElement>("[aria-invalid='true']")
    .forEach((input) => {
      input.removeAttribute("aria-invalid");
    });
}

function registrationInput(form: HTMLFormElement): BuyerRegistration {
  const email = value(form, "email");
  const input: BuyerRegistration = {
    name: value(form, "name"),
    email,
    region: value(form, "region"),
    businessName: value(form, "businessName"),
    inviteCode: value(form, "inviteCode"),
    serviceConsent: Boolean(
      form.querySelector<HTMLInputElement>("[name='serviceConsent']")?.checked,
    ),
    marketingConsent: Boolean(
      form.querySelector<HTMLInputElement>("[name='marketingConsent']")
        ?.checked,
    ),
  };
  return input;
}

function firstRegistrationError(
  input: BuyerRegistration,
): [string, string] | null {
  if (!input.name) return ["name", "이름을 입력해 주세요."];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return ["email", "이메일 주소를 확인해 주세요."];
  }
  if (!input.region) return ["region", "지역을 입력해 주세요."];
  if (!input.businessName) return ["businessName", "업체명을 입력해 주세요."];
  if (!input.inviteCode) return ["inviteCode", "초대 코드를 입력해 주세요."];
  if (!input.serviceConsent)
    return ["serviceConsent", "서비스 이용 동의가 필요합니다."];
  return null;
}

function renderConfirmation(
  root: HTMLElement,
  service: AppService,
  callbacks: OnboardingCallbacks,
): void {
  root.innerHTML = `
    <main class="onboarding-shell" aria-labelledby="confirmation-title">
      <p class="eyebrow">이메일 확인</p>
      <h1 id="confirmation-title">이메일 확인을 마쳤나요?</h1>
      <p>메일의 로그인 링크를 연 뒤, 아래 버튼을 눌러 가입을 완료해 주세요.</p>
      <button type="button" data-confirm-registration>확인하고 시작하기</button>
      <p class="form-status" role="status" aria-live="polite"></p>
    </main>
  `;
  const button = root.querySelector<HTMLButtonElement>(
    "[data-confirm-registration]",
  );
  const status = root.querySelector<HTMLElement>("[role='status']");
  button?.addEventListener("click", async () => {
    if (!button) return;
    button.disabled = true;
    if (status) status.textContent = "확인하고 있습니다.";
    try {
      // Deliberately initiated by this visible user action; never by auth callback.
      const session = await service.finalizeRegistration();
      callbacks.onAuthenticated(session);
    } catch {
      if (status) status.textContent = FINALIZE_ERROR;
      button.disabled = false;
    }
  });
}

export function renderOnboarding(
  root: HTMLElement,
  service: AppService,
  callbacks: OnboardingCallbacks,
): void {
  if (callbacks.authCallback) {
    renderConfirmation(root, service, callbacks);
    return;
  }

  root.innerHTML = `
    <main class="onboarding-shell" aria-labelledby="onboarding-title">
      <p class="eyebrow">구매자 전용</p>
      <h1 id="onboarding-title">이메일로 안전하게 시작하세요</h1>
      <p>입력한 정보는 가입과 매장 맞춤 안내를 위해 사용합니다.</p>
      <form data-registration-form novalidate>
        <fieldset>
          <legend>처음 이용하시나요?</legend>
          <div class="field"><label for="name">이름</label><input id="name" name="name" required aria-describedby="name-error" autocomplete="name"><p id="name-error" class="field-error"></p></div>
          <div class="field"><label for="email">이메일</label><input id="email" name="email" type="email" required aria-describedby="email-error" autocomplete="email"><p id="email-error" class="field-error"></p></div>
          <div class="field"><label for="region">지역</label><input id="region" name="region" required aria-describedby="region-error" autocomplete="address-level1"><p id="region-error" class="field-error"></p></div>
          <div class="field"><label for="businessName">업체명</label><input id="businessName" name="businessName" required aria-describedby="businessName-error" autocomplete="organization"><p id="businessName-error" class="field-error"></p></div>
          <div class="field"><label for="inviteCode">초대 코드</label><input id="inviteCode" name="inviteCode" required aria-describedby="inviteCode-error" autocomplete="one-time-code"><p id="inviteCode-error" class="field-error"></p></div>
          <div class="field consent-field"><label class="choice"><input name="serviceConsent" type="checkbox" aria-describedby="serviceConsent-error"> 서비스 이용에 동의합니다. (필수)</label><p id="serviceConsent-error" class="field-error"></p></div>
          <label class="choice"><input name="marketingConsent" type="checkbox"> 새 소식과 마케팅 안내를 받겠습니다. (선택)</label>
          <button type="submit" data-register-submit disabled>이메일 확인 링크 보내기</button>
        </fieldset>
      </form>
      <p class="form-status" role="status" aria-live="polite"></p>
      <form data-login-form novalidate>
        <fieldset>
          <legend>이미 가입하셨나요?</legend>
          <div class="field"><label for="loginEmail">가입한 이메일</label><input id="loginEmail" name="loginEmail" type="email" required aria-describedby="loginEmail-error" autocomplete="email"><p id="loginEmail-error" class="field-error"></p></div>
          <button type="submit" data-login-submit>로그인 링크 보내기</button>
        </fieldset>
      </form>
      <p class="login-status" role="status" aria-live="polite"></p>
    </main>
  `;

  const registrationForm = root.querySelector<HTMLFormElement>(
    "[data-registration-form]",
  );
  const registrationButton = root.querySelector<HTMLButtonElement>(
    "[data-register-submit]",
  );
  const registrationStatus = root.querySelector<HTMLElement>(".form-status");
  const serviceConsent = root.querySelector<HTMLInputElement>(
    "[name='serviceConsent']",
  );
  const loginForm = root.querySelector<HTMLFormElement>("[data-login-form]");
  const loginButton = root.querySelector<HTMLButtonElement>(
    "[data-login-submit]",
  );
  const loginStatus = root.querySelector<HTMLElement>(".login-status");

  serviceConsent?.addEventListener("change", () => {
    if (registrationButton)
      registrationButton.disabled = !serviceConsent.checked;
  });

  registrationForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!registrationForm || !registrationButton) return;
    clearErrors(root);
    const input = registrationInput(registrationForm);
    const error = firstRegistrationError(input);
    if (error) {
      showFieldError(root, error[0], error[1]);
      return;
    }
    registrationButton.disabled = true;
    if (registrationStatus)
      registrationStatus.textContent = "이메일 확인 링크를 보내고 있습니다.";
    try {
      await service.registerBuyer(input);
      if (registrationStatus) {
        registrationStatus.textContent =
          "이메일을 확인해 주세요. 메일의 링크를 연 뒤 가입을 완료할 수 있습니다.";
      }
      registrationForm.reset();
    } catch {
      showFieldError(root, "inviteCode", INVITE_ERROR);
      if (registrationStatus) registrationStatus.textContent = REGISTER_ERROR;
    } finally {
      registrationButton.disabled = !(serviceConsent?.checked ?? false);
    }
  });

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!loginForm || !loginButton) return;
    const email = value(loginForm, "loginEmail");
    const emailField = root.querySelector<HTMLInputElement>(
      "[name='loginEmail']",
    );
    const emailError = root.querySelector<HTMLElement>("#loginEmail-error");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (emailError) emailError.textContent = "이메일 주소를 확인해 주세요.";
      emailField?.setAttribute("aria-invalid", "true");
      emailField?.focus();
      return;
    }
    if (emailError) emailError.textContent = "";
    emailField?.removeAttribute("aria-invalid");
    loginButton.disabled = true;
    if (loginStatus) loginStatus.textContent = "로그인 링크를 보내고 있습니다.";
    try {
      await service.sendLoginLink(email);
      if (loginStatus)
        loginStatus.textContent =
          "등록된 주소라면 링크를 보냅니다. 이메일을 확인해 주세요.";
      loginForm.reset();
    } catch {
      if (loginStatus)
        loginStatus.textContent =
          "등록된 주소라면 링크를 보냅니다. 이메일을 확인해 주세요.";
    } finally {
      loginButton.disabled = false;
    }
  });
}
