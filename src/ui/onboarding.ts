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

export type OnboardingView = "register" | "login";

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
  return {
    name: value(form, "name"),
    email: value(form, "email"),
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
  if (!input.serviceConsent) {
    return ["serviceConsent", "서비스 이용 동의가 필요합니다."];
  }
  return null;
}

function workHeader(status: string): string {
  return `<header class="work-header"><a class="work-brand" href="/" aria-label="장사네비게이션 홈"><span class="brand-symbol" aria-hidden="true">N</span><strong>장사네비게이션</strong></a><span class="status-chip">${status}</span></header>`;
}

function registrationScreenMarkup(): string {
  return `
    ${workHeader("구매자 인증")}
    <main class="onboarding-shell" aria-labelledby="onboarding-title">
      <div class="onboarding-layout">
        <section class="onboarding-intro">
          <p class="eyebrow">전자책 구매자 전용</p>
          <h1 id="onboarding-title">내 가게에 맞는 방향을 찾아볼까요?</h1>
          <p>가입과 매장 맞춤 안내를 위해 기본 정보만 받습니다. 입력한 정보는 다른 목적으로 사용하지 않습니다.</p>
          <ol class="mini-journey"><li>구매자 확인</li><li>매장 수치 입력</li><li>오늘의 행동 확인</li></ol>
        </section>
        <section class="form-card" aria-label="신규 가입">
          <div class="form-card-heading"><div><p class="step-kicker">처음 이용하시나요?</p><h2>구매자 인증하기</h2></div></div>
          <form data-registration-form novalidate>
            <div class="question-grid registration-grid">
              <div class="field"><label for="name">이름 <span class="required-label">필수</span></label><input id="name" name="name" required aria-describedby="name-error" autocomplete="name" placeholder="홍길동"><p id="name-error" class="field-error"></p></div>
              <div class="field"><label for="email">이메일 <span class="required-label">필수</span></label><input id="email" name="email" type="email" required aria-describedby="email-error" autocomplete="email" placeholder="name@example.com"><p id="email-error" class="field-error"></p></div>
              <div class="field"><label for="region">지역 <span class="required-label">필수</span></label><input id="region" name="region" required aria-describedby="region-error" autocomplete="address-level1" placeholder="서울 마포구"><p id="region-error" class="field-error"></p></div>
              <div class="field"><label for="businessName">업체명 <span class="required-label">필수</span></label><input id="businessName" name="businessName" required aria-describedby="businessName-error" autocomplete="organization" placeholder="우리 가게 이름"><p id="businessName-error" class="field-error"></p></div>
              <div class="field field-wide"><label for="inviteCode">초대 코드 <span class="required-label">필수</span></label><input id="inviteCode" name="inviteCode" required aria-describedby="inviteCode-error" autocomplete="one-time-code" placeholder="전자책에서 안내받은 코드"><p id="inviteCode-error" class="field-error"></p></div>
            </div>
            <div class="consent-group">
              <div class="field consent-field"><label class="choice"><input name="serviceConsent" type="checkbox" aria-describedby="serviceConsent-error"> <span>서비스 이용과 개인정보 처리에 동의합니다. <strong>필수</strong></span></label><p id="serviceConsent-error" class="field-error"></p></div>
              <label class="choice"><input name="marketingConsent" type="checkbox"> <span>새 소식과 마케팅 안내를 받겠습니다. <small>선택</small></span></label>
            </div>
            <p class="device-storage-note">이 기기에 기록이 저장됩니다. 다른 기기에서는 이전 기록을 불러올 수 없어요.</p>
            <button type="submit" class="primary-action" data-register-submit disabled>바로 진단 시작하기</button>
          </form>
          <p class="form-status" role="status" aria-live="polite"></p>
        </section>
      </div>
    </main>`;
}

function loginScreenMarkup(): string {
  return `
    ${workHeader("기존 사용자")}
    <main class="onboarding-shell" aria-labelledby="login-title">
      <div class="onboarding-layout">
        <section class="onboarding-intro">
          <p class="eyebrow">다시 오셨군요</p>
          <h1 id="login-title">지난 진단과 실행 기록을 이어보세요.</h1>
          <p>가입할 때 사용한 이메일로 안전한 로그인 링크를 보내드립니다.</p>
        </section>
        <section class="form-card" aria-label="기존 사용자 로그인">
          <div class="form-card-heading"><div><p class="step-kicker">비밀번호 없이</p><h2>이메일로 로그인</h2></div><button type="button" class="text-button" data-show-register>처음 이용하기</button></div>
          <form data-login-form novalidate>
            <div class="field"><label for="loginEmail">가입한 이메일</label><input id="loginEmail" name="loginEmail" type="email" required aria-describedby="loginEmail-error" autocomplete="email" placeholder="name@example.com"><p id="loginEmail-error" class="field-error"></p></div>
            <button type="submit" class="primary-action" data-login-submit>로그인 링크 받기</button>
          </form>
          <p class="login-status" role="status" aria-live="polite"></p>
        </section>
      </div>
    </main>`;
}

function renderConfirmation(
  root: HTMLElement,
  service: AppService,
  callbacks: OnboardingCallbacks,
): void {
  root.innerHTML = `
    ${workHeader("이메일 확인")}
    <main class="onboarding-shell confirmation-shell" aria-labelledby="confirmation-title">
      <section class="form-card confirmation-card">
        <p class="eyebrow">마지막 단계</p>
        <h1 id="confirmation-title">이메일 확인을 마쳤나요?</h1>
        <p>메일에서 로그인 링크를 연 뒤 아래 버튼을 눌러 가입을 완료해 주세요.</p>
        <button type="button" class="primary-action" data-confirm-registration>확인하고 진단 시작하기</button>
        <p class="form-status" role="status" aria-live="polite"></p>
      </section>
    </main>`;
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

function bindRegistration(
  root: HTMLElement,
  service: AppService,
  callbacks: OnboardingCallbacks,
): void {
  const form = root.querySelector<HTMLFormElement>("[data-registration-form]");
  const button = root.querySelector<HTMLButtonElement>(
    "[data-register-submit]",
  );
  const status = root.querySelector<HTMLElement>(".form-status");
  const consent = root.querySelector<HTMLInputElement>(
    "[name='serviceConsent']",
  );

  consent?.addEventListener("change", () => {
    if (button) button.disabled = !consent.checked;
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form || !button) return;
    clearErrors(root);
    const input = registrationInput(form);
    const error = firstRegistrationError(input);
    if (error) {
      showFieldError(root, error[0], error[1]);
      return;
    }
    button.disabled = true;
    if (status) {
      status.textContent = "입장 코드를 확인하고 내 공간을 만들고 있어요.";
    }
    try {
      const session = await service.registerBuyer(input);
      callbacks.onAuthenticated(session);
    } catch {
      showFieldError(root, "inviteCode", INVITE_ERROR);
      if (status) status.textContent = REGISTER_ERROR;
    } finally {
      button.disabled = !(consent?.checked ?? false);
    }
  });
}

function bindLogin(root: HTMLElement, service: AppService): void {
  const form = root.querySelector<HTMLFormElement>("[data-login-form]");
  const button = root.querySelector<HTMLButtonElement>("[data-login-submit]");
  const status = root.querySelector<HTMLElement>(".login-status");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form || !button) return;
    const email = value(form, "loginEmail");
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
    button.disabled = true;
    if (status) status.textContent = "로그인 링크를 보내고 있습니다.";
    try {
      await service.sendLoginLink(email);
    } catch {
      // Keep the acknowledgement generic to prevent account enumeration.
    } finally {
      if (status) {
        status.textContent =
          "등록된 주소라면 링크를 보냅니다. 이메일을 확인해 주세요.";
      }
      form.reset();
      button.disabled = false;
    }
  });
}

export function renderOnboarding(
  root: HTMLElement,
  service: AppService,
  callbacks: OnboardingCallbacks,
  initialView: OnboardingView = "register",
): void {
  if (callbacks.authCallback) {
    renderConfirmation(root, service, callbacks);
    return;
  }

  const renderView = (view: OnboardingView) => {
    root.innerHTML =
      view === "register" ? registrationScreenMarkup() : loginScreenMarkup();
    root
      .querySelector<HTMLButtonElement>("[data-show-register]")
      ?.addEventListener("click", () => renderView("register"));
    root
      .querySelector<HTMLButtonElement>("[data-show-login]")
      ?.addEventListener("click", () => renderView("login"));
    if (view === "register") bindRegistration(root, service, callbacks);
    else bindLogin(root, service);
  };

  renderView(initialView);
}
