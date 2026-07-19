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
import { renderLandingShell } from "./ui/shell";

export function createApp(
  root: HTMLElement,
  service: AppService,
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

  return {
    async start() {
      renderLandingShell(root, showDiagnosis);
    },
  };
}

export { readDiagnosisForm };
