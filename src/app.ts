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
  const showDiagnosis = () => {
    renderDiagnosis(root, {
      async onSubmit(input: DiagnosisInput) {
        const metrics = calculateRevenueMetrics(input.revenue);
        const bottleneck = selectBottleneck(input.bottleneck);
        const action = selectAction({ ...input, metrics, bottleneck });
        void service.saveAssessment({
          inputs: input as unknown as Record<string, unknown>,
          metrics: metrics as unknown as Record<string, unknown>,
          diagnosis: { bottleneck, actionKey: action.key },
        });
        renderResult(root, { metrics, bottleneck, action });
      },
    });
  };

  const showOnboarding = (authCallback = false) => {
    renderOnboarding(root, service, {
      authCallback,
      onAuthenticated(finalized) {
        if (finalized.profile) {
          showDiagnosis();
          return;
        }
        showOnboarding(false);
      },
    });
  };

  return {
    async start() {
      if (!options.isLive) renderLandingShell(root, showDiagnosis);
      let session;
      try {
        session = await service.getSession();
      } catch {
        if (options.isLive) renderLandingShell(root, () => undefined, false);
        return;
      }
      if (session.mode !== "live") return;
      if (session.profile) {
        showDiagnosis();
        return;
      }
      showOnboarding(options.authCallback);
    },
  };
}

export { readDiagnosisForm };
