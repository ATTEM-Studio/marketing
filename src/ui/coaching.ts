import type {
  CoachingConcernKey,
  CoachingFeedback,
  CoachingTurnRequest,
  CoachingTurnResponse,
} from "../coaching/types";
import type { AppService } from "../services/contracts";

const concerns: readonly {
  key: CoachingConcernKey;
  label: string;
}[] = [
  { key: "not_visible", label: "검색해도 우리 가게가 잘 안 보여요" },
  { key: "visible_no_visit", label: "플레이스는 보는데 방문하지 않아요" },
  { key: "ads_no_customers", label: "광고비는 쓰는데 손님이 늘지 않아요" },
  {
    key: "low_average_order_value",
    label: "손님은 오는데 객단가가 낮아요",
  },
  { key: "low_returning", label: "한 번 온 고객이 다시 오지 않아요" },
  { key: "unknown", label: "무엇이 문제인지 모르겠어요" },
];

const feedbackOptions: readonly {
  value: CoachingFeedback;
  label: string;
}[] = [
  { value: "helpful", label: "도움됐어요" },
  { value: "too_hard", label: "너무 어려워요" },
  { value: "not_relevant", label: "내 상황과 달라요" },
];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shell(content: string, busy: boolean, status: string): string {
  return `
    <main id="main" class="coaching-shell" aria-busy="${busy}">
      <header class="coaching-header">
        <button type="button" class="quiet-button coaching-back" data-coaching-back aria-label="대시보드로 돌아가기">← 돌아가기</button>
        <div>
          <p class="eyebrow">즉문즉답 코치</p>
          <h1>지금 고민부터 하나씩 풀어볼게요.</h1>
        </div>
      </header>
      ${content}
      <p class="${busy ? "coaching-loading" : "sr-only"}" role="status" aria-live="polite" aria-atomic="true" tabindex="-1" data-coaching-status>${
        busy
          ? `<span class="coaching-loading-visual" aria-hidden="true">
              <span class="coaching-loading-spinner" data-coaching-spinner aria-hidden="true"></span>
              <span class="coaching-loading-dots" data-coaching-dots aria-hidden="true">
                <span class="coaching-loading-dot"></span>
                <span class="coaching-loading-dot"></span>
                <span class="coaching-loading-dot"></span>
              </span>
            </span>`
          : ""
      }<span class="coaching-loading-message">${escapeHtml(status)}</span></p>
    </main>`;
}

function initialContent(
  question: string,
  busy: boolean,
  validationMessage: string,
): string {
  const remaining = Math.max(0, 500 - question.length);
  const canSubmit = question.trim().length > 0 && question.length <= 500;
  return `
    <section class="coaching-question-card" aria-labelledby="coaching-question-title">
      <p class="eyebrow">AI 자유 질문</p>
      <h2 id="coaching-question-title">AI 코치에게 직접 물어보세요</h2>
      <p>매출·광고·재방문·플레이스 고민을 최신 진단을 바탕으로 답해드려요.</p>
      <form data-question-form novalidate>
        <label for="coaching-question">AI 코치에게 직접 질문하기</label>
        <textarea id="coaching-question" data-coaching-question name="question" rows="4" maxlength="500" aria-describedby="coaching-character-count coaching-question-error"${validationMessage ? ' aria-invalid="true"' : ""}${busy ? " disabled" : ""}>${escapeHtml(question)}</textarea>
        <div class="coaching-question-meta">
          <p id="coaching-question-error" class="field-error">${escapeHtml(validationMessage)}</p>
          <p id="coaching-character-count" data-character-count>${remaining}자 남음</p>
        </div>
        <div class="coaching-primary-action">
          <button type="submit" data-submit-question${!canSubmit || busy ? " disabled" : ""}>질문하고 행동 찾기</button>
        </div>
      </form>
    </section>
    <section class="coaching-intro" aria-labelledby="coaching-concerns-title">
      <h2 id="coaching-concerns-title">또는 고민 유형으로 시작하기</h2>
      <p>말로 적기 어렵다면 가장 가까운 고민 하나를 골라주세요.</p>
      <div class="coaching-concern-grid">
        ${concerns
          .map(
            ({ key, label }) =>
              `<button type="button" class="coaching-concern" data-concern="${key}"${busy ? " disabled" : ""}><span>${escapeHtml(label)}</span><span aria-hidden="true">→</span></button>`,
          )
          .join("")}
      </div>
    </section>`;
}

function followUpContent(
  response: Extract<CoachingTurnResponse, { kind: "follow_up" }>,
  busy: boolean,
): string {
  return `
    <section class="coaching-follow-up" data-follow-up aria-labelledby="coaching-follow-up-title">
      <p class="eyebrow">조금만 더 확인할게요</p>
      <h2 id="coaching-follow-up-title" tabindex="-1" data-follow-up-heading>${escapeHtml(response.question.prompt)}</h2>
      <p>답변에 꼭 필요한 내용만 묻고 있어요.${response.remaining > 0 ? ` 추가 질문은 최대 ${response.remaining}개 남았습니다.` : ""}</p>
      <div class="coaching-follow-up-options" role="group" aria-label="추가 질문 선택지">
        ${response.question.options
          .map(
            (option) =>
              `<button type="button" data-follow-up-option="${escapeHtml(option)}"${busy ? " disabled" : ""}>${escapeHtml(option)}</button>`,
          )
          .join("")}
      </div>
    </section>`;
}

function answerContent(
  response: Extract<CoachingTurnResponse, { kind: "answer" }>,
): string {
  const answer = response.response;
  return `
    <article class="coaching-answer" data-coaching-answer aria-labelledby="coaching-answer-title">
      <header class="coaching-answer-header">
        <p class="eyebrow">지금 할 행동 하나</p>
        <h2 id="coaching-answer-title" tabindex="-1" data-answer-heading>${escapeHtml(answer.actionTitle)}</h2>
      </header>
      <div class="coaching-answer-sections">
        <section data-answer-section><h3>현재 상황</h3><p>${escapeHtml(answer.situation)}</p></section>
        <section data-answer-section><h3>문제 단계</h3><p>${escapeHtml(answer.stage)}</p></section>
        <section data-answer-section><h3>판단한 근거</h3><ul>${answer.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
        <section class="coaching-action-section" data-answer-section><h3>지금 바로 할 행동</h3><p><strong>${escapeHtml(answer.actionTitle)}</strong></p></section>
        <section data-answer-section><h3>실행 방법</h3><ol data-answer-steps>${answer.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></section>
        <section data-answer-section><h3>확인할 숫자</h3><p>${escapeHtml(answer.metric)}</p></section>
        <section class="coaching-avoid-section" data-answer-section><h3>지금 하지 말아야 할 것</h3><p>${escapeHtml(answer.avoid)}</p></section>
      </div>
      ${answer.disclaimer ? `<p class="coaching-disclaimer">${escapeHtml(answer.disclaimer)}</p>` : ""}
      <section class="coaching-feedback" aria-labelledby="coaching-feedback-title">
        <h3 id="coaching-feedback-title">이 답변은 어땠나요?</h3>
        <div class="coaching-feedback-options">
          ${feedbackOptions
            .map(
              ({ value, label }) =>
                `<button type="button" class="secondary-action" data-feedback="${value}" aria-pressed="false">${escapeHtml(label)}</button>`,
            )
            .join("")}
        </div>
        <p class="form-status" role="status" aria-live="polite" data-feedback-status></p>
      </section>
    </article>`;
}

function errorContent(busy: boolean): string {
  return `
    <section class="coaching-error" data-coaching-error role="alert" aria-labelledby="coaching-error-title">
      <p class="eyebrow">연결 상태 확인</p>
      <h2 id="coaching-error-title">답변을 불러오지 못했습니다.</h2>
      <p>입력한 고민은 그대로 기억하고 있어요. 잠시 후 다시 시도해 주세요.</p>
      <button type="button" data-retry-coaching aria-disabled="${busy}"${busy ? " disabled" : ""}>다시 시도하기</button>
    </section>`;
}

export function renderCoaching(
  root: HTMLElement,
  assessmentId: string,
  service: AppService,
  onBack: () => void,
  options: { initialQuestion?: string } = {},
): void {
  let state: "initial" | "follow_up" | "answer" | "error" = "initial";
  let question = "";
  let validationMessage = "";
  let currentResponse: CoachingTurnResponse | null = null;
  let lastRequest: CoachingTurnRequest | null = null;
  let busy = false;
  let active = true;
  let returning = false;

  const render = (status = "") => {
    let content: string;
    if (state === "follow_up" && currentResponse?.kind === "follow_up") {
      content = followUpContent(currentResponse, busy);
    } else if (state === "answer" && currentResponse?.kind === "answer") {
      content = answerContent(currentResponse);
    } else if (state === "error") {
      content = errorContent(busy);
    } else {
      content = initialContent(question, busy, validationMessage);
    }
    root.innerHTML = shell(content, busy, status);
    bind();
  };

  const focusStateHeading = () => {
    const selector =
      state === "follow_up"
        ? "[data-follow-up-heading]"
        : state === "answer"
          ? "[data-answer-heading]"
          : state === "error"
            ? "[data-retry-coaching]"
            : "[data-coaching-question]";
    root.querySelector<HTMLElement>(selector)?.focus();
  };

  const submitRequest = async (request: CoachingTurnRequest) => {
    if (busy || !active) return;
    busy = true;
    lastRequest = request;
    render("답변을 준비하고 있습니다.");
    root.querySelector<HTMLElement>("[data-coaching-status]")?.focus();
    try {
      const response = await service.askCoach(request);
      if (!active) return;
      currentResponse = response;
      state = currentResponse.kind;
      busy = false;
      render(
        currentResponse.kind === "follow_up"
          ? "추가 질문을 확인해 주세요."
          : "코칭 답변이 준비되었습니다.",
      );
      focusStateHeading();
    } catch {
      if (!active) return;
      state = "error";
      busy = false;
      render("답변을 불러오지 못했습니다. 다시 시도해 주세요.");
      focusStateHeading();
    }
  };

  const bindFeedback = () => {
    if (currentResponse?.kind !== "answer") return;
    const answerResponse = currentResponse;
    const feedbackButtons =
      root.querySelectorAll<HTMLButtonElement>("[data-feedback]");
    const feedbackStatus = root.querySelector<HTMLElement>(
      "[data-feedback-status]",
    );
    feedbackButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        if (button.disabled) return;
        feedbackButtons.forEach((item) => {
          item.disabled = true;
        });
        if (feedbackStatus)
          feedbackStatus.textContent = "의견을 저장하고 있습니다.";
        try {
          await service.rateCoaching(
            answerResponse.recommendationId,
            button.dataset.feedback as CoachingFeedback,
          );
          feedbackButtons.forEach((item) => {
            item.setAttribute("aria-pressed", String(item === button));
          });
          if (feedbackStatus)
            feedbackStatus.textContent = "의견을 남겼습니다. 고맙습니다.";
        } catch {
          feedbackButtons.forEach((item) => {
            item.disabled = false;
          });
          if (feedbackStatus) {
            feedbackStatus.textContent =
              "의견을 저장하지 못했습니다. 다시 선택해 주세요.";
          }
          button.focus();
        }
      });
    });
  };

  function bind(): void {
    root
      .querySelector<HTMLButtonElement>("[data-coaching-back]")
      ?.addEventListener("click", (event) => {
        if (returning || !active) return;
        returning = true;
        active = false;
        (event.currentTarget as HTMLButtonElement).disabled = true;
        onBack();
      });

    if (state === "initial") {
      root
        .querySelectorAll<HTMLButtonElement>("[data-concern]")
        .forEach((button) => {
          button.addEventListener("click", () => {
            const concernKey = button.dataset.concern as CoachingConcernKey;
            void submitRequest({ assessmentId, concernKey });
          });
          button.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            button.click();
          });
        });
      const input = root.querySelector<HTMLTextAreaElement>(
        "[data-coaching-question]",
      );
      input?.addEventListener("input", () => {
        question = input.value;
        validationMessage =
          question.length > 500 ? "질문은 500자 이내로 적어 주세요." : "";
        const remaining = root.querySelector<HTMLElement>(
          "[data-character-count]",
        );
        const error = root.querySelector<HTMLElement>(
          "#coaching-question-error",
        );
        const submit = root.querySelector<HTMLButtonElement>(
          "[data-submit-question]",
        );
        if (remaining)
          remaining.textContent = `${Math.max(0, 500 - question.length)}자 남음`;
        if (error) error.textContent = validationMessage;
        input.toggleAttribute("aria-invalid", validationMessage !== "");
        if (submit) {
          submit.disabled =
            question.trim().length === 0 || question.length > 500 || busy;
        }
      });
      root
        .querySelector<HTMLFormElement>("[data-question-form]")
        ?.addEventListener("submit", (event) => {
          event.preventDefault();
          const trimmed = question.trim();
          if (busy || trimmed.length === 0 || question.length > 500) return;
          void submitRequest({ assessmentId, question: trimmed });
        });
    }

    if (state === "follow_up" && currentResponse?.kind === "follow_up") {
      root
        .querySelectorAll<HTMLButtonElement>("[data-follow-up-option]")
        .forEach((button) => {
          button.addEventListener("click", () => {
            if (currentResponse?.kind !== "follow_up") return;
            void submitRequest({
              assessmentId,
              sessionId: currentResponse.sessionId,
              answer: {
                questionKey: currentResponse.question.key,
                value: button.dataset.followUpOption ?? "",
              },
            });
          });
        });
    }

    if (state === "answer") bindFeedback();

    if (state === "error") {
      root
        .querySelector<HTMLButtonElement>("[data-retry-coaching]")
        ?.addEventListener("click", () => {
          if (lastRequest) void submitRequest(lastRequest);
        });
    }
  }

  const initialQuestion = options.initialQuestion?.trim() ?? "";
  if (initialQuestion.length > 0 && initialQuestion.length <= 500) {
    question = initialQuestion;
  }
  render();
  if (question) {
    void submitRequest({ assessmentId, question });
  }
}
