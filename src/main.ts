import "./styles.css";

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <header class="site-header"><a href="#main">본문 바로가기</a><strong>장사 방향 코치</strong></header>
    <main id="main" class="landing-shell">
      <p class="eyebrow">전자책 구매자 전용</p>
      <h1>순위가 아니라 매출이 막힌 지점을 찾습니다.</h1>
      <p>목표 매출에서 필요한 손님 규모를 계산하고 오늘 할 행동 하나를 정해드립니다.</p>
      <div class="button-row">
        <button type="button" data-action="register">구매자 인증 시작</button>
        <button type="button" data-action="demo">샘플로 둘러보기</button>
      </div>
    </main>
    <footer>추천은 판단을 돕는 참고 정보이며 매출을 보장하지 않습니다.</footer>
  `;
}

const root = document.querySelector<HTMLElement>("#app");
if (root) mountApp(root);
