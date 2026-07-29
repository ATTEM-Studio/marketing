import {
  buildDiagnosisOutcome,
  restoreResultViewModel,
} from "./result-view-model";
import { adminApi as defaultAdminApi } from "./admin/api";
import { createSecretEntry } from "./admin/secret-entry";
import type { AdminSession } from "./admin/types";
import type { AppService } from "./services/contracts";
import {
  renderAdminDashboard,
  type AdminDashboardApi,
} from "./ui/admin-dashboard";
import { renderAdminLogin, type AdminLoginApi } from "./ui/admin-login";
import {
  readDiagnosisForm,
  renderDiagnosis,
  type DiagnosisInput,
} from "./ui/diagnosis";
import { checkInDueDate, renderResult } from "./ui/result";
import { renderCoaching } from "./ui/coaching";
import { renderDashboard } from "./ui/dashboard";
import { renderOnboarding } from "./ui/onboarding";
import type { OnboardingView } from "./ui/onboarding";
import { renderLandingShell } from "./ui/shell";

interface AdminAppApi extends AdminDashboardApi, AdminLoginApi {
  session(): Promise<AdminSession>;
}

interface CreateAppOptions {
  authCallback?: boolean;
  isLive?: boolean;
  adminApi?: AdminAppApi;
}

function consumeAuthCallback(): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get("auth") !== "callback") return;
  url.searchParams.delete("auth");
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

export function createApp(
  root: HTMLElement,
  service: AppService,
  options: CreateAppOptions = {},
): { start(): Promise<void> } {
  const administratorApi = options.adminApi ?? defaultAdminApi;
  const normalRoot = document.createElement("div");
  normalRoot.dataset.normalAppRoot = "";
  normalRoot.replaceChildren(...Array.from(root.childNodes));
  root.replaceChildren(normalRoot);
  let adminEntryInstalled = false;
  let adminEntryPending = false;
  let normalViewNodes: Node[] = [];
  let adminReturnFocus: HTMLElement | null = null;

  const showLanding = () => {
    renderLandingShell(
      normalRoot,
      {
        onRegister: () => showOnboarding(false, "register"),
        onLogin: () => showOnboarding(false, "register"),
        onDemo: () => showDiagnosis(),
      },
      { mode: options.isLive ? "live" : "demo" },
    );
  };

  const restoreNormalView = () => {
    if (normalViewNodes.length === 0) {
      showLanding();
      return;
    }
    root.replaceChildren(...normalViewNodes);
  };

  const showAdminLogin = () => {
    renderAdminLogin(root, administratorApi, {
      onAuthenticated() {
        void showAdministratorDashboard();
      },
      onClose() {
        adminEntryPending = false;
      },
      returnFocus: adminReturnFocus,
    });
  };

  const showAdministratorDashboard = async () => {
    adminEntryPending = false;
    normalViewNodes = Array.from(root.childNodes);
    await renderAdminDashboard(root, administratorApi, {
      onUnauthorized() {
        restoreNormalView();
        showAdminLogin();
      },
      onLogout() {
        restoreNormalView();
      },
    });
  };

  const secretEntry = createSecretEntry({
    presses: 10,
    windowMs: 5_000,
    onUnlock() {
      if (adminEntryPending) return;
      adminEntryPending = true;
      void administratorApi
        .session()
        .then(() => showAdministratorDashboard())
        .catch(() => {
          adminEntryPending = false;
          showAdminLogin();
        });
    },
  });

  const installAdminEntry = () => {
    if (adminEntryInstalled) return;
    adminEntryInstalled = true;
    root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const trigger = target.closest<HTMLElement>("[data-admin-trigger]");
      if (!trigger) return;
      adminReturnFocus = trigger;
      secretEntry.press();
    });
  };

  const showDashboard = async () => {
    const session = await service.getSession();
    await renderDashboard(
      normalRoot,
      session,
      service,
      () => {
        showDiagnosis(session.mode === "live");
      },
      showLanding,
      showCoaching,
      (assessment) => {
        const model = restoreResultViewModel(assessment);
        if (!model) return;
        renderResult(normalRoot, model, {
          onBack: () => {
            void showDashboard();
          },
        });
      },
    );
  };

  const showCoaching = (assessmentId: string, initialQuestion?: string) => {
    renderCoaching(
      normalRoot,
      assessmentId,
      service,
      () => {
        void showDashboard();
      },
      { ...(initialQuestion ? { initialQuestion } : {}) },
    );
  };

  const showDiagnosis = (liveSession = false) => {
    renderDiagnosis(normalRoot, {
      async onSubmit(input: DiagnosisInput) {
        const outcome = buildDiagnosisOutcome(input);
        const { action, allocation } = outcome.model;
        const submit = normalRoot.querySelector<HTMLButtonElement>(
          "[data-submit-diagnosis]",
        );
        const status =
          normalRoot.querySelector<HTMLElement>("[data-save-status]");
        if (submit) submit.disabled = true;
        if (status) status.textContent = "결과를 저장하고 있습니다.";
        try {
          const assessment = await service.saveAssessment({
            inputs: {
              ...input,
              allocation,
            } as unknown as Record<string, unknown>,
            metrics: outcome.persistedMetrics,
            diagnosis: outcome.persistedDiagnosis,
          });
          renderResult(normalRoot, outcome.model, {
            async onSaveAction() {
              await service.saveActionPlan({
                assessmentId: assessment.id,
                actionKey: action.key,
                metric: action.metric,
                checkInDueAt: checkInDueDate(assessment.createdAt),
              });
              await showDashboard();
            },
          });
        } catch {
          if (status) {
            status.textContent =
              "저장하지 못했습니다. 다시 로그인한 뒤 다시 시도해 주세요.";
          }
          if (submit) {
            submit.disabled = false;
            submit.focus();
          }
        }
      },
    });
    if (!liveSession) return;
    const shell = normalRoot.querySelector<HTMLElement>(".diagnosis-shell");
    if (!shell) return;
    shell.insertAdjacentHTML(
      "afterbegin",
      `<div class="account-actions"><button type="button" data-sign-out>로그아웃</button><p class="form-status" role="status" aria-live="polite"></p></div>`,
    );
    const signOut = shell.querySelector<HTMLButtonElement>("[data-sign-out]");
    const signOutStatus = shell.querySelector<HTMLElement>(
      ".account-actions [role='status']",
    );
    signOut?.addEventListener("click", async () => {
      if (!signOut) return;
      signOut.disabled = true;
      if (signOutStatus) signOutStatus.textContent = "로그아웃하고 있습니다.";
      try {
        await service.signOut();
        showLanding();
      } catch {
        if (signOutStatus) {
          signOutStatus.textContent =
            "로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.";
        }
        signOut.disabled = false;
        signOut.focus();
      }
    });
  };

  const showOnboarding = (
    authCallback = false,
    initialView: OnboardingView = "register",
  ) => {
    renderOnboarding(
      normalRoot,
      service,
      {
        authCallback,
        onAuthenticated(finalized) {
          if (finalized.profile) {
            consumeAuthCallback();
            showDiagnosis(true);
            return;
          }
          showOnboarding(false);
        },
      },
      initialView,
    );
  };

  return {
    async start() {
      installAdminEntry();
      if (!options.isLive) showLanding();
      let session;
      try {
        session = await service.getSession();
      } catch {
        if (options.isLive) showLanding();
        return;
      }
      if (session.mode !== "live") return;
      if (session.profile) {
        if (options.authCallback) consumeAuthCallback();
        await showDashboard();
        return;
      }
      if (options.authCallback) showOnboarding(true);
      else showLanding();
    },
  };
}

export { readDiagnosisForm };
