import { selectBottleneck } from "./domain/bottleneck";
import { selectAction } from "./domain/recommendation";
import { calculateRevenueMetrics } from "./domain/revenue";
import type { AppService } from "./services/contracts";
import {
  readDiagnosisForm,
  renderDiagnosis,
  type DiagnosisInput,
} from "./ui/diagnosis";
import { renderResult } from "./ui/result";
import { renderOnboarding } from "./ui/onboarding";
import { renderLandingShell } from "./ui/shell";

export function createApp(
  root: HTMLElement,
  service: AppService,
  options: { authCallback?: boolean; isLive?: boolean } = {},
): { start(): Promise<void> } {
  const showDiagnosis = (liveSession = false) => {
    renderDiagnosis(root, {
      async onSubmit(input: DiagnosisInput) {
        const metrics = calculateRevenueMetrics(input.revenue);
        const bottleneck = selectBottleneck(input.bottleneck);
        const action = selectAction({ ...input, metrics, bottleneck });
        const submit = root.querySelector<HTMLButtonElement>(
          "[data-submit-diagnosis]",
        );
        const status = root.querySelector<HTMLElement>("[data-save-status]");
        if (submit) submit.disabled = true;
        if (status) status.textContent = "결과를 저장하고 있습니다.";
        try {
          await service.saveAssessment({
            inputs: input as unknown as Record<string, unknown>,
            metrics: metrics as unknown as Record<string, unknown>,
            diagnosis: { bottleneck, actionKey: action.key },
          });
          renderResult(root, { metrics, bottleneck, action });
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
        renderLandingShell(root, () => undefined, false);
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
          showDiagnosis(true);
          return;
        }
        showOnboarding(false);
      },
    });
  };

  return {
    async start() {
      if (!options.isLive) renderLandingShell(root, () => showDiagnosis());
      let session;
      try {
        session = await service.getSession();
      } catch {
        if (options.isLive) renderLandingShell(root, () => undefined, false);
        return;
      }
      if (session.mode !== "live") return;
      if (session.profile) {
        showDiagnosis(true);
        return;
      }
      showOnboarding(options.authCallback);
    },
  };
}

export { readDiagnosisForm };
