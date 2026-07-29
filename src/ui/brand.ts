export function brandMarkup(homeHref: string): string {
  return `<span class="brand-mark"><button type="button" class="brand-symbol brand-logo-button" data-admin-trigger aria-label="장사네비게이션 로고">N</button><a class="brand-name" href="${homeHref}"><strong>장사네비게이션</strong></a></span>`;
}
