import { selectBottleneck } from "./domain/bottleneck";
import { selectAction } from "./domain/recommendation";
import {
  allocationNewCustomerTarget,
  calculateAdvertisingMetrics,
  calculateRevenueMetrics,
  normalizeGoalAllocation,
} from "./domain/revenue";
import type { AppService } from "./services/contracts";
import {
  readDiagnosisForm,
  renderDiagnosis,
  type DiagnosisInput,
} from "./ui/diagnosis";
import { checkInDueDate, renderResult } from "./ui/result";
import { renderDashboard } from "./ui/dashboard";
import { renderOnboarding } from "./ui/onboarding";
import { renderLandingShell } from "./ui/shell";

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
  options: { authCallback?: boolean; isLive?: boolean } = {},
): { start(): Promise<void> } {
  const showLanding = () => {
    renderLandingShell(
      root,
      {
        onRegister: () => showOnboarding(false),
        onLogin: () => showOnboarding(false),
        onDemo: () => showDiagnosis(),
      },
      { mode: options.isLive ? "live" : "demo" },
    );
  };

  const showDashboard = async () => {
    const session = await service.getSession();
    await renderDashboard(
      root,
      session,
      service,
      () => {
        showDiagnosis(session.mode === "live");
      },
      showLanding,
    );
  };

  const showDiagnosis = (liveSession = false) => {
    renderDiagnosis(root, {
      async onSubmit(input: DiagnosisInput) {
        const metrics = calculateRevenueMetrics(input.revenue);
        const allocation = normalizeGoalAllocation(input.allocation);
        const newCustomerTarget = allocationNewCustomerTarget(
          metrics.maxNewCustomers,
          input.revenue.averageOrderValue,
          allocation,
        );
        const advertising = calculateAdvertisingMetrics(
          newCustomerTarget,
          input.advertising,
        );
        const hasAdvertisingInputs = Object.values(input.advertising).some(
          (value) => value !== null,
        );
        const advertisingResult =
          input.adsRunning || hasAdvertisingInputs
            ? {
                advertising,
                advertisingInputs: input.advertising,
              }
            : {};
        const bottleneck = selectBottleneck(input.bottleneck);
        const action = selectAction({ ...input, metrics, bottleneck });
        const submit = root.querySelector<HTMLButtonElement>(
          "[data-submit-diagnosis]",
        );
        const status = root.querySelector<HTMLElement>("[data-save-status]");
        if (submit) submit.disabled = true;
        if (status) status.textContent = "결과를 저장하고 있습니다.";
        try {
          const assessment = await service.saveAssessment({
            inputs: {
              ...input,
              allocation,
            } as unknown as Record<string, unknown>,
            metrics: {
              ...metrics,
              newCustomerTarget,
              advertising,
            } as unknown as Record<string, unknown>,
            diagnosis: { bottleneck, actionKey: action.key },
          });
          renderResult(
            root,
            {
              metrics,
              allocation,
              ...advertisingResult,
              bottleneck,
              action,
            },
            {
              async onSaveAction() {
                await service.saveActionPlan({
                  assessmentId: assessment.id,
                  actionKey: action.key,
                  metric: action.metric,
                  checkInDueAt: checkInDueDate(assessment.createdAt),
                });
                await showDashboard();
              },
            },
          );
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
    const shell = root.querySelector<HTMLElement>(".diagnosis-shell");
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

  const showOnboarding = (authCallback = false) => {
    renderOnboarding(root, service, {
      authCallback,
      onAuthenticated(finalized) {
        if (finalized.profile) {
          consumeAuthCallback();
          showDiagnosis(true);
          return;
        }
        showOnboarding(false);
      },
    });
  };

  return {
    async start() {
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
