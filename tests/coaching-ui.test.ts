import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoachingTurnResponse } from "../src/coaching/types";
import type { AppService } from "../src/services/contracts";
import { renderCoaching } from "../src/ui/coaching";

const followUpResponse: CoachingTurnResponse = {
  kind: "follow_up",
  sessionId: "session-1",
  question: {
    key: "customer_choice_reason",
    prompt: "고객이 우리 매장을 선택하는 가장 큰 이유는 무엇인가요?",
    options: ["메뉴", "가격", "분위기", "아직 모름"],
  },
  remaining: 1,
};

const answerResponse: CoachingTurnResponse = {
  kind: "answer",
  sessionId: "session-1",
  recommendationId: "recommendation-1",
  response: {
    situation: "광고 유입과 실제 방문 사이를 아직 확인하기 어렵습니다.",
    stage: "방문 단계",
    evidence: ["광고는 운영 중입니다.", "실제 방문 기록은 없습니다."],
    actionTitle: "광고 유입과 실제 방문을 함께 기록하기",
    steps: [
      "광고별 문의 경로를 하나 정합니다.",
      "7일 동안 문의와 실제 방문을 기록합니다.",
    ],
    metric: "광고 유입 대비 실제 방문 수",
    avoid: "전환 기록 없이 광고비부터 늘리지 마세요.",
    disclaimer: "성과를 보장하는 답변이 아닙니다.",
  },
};

function serviceWith(
  askCoach: AppService["askCoach"] = vi.fn(async () => answerResponse),
): AppService {
  return {
    askCoach,
    rateCoaching: vi.fn(async () => undefined),
  } as unknown as AppService;
}

function root(): HTMLElement {
  const element = document.querySelector<HTMLElement>("#app");
  if (!element) throw new Error("missing root");
  return element;
}

function click(selector: string): void {
  const element = root().querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`missing ${selector}`);
  element.click();
}

function questionInput(): HTMLTextAreaElement {
  const input = root().querySelector<HTMLTextAreaElement>(
    "[data-coaching-question]",
  );
  if (!input) throw new Error("missing question input");
  return input;
}

function typeQuestion(value: string): void {
  const input = questionInput();
  input.value = value;
  input.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

function submitButton(): HTMLButtonElement {
  const button = root().querySelector<HTMLButtonElement>(
    "[data-submit-question]",
  );
  if (!button) throw new Error("missing submit button");
  return button;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("instant coaching UI", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  it("renders six native-button concerns and an accessible 500-character question", () => {
    const service = serviceWith();

    renderCoaching(root(), "a1", service, vi.fn());

    const concerns =
      root().querySelectorAll<HTMLButtonElement>("[data-concern]");
    expect(concerns).toHaveLength(6);
    expect([...concerns].every((button) => button.tagName === "BUTTON")).toBe(
      true,
    );
    expect(root().textContent).toContain("검색해도 우리 가게가 잘 안 보여요");
    expect(root().textContent).toContain("한 번 온 고객이 다시 오지 않아요");
    expect(questionInput().maxLength).toBe(500);
    expect(questionInput().labels?.[0]?.textContent).toContain("직접 질문하기");
    expect(
      root().querySelector("[data-character-count]")?.textContent,
    ).toContain("500자 남음");
    expect(submitButton().disabled).toBe(true);
  });

  it("starts from a concern card, prevents duplicate submits, and renders one follow-up at a time", async () => {
    let resolveTurn: ((value: CoachingTurnResponse) => void) | undefined;
    const askCoach = vi.fn(
      () =>
        new Promise<CoachingTurnResponse>((resolve) => {
          resolveTurn = resolve;
        }),
    );
    const service = serviceWith(askCoach);

    renderCoaching(root(), "a1", service, vi.fn());
    click('[data-concern="not_visible"]');
    click('[data-concern="not_visible"]');

    expect(askCoach).toHaveBeenCalledOnce();
    expect(askCoach).toHaveBeenCalledWith({
      assessmentId: "a1",
      concernKey: "not_visible",
    });
    expect(root().querySelector("main")?.getAttribute("aria-busy")).toBe(
      "true",
    );
    const loadingStatus = root().querySelector("[data-coaching-status]");
    expect(loadingStatus?.textContent).toContain("답변을 준비하고 있습니다");
    expect(loadingStatus?.classList.contains("coaching-loading")).toBe(true);

    resolveTurn?.(followUpResponse);
    await flushPromises();

    expect(root().querySelectorAll("[data-follow-up]")).toHaveLength(1);
    expect(root().querySelector("[data-coaching-answer]")).toBeNull();
    expect(document.activeElement).toBe(
      root().querySelector("[data-follow-up-heading]"),
    );
  });

  it("submits one follow-up choice and renders seven answer sections", async () => {
    const askCoach = vi
      .fn<AppService["askCoach"]>()
      .mockResolvedValueOnce(followUpResponse)
      .mockResolvedValueOnce(answerResponse);
    const service = serviceWith(askCoach);

    renderCoaching(root(), "a1", service, vi.fn());
    click('[data-concern="visible_no_visit"]');
    await flushPromises();
    click('[data-follow-up-option="메뉴"]');
    await flushPromises();

    expect(askCoach).toHaveBeenLastCalledWith({
      assessmentId: "a1",
      sessionId: "session-1",
      answer: { questionKey: "customer_choice_reason", value: "메뉴" },
    });
    expect(root().querySelectorAll("[data-follow-up]")).toHaveLength(0);
    expect(root().querySelectorAll("[data-answer-section]")).toHaveLength(7);
    expect(root().querySelectorAll("[data-feedback]")).toHaveLength(3);
    expect(root().querySelectorAll("[data-answer-steps] li")).toHaveLength(2);
    expect(document.activeElement).toBe(
      root().querySelector("[data-answer-heading]"),
    );
  });

  it("submits a trimmed free question and prevents empty or over-500-character submissions", async () => {
    const askCoach = vi.fn(async () => answerResponse);
    const service = serviceWith(askCoach);

    renderCoaching(root(), "a1", service, vi.fn());
    expect(submitButton().disabled).toBe(true);

    typeQuestion(`  ${"가".repeat(501)}  `);
    expect(root().textContent).toContain("질문은 500자 이내로 적어 주세요");
    expect(submitButton().disabled).toBe(true);

    typeQuestion("  광고를 하는데 손님이 늘지 않아요  ");
    root()
      .querySelector<HTMLFormElement>("[data-question-form]")
      ?.requestSubmit();
    await flushPromises();

    expect(askCoach).toHaveBeenCalledWith({
      assessmentId: "a1",
      question: "광고를 하는데 손님이 늘지 않아요",
    });
  });

  it("announces a recoverable error and retries the same request", async () => {
    const askCoach = vi
      .fn<AppService["askCoach"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(followUpResponse);
    const service = serviceWith(askCoach);

    renderCoaching(root(), "a1", service, vi.fn());
    click('[data-concern="not_visible"]');
    await flushPromises();

    const alert = root().querySelector<HTMLElement>("[data-coaching-error]");
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.textContent).toContain("답변을 불러오지 못했습니다");
    expect(document.activeElement).toBe(
      root().querySelector("[data-retry-coaching]"),
    );

    click("[data-retry-coaching]");
    await flushPromises();

    expect(askCoach).toHaveBeenCalledTimes(2);
    expect(askCoach.mock.calls[1]).toEqual(askCoach.mock.calls[0]);
    expect(root().querySelectorAll("[data-follow-up]")).toHaveLength(1);
  });

  it("records one accessible selected feedback state", async () => {
    const service = serviceWith();
    const rateCoaching = vi.mocked(service.rateCoaching);

    renderCoaching(root(), "a1", service, vi.fn());
    typeQuestion("지금 할 일을 알려 주세요");
    root()
      .querySelector<HTMLFormElement>("[data-question-form]")
      ?.requestSubmit();
    await flushPromises();
    click('[data-feedback="helpful"]');
    await flushPromises();

    expect(rateCoaching).toHaveBeenCalledWith("recommendation-1", "helpful");
    expect(
      root()
        .querySelector('[data-feedback="helpful"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      root().querySelector("[data-feedback-status]")?.textContent,
    ).toContain("의견을 남겼습니다");
  });

  it("returns through the back control", () => {
    const onBack = vi.fn();
    renderCoaching(root(), "a1", serviceWith(), onBack);

    click("[data-coaching-back]");

    expect(onBack).toHaveBeenCalledOnce();
  });

  it("does not replace the destination when an in-flight answer arrives after going back", async () => {
    let resolveTurn: ((value: CoachingTurnResponse) => void) | undefined;
    const service = serviceWith(
      vi.fn(
        () =>
          new Promise<CoachingTurnResponse>((resolve) => {
            resolveTurn = resolve;
          }),
      ),
    );
    const onBack = vi.fn(() => {
      root().innerHTML = "<p>대시보드</p>";
    });
    renderCoaching(root(), "a1", service, onBack);

    click('[data-concern="not_visible"]');
    click("[data-coaching-back]");
    resolveTurn?.(answerResponse);
    await flushPromises();

    expect(root().textContent).toBe("대시보드");
  });
});
