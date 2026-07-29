import { AdminApiError } from "../admin/api";
import { diagnosisSections } from "../admin/labels";
import type {
  AdminMemberDetail,
  AdminMemberSummary,
  AdminOverview,
  AdminOverviewQuery,
  DuplicateSeverity,
} from "../admin/types";

export interface AdminDashboardApi {
  overview(query: AdminOverviewQuery): Promise<AdminOverview>;
  member(id: string): Promise<AdminMemberDetail>;
  logout(): Promise<void>;
}

export interface AdminDashboardCallbacks {
  onUnauthorized(): void;
  onLogout(): void;
}

interface AdminDashboardState {
  query: AdminOverviewQuery;
  overview: AdminOverview | null;
  selectedMember: AdminMemberDetail | null;
  loading: "overview" | "detail" | null;
  error: "overview" | "detail" | null;
}

const number = new Intl.NumberFormat("ko-KR");
const duplicateLabels: Record<DuplicateSeverity, string> = {
  high: "중복 가능성 높음",
  review: "확인 필요",
};

function textElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof AdminApiError && error.code === "unauthorized";
}

function appendDuplicateBadge(
  root: HTMLElement,
  duplicate: AdminMemberSummary["duplicate"],
): void {
  if (!duplicate) {
    root.append(
      textElement("span", "중복 없음", "admin-duplicate-badge is-none"),
    );
    return;
  }
  const badge = textElement(
    "span",
    `${duplicateLabels[duplicate.severity]} · ${number.format(duplicate.peerCount)}명`,
    `admin-duplicate-badge is-${duplicate.severity}`,
  );
  root.append(badge);
}

export async function renderAdminDashboard(
  root: HTMLElement,
  adminApi: AdminDashboardApi,
  callbacks: AdminDashboardCallbacks,
): Promise<void> {
  const state: AdminDashboardState = {
    query: { search: "", duplicate: "all", page: 1, pageSize: 25 },
    overview: null,
    selectedMember: null,
    loading: null,
    error: null,
  };
  let active = true;
  let overviewRequest = 0;
  let detailRequest = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let selectedId: string | null = null;
  let selectedTrigger: HTMLElement | null = null;

  root.innerHTML = `
    <main class="admin-dashboard" data-admin-dashboard>
      <header class="admin-dashboard-header">
        <div>
          <p class="eyebrow">운영 현황</p>
          <h1>관리자 대시보드</h1>
        </div>
        <button type="button" class="quiet-button" data-admin-logout>관리자 로그아웃</button>
      </header>
      <p class="sr-only" role="status" aria-live="polite" data-admin-announcement></p>
      <section class="admin-summary-grid" aria-label="가입 회원 요약" data-admin-summary></section>
      <section class="admin-trend-panel">
        <div class="admin-section-heading">
          <div>
            <p class="eyebrow">가입 추이</p>
            <h2>최근 30일</h2>
          </div>
        </div>
        <div class="admin-trend" role="img" aria-label="최근 30일 일별 가입 회원 수" data-admin-trend></div>
      </section>
      <section class="admin-member-panel" aria-labelledby="admin-members-title">
        <div class="admin-section-heading">
          <div>
            <p class="eyebrow">회원 관리</p>
            <h2 id="admin-members-title">최신 가입 회원</h2>
          </div>
          <label class="admin-search">
            <span>회원 검색</span>
            <input type="search" maxlength="100" placeholder="이름, 지역, 상호명, 이메일" data-admin-search>
          </label>
        </div>
        <div class="admin-filter-group" role="group" aria-label="중복 가능성 필터">
          <button type="button" data-duplicate-filter="all" aria-pressed="true">전체</button>
          <button type="button" data-duplicate-filter="high" aria-pressed="false">중복 가능성 높음</button>
          <button type="button" data-duplicate-filter="review" aria-pressed="false">확인 필요</button>
        </div>
        <div class="admin-member-results" data-admin-member-results></div>
        <nav class="admin-pagination" aria-label="회원 목록 페이지">
          <button type="button" class="quiet-button" data-admin-previous-page>이전</button>
          <span data-admin-page aria-live="polite"></span>
          <button type="button" class="quiet-button" data-admin-next-page>다음</button>
        </nav>
      </section>
      <div data-admin-detail-root></div>
    </main>
  `;

  const dashboard = root.querySelector<HTMLElement>("[data-admin-dashboard]");
  const summary = root.querySelector<HTMLElement>("[data-admin-summary]");
  const trend = root.querySelector<HTMLElement>("[data-admin-trend]");
  const results = root.querySelector<HTMLElement>(
    "[data-admin-member-results]",
  );
  const pageLabel = root.querySelector<HTMLElement>("[data-admin-page]");
  const previous = root.querySelector<HTMLButtonElement>(
    "[data-admin-previous-page]",
  );
  const next = root.querySelector<HTMLButtonElement>("[data-admin-next-page]");
  const announcement = root.querySelector<HTMLElement>(
    "[data-admin-announcement]",
  );
  const detailRoot = root.querySelector<HTMLElement>(
    "[data-admin-detail-root]",
  );
  if (
    !dashboard ||
    !summary ||
    !trend ||
    !results ||
    !pageLabel ||
    !previous ||
    !next ||
    !announcement ||
    !detailRoot
  ) {
    return;
  }

  const expireSession = () => {
    if (!active) return;
    active = false;
    overviewRequest += 1;
    detailRequest += 1;
    if (searchTimer) clearTimeout(searchTimer);
    root.replaceChildren();
    callbacks.onUnauthorized();
  };

  const closeDetail = (restoreFocus = true) => {
    detailRequest += 1;
    state.selectedMember = null;
    if (state.loading === "detail") state.loading = null;
    if (state.error === "detail") state.error = null;
    detailRoot.replaceChildren();
    selectedId = null;
    if (
      restoreFocus &&
      selectedTrigger instanceof HTMLElement &&
      selectedTrigger.isConnected
    ) {
      selectedTrigger.focus();
    }
    selectedTrigger = null;
  };

  const renderSummary = (overview: AdminOverview) => {
    summary.replaceChildren();
    const cards = [
      {
        label: "전체 가입 회원",
        value: overview.totals.total,
        period: "total",
        valueAttribute: "totalMembers",
      },
      {
        label: "오늘 가입",
        value: overview.totals.today,
        period: "today",
      },
      {
        label: "최근 7일 가입",
        value: overview.totals.last7Days,
        period: "last7days",
      },
      {
        label: "최근 30일 가입",
        value: overview.totals.last30Days,
        period: "last30days",
      },
    ];
    for (const card of cards) {
      const article = document.createElement("article");
      article.className = "admin-summary-card";
      article.dataset.adminSummaryCard = "";
      article.dataset.period = card.period;
      article.append(textElement("span", card.label, "admin-summary-label"));
      const value = textElement(
        "strong",
        `${number.format(card.value)}명`,
        "admin-summary-value",
      );
      if (card.valueAttribute) value.dataset[card.valueAttribute] = "";
      article.append(value);
      summary.append(article);
    }
  };

  const renderTrend = (overview: AdminOverview) => {
    trend.replaceChildren();
    const list = document.createElement("ol");
    list.className = "admin-trend-bars";
    const maximum = Math.max(1, ...overview.daily.map((day) => day.count));
    for (const day of overview.daily) {
      const item = document.createElement("li");
      const bar = document.createElement("span");
      bar.className = "admin-trend-bar";
      const safeCount = Math.max(0, Number.isFinite(day.count) ? day.count : 0);
      bar.style.setProperty(
        "--admin-bar-height",
        `${Math.round((safeCount / maximum) * 100)}%`,
      );
      bar.setAttribute("aria-hidden", "true");
      item.append(
        bar,
        textElement("span", day.date, "admin-trend-date"),
        textElement(
          "strong",
          `${number.format(safeCount)}명`,
          "admin-trend-count",
        ),
      );
      list.append(item);
    }
    if (overview.daily.length === 0) {
      trend.append(textElement("p", "최근 가입 추이 데이터가 없습니다."));
      return;
    }
    trend.append(list);
  };

  const createMemberRow = (member: AdminMemberSummary) => {
    const row = document.createElement("tr");
    const values = [
      member.name,
      member.region,
      member.businessName,
      member.email,
      member.joinedAt,
    ];
    const labels = ["이름", "지역", "상호명", "이메일", "가입일"];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.dataset.label = labels[index] ?? "";
      if (index === 0) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "admin-member-link";
        button.dataset.memberId = member.id;
        button.textContent = value;
        cell.append(button);
      } else {
        cell.textContent = value;
        if (index === 3) cell.classList.add("long-token");
      }
      row.append(cell);
    });
    const duplicate = document.createElement("td");
    duplicate.dataset.label = "중복 검토";
    appendDuplicateBadge(duplicate, member.duplicate);
    row.append(duplicate);
    return row;
  };

  const renderMembers = (overview: AdminOverview) => {
    results.replaceChildren();
    if (overview.members.length === 0) {
      const empty = textElement(
        "div",
        "조건에 맞는 회원이 없습니다.",
        "admin-empty-state",
      );
      empty.setAttribute("role", "status");
      results.append(empty);
    } else {
      const table = document.createElement("table");
      table.className = "admin-member-table";
      const caption = textElement(
        "caption",
        "최신 가입순 회원 목록",
        "sr-only",
      );
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const label of [
        "이름",
        "지역",
        "상호명",
        "이메일",
        "가입일",
        "중복 검토",
      ]) {
        headRow.append(textElement("th", label));
      }
      head.append(headRow);
      const body = document.createElement("tbody");
      for (const member of overview.members) {
        body.append(createMemberRow(member));
      }
      table.append(caption, head, body);
      results.append(table);
    }
    const lastPage = Math.max(
      1,
      Math.ceil(overview.totalRows / overview.pageSize),
    );
    pageLabel.textContent = `${number.format(overview.page)} / ${number.format(lastPage)} 페이지`;
    previous.disabled = overview.page <= 1;
    next.disabled = overview.page >= lastPage;
  };

  const renderOverviewLoading = () => {
    if (state.overview) {
      announcement.textContent = "회원 목록을 새로 불러오고 있습니다.";
      return;
    }
    summary.innerHTML =
      '<div class="admin-skeleton" aria-hidden="true"></div><div class="admin-skeleton" aria-hidden="true"></div><div class="admin-skeleton" aria-hidden="true"></div><div class="admin-skeleton" aria-hidden="true"></div>';
    trend.innerHTML = '<div class="admin-skeleton" aria-hidden="true"></div>';
    results.innerHTML =
      '<div class="admin-skeleton admin-skeleton-list" aria-hidden="true"></div>';
    announcement.textContent = "관리자 가입 현황을 불러오고 있습니다.";
    previous.disabled = true;
    next.disabled = true;
  };

  const renderOverviewError = () => {
    if (!state.overview) {
      summary.replaceChildren();
      trend.replaceChildren();
    }
    results.replaceChildren();
    const error = document.createElement("div");
    error.className = "admin-error-state";
    error.setAttribute("role", "alert");
    error.append(
      textElement("p", "회원 목록을 불러오지 못했습니다."),
      textElement("p", "잠시 후 다시 시도해 주세요.", "muted"),
    );
    const retry = textElement("button", "다시 시도");
    retry.type = "button";
    retry.dataset.adminListRetry = "";
    error.append(retry);
    results.append(error);
    pageLabel.textContent = "";
    previous.disabled = true;
    next.disabled = true;
  };

  const loadOverview = async () => {
    const request = ++overviewRequest;
    state.loading = "overview";
    state.error = null;
    renderOverviewLoading();
    try {
      const overview = await adminApi.overview({ ...state.query });
      if (!active || request !== overviewRequest) return;
      state.overview = overview;
      state.loading = null;
      renderSummary(overview);
      renderTrend(overview);
      renderMembers(overview);
      announcement.textContent = `${number.format(overview.totalRows)}명의 회원 목록을 불러왔습니다.`;
    } catch (error) {
      if (!active || request !== overviewRequest) return;
      if (isUnauthorized(error)) {
        expireSession();
        return;
      }
      state.loading = null;
      state.error = "overview";
      renderOverviewError();
    }
  };

  const renderDetailError = (panel: HTMLElement) => {
    const content = panel.querySelector<HTMLElement>(
      "[data-admin-detail-content]",
    );
    if (!content) return;
    content.replaceChildren();
    const error = document.createElement("div");
    error.className = "admin-error-state";
    error.setAttribute("role", "alert");
    error.append(
      textElement("p", "회원 상세 정보를 불러오지 못했습니다."),
      textElement("p", "회원 목록은 그대로 유지됩니다.", "muted"),
    );
    const retry = textElement("button", "상세 다시 시도");
    retry.type = "button";
    retry.dataset.adminDetailRetry = "";
    error.append(retry);
    content.append(error);
  };

  const renderDetail = (panel: HTMLElement, detail: AdminMemberDetail) => {
    const content = panel.querySelector<HTMLElement>(
      "[data-admin-detail-content]",
    );
    const heading = panel.querySelector<HTMLElement>(
      "[data-admin-detail-heading]",
    );
    if (!content || !heading) return;
    heading.textContent = detail.profile.name;
    content.replaceChildren();
    const sections = diagnosisSections(detail);
    for (const section of sections) {
      const sectionElement = document.createElement("section");
      sectionElement.className = "admin-detail-section";
      sectionElement.dataset.detailSection = "";
      sectionElement.append(textElement("h3", section.title));
      const list = document.createElement("dl");
      for (const item of section.items) {
        list.append(
          textElement("dt", item.label),
          textElement("dd", item.value, "admin-detail-value"),
        );
      }
      sectionElement.append(list);
      content.append(sectionElement);
    }
    if (detail.duplicatePeers.members.length > 0) {
      const peers = document.createElement("div");
      peers.className = "admin-duplicate-peers";
      peers.append(textElement("h3", "중복 의심 회원"));
      const list = document.createElement("ul");
      for (const member of detail.duplicatePeers.members) {
        const item = document.createElement("li");
        item.append(
          textElement("strong", member.name),
          textElement("span", member.email, "long-token"),
          textElement("span", member.joinedAt),
        );
        list.append(item);
      }
      peers.append(list);
      content.append(peers);
    }
  };

  const loadDetail = async (id: string, panel: HTMLElement) => {
    const request = ++detailRequest;
    state.loading = "detail";
    state.error = null;
    const content = panel.querySelector<HTMLElement>(
      "[data-admin-detail-content]",
    );
    if (content) {
      content.innerHTML =
        '<div class="admin-skeleton admin-skeleton-detail" aria-hidden="true"></div><p role="status" aria-live="polite">회원 상세 정보를 불러오고 있습니다.</p>';
    }
    try {
      const detail = await adminApi.member(id);
      if (
        !active ||
        request !== detailRequest ||
        !panel.isConnected ||
        selectedId !== id
      ) {
        return;
      }
      state.selectedMember = detail;
      state.loading = null;
      renderDetail(panel, detail);
    } catch (error) {
      if (!active || request !== detailRequest || !panel.isConnected) return;
      if (isUnauthorized(error)) {
        expireSession();
        return;
      }
      state.loading = null;
      state.error = "detail";
      renderDetailError(panel);
    }
  };

  const openDetail = (id: string, trigger: HTMLElement) => {
    closeDetail(false);
    selectedId = id;
    selectedTrigger = trigger;
    detailRoot.innerHTML = `
      <div class="admin-detail-backdrop">
        <aside class="admin-detail-drawer" role="dialog" aria-modal="true" aria-label="회원 상세 정보" tabindex="-1">
          <header class="admin-detail-header">
            <div>
              <p class="eyebrow">회원 상세 정보</p>
              <h2 data-admin-detail-heading>불러오는 중</h2>
            </div>
            <button type="button" class="quiet-button" data-admin-detail-close aria-label="회원 상세 닫기">닫기</button>
          </header>
          <div class="admin-detail-content" data-admin-detail-content></div>
        </aside>
      </div>
    `;
    const panel = detailRoot.querySelector<HTMLElement>("[role='dialog']");
    const close = detailRoot.querySelector<HTMLButtonElement>(
      "[data-admin-detail-close]",
    );
    if (!panel || !close) return;
    close.focus();
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDetail();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    void loadDetail(id, panel);
  };

  dashboard.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const member = target.closest<HTMLElement>("[data-member-id]");
    if (member?.dataset.memberId) {
      openDetail(member.dataset.memberId, member);
      return;
    }
    if (target.closest("[data-admin-detail-close]")) {
      closeDetail();
      return;
    }
    if (target.closest("[data-admin-list-retry]")) {
      void loadOverview();
      return;
    }
    if (target.closest("[data-admin-detail-retry]")) {
      const panel = detailRoot.querySelector<HTMLElement>("[role='dialog']");
      if (panel && selectedId) void loadDetail(selectedId, panel);
      return;
    }
    const filter = target.closest<HTMLButtonElement>("[data-duplicate-filter]");
    const duplicate = filter?.dataset.duplicateFilter;
    if (
      filter &&
      (duplicate === "all" || duplicate === "high" || duplicate === "review")
    ) {
      state.query.duplicate = duplicate;
      state.query.page = 1;
      dashboard
        .querySelectorAll<HTMLButtonElement>("[data-duplicate-filter]")
        .forEach((button) => {
          button.setAttribute("aria-pressed", String(button === filter));
        });
      void loadOverview();
      return;
    }
    if (target.closest("[data-admin-previous-page]") && state.query.page > 1) {
      state.query.page -= 1;
      void loadOverview();
      return;
    }
    if (target.closest("[data-admin-next-page]") && !next.disabled) {
      state.query.page += 1;
      void loadOverview();
    }
  });

  const search = dashboard.querySelector<HTMLInputElement>(
    "[data-admin-search]",
  );
  search?.addEventListener("input", () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query.search = search.value.slice(0, 100);
      state.query.page = 1;
      void loadOverview();
    }, 300);
  });

  const logout = dashboard.querySelector<HTMLButtonElement>(
    "[data-admin-logout]",
  );
  logout?.addEventListener("click", async () => {
    if (logout.disabled) return;
    logout.disabled = true;
    announcement.textContent = "관리자 세션에서 로그아웃하고 있습니다.";
    try {
      await adminApi.logout();
      if (!active) return;
      active = false;
      root.replaceChildren();
      callbacks.onLogout();
    } catch (error) {
      if (!active) return;
      if (isUnauthorized(error)) {
        expireSession();
        return;
      }
      announcement.textContent =
        "관리자 로그아웃에 실패했습니다. 다시 시도해 주세요.";
      logout.disabled = false;
      logout.focus();
    }
  });

  await loadOverview();
}
