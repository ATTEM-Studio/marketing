export function renderLandingShell(
  root: HTMLElement,
  onStartDiagnosis: () => void,
): void {
  root.innerHTML = `
    <header class="site-header"><a href="#main">본문 바로가기</a><strong>장사 방향 코치</strong></header>
    <main id="main" class="landing-shell">
      <p class="eyebrow">전자책 구매자 전용</p>
      <h1>순위가 아니라 매출이 막힌 지점을 찾습니다.</h1>
      <p>목표 매출까지 필요한 고객 수를 계산하고, 오늘 할 행동 한 가지를 정합니다.</p>
      <div class="button-row">
        <button type="button" data-action="register" disabled>운영 연결 준비 중<span hidden>구매자 인증</span></button>
        <button type="button" data-action="demo" data-start-diagnosis>샘플로 둘러보기</button>
      </div>
    </main>
    <footer>추천과 진단은 참고 정보이며, 매출을 보장하지 않습니다.</footer>
  `;

  root
    .querySelector<HTMLButtonElement>("[data-start-diagnosis]")
    ?.addEventListener("click", onStartDiagnosis);
}
