import { describe, expect, it } from "vitest";
import { restoreResultViewModel } from "../src/result-view-model";
import { createAuthenticAssessment } from "./fixtures/authentic-assessment";

describe("persisted result view model", () => {
  it("restores the saved customer targets and recommendation", () => {
    const assessment = createAuthenticAssessment();

    expect(restoreResultViewModel(assessment)).toMatchObject({
      metrics: {
        shortfallRevenue: 2_000_000,
        maxNewCustomers: 100,
        maxNewCustomersPerDay: 4,
      },
      action: { key: assessment.diagnosis.actionKey },
      effectiveCapacity: assessment.diagnosis.effectiveCapacity,
    });
  });

  it("refuses incomplete or tampered persisted assessments", () => {
    const incomplete = { ...createAuthenticAssessment(), diagnosis: {} };
    const tampered = createAuthenticAssessment();
    tampered.metrics.newCustomerTarget = 999;

    expect(restoreResultViewModel(incomplete)).toBeNull();
    expect(restoreResultViewModel(tampered)).toBeNull();
  });
});
