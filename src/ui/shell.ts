export interface LandingCallbacks {
  onRegister(): void;
  onLogin(): void;
  onDemo(): void;
}

export interface LandingOptions {
  mode: "demo" | "live";
  available?: boolean;
}

export function renderLandingShell(
  root: HTMLElement,
  callbacks: LandingCallbacks,
  options: LandingOptions,
): void {
  const live = options.mode === "live";
  const available = options.available ?? true;
  root.innerHTML = `
    <div class="brand-page">
      <header class="site-header">
        <a class="skip-link" href="#main">본문 바로가기</a>
        <a class="brand-mark" href="#main" aria-label="장사네비게이션 홈">
          <span class="brand-symbol" aria-hidden="true">N</span>
          <strong>장사네비게이션</strong>
        </a>
        ${live ? '<span class="demo-badge">전자책 구매자 전용</span>' : '<span class="demo-badge">샘플 모드</span>'}
      </header>
      <main id="main" class="landing-shell">
        <section class="hero-copy">
          <p class="eyebrow">매출 목표를 행동으로 바꾸는 가게 코치</p>
          <h1>목표 매출까지,<br><strong>필요한 고객 수와 오늘 할 일</strong>을 찾습니다.</h1>
          <p class="hero-description">가게의 현재 수치를 입력하면 목표까지 필요한 고객 수를 계산하고, 지금 먼저 바꿀 행동 하나를 안내합니다.</p>
          <div class="button-row">
            <button type="button" class="primary-cta" ${live ? "data-start-registration" : "data-start-diagnosis"}${available ? "" : " disabled"}>${available ? "내 가게 진단 시작하기" : "운영 연결 준비 중"}</button>
          </div>
          <ul class="trust-list" aria-label="이용 안내">
            <li>약 3분</li>
            <li>카드정보 불필요</li>
            <li>매장 맞춤 안내</li>
          </ul>
        </section>
        <ol class="journey-preview" aria-label="장사네비게이션 이용 순서">
          <li><span>01</span><strong>목표 매출 설정</strong><small>원하는 월 매출을 정해요</small></li>
          <li><span>02</span><strong>필요 고객 수 확인</strong><small>매장 수치로 부족분을 계산해요</small></li>
          <li><span>03</span><strong>오늘의 행동 선택</strong><small>가장 먼저 할 일 하나를 골라요</small></li>
        </ol>
      </main>
      <footer class="brand-footer">추천과 진단은 참고 정보이며, 매출을 보장하지 않습니다.</footer>
    </div>
  `;

  if (!available) return;
  root
    .querySelector<HTMLButtonElement>("[data-start-registration]")
    ?.addEventListener("click", callbacks.onRegister);
  root
    .querySelector<HTMLButtonElement>("[data-start-diagnosis]")
    ?.addEventListener("click", callbacks.onDemo);
}
